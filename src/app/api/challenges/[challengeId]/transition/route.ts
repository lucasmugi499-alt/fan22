import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import {
  challengeNextStatus,
  challengeActionMatchesFundingModel,
  roleCanTransitionChallenge,
  type ChallengeAction,
} from '@/lib/challenge';
import { requireAuthenticatedMutation } from '@/server/api/security';
import type { AppRole, Challenge } from '@/types';

export const runtime = 'nodejs';

const bodySchema = z.object({
  challengeId: z.string().trim().min(1).max(180),
  actorUserId: z.string().trim().min(1).max(180),
  action: z.enum([
    'team_approve',
    'team_reject',
    'league_approve',
    'activate_non_cash',
    'commit_grant',
    'open_funding',
    'lock_funding',
    'start_challenge',
    'submit_evidence',
    'begin_review',
    'mark_achieved',
    'mark_not_achieved',
    'mark_void',
    'prepare_allocation',
    'settle',
    'close_non_cash',
  ]),
  note: z.string().trim().max(1000).optional(),
  evidenceRefs: z.array(z.string().trim().min(1).max(500)).max(12).optional(),
});

function approvalDetails(action: ChallengeAction) {
  if (action === 'team_approve' || action === 'team_reject') {
    return {
      stage: 'team_feasibility',
      decision: action === 'team_approve' ? 'approved' : 'rejected',
      actorRole: 'team_admin',
    };
  }
  if (action === 'league_approve') {
    return { stage: 'league_rules', decision: 'approved', actorRole: 'league_admin' };
  }
  if (action === 'mark_achieved') {
    return { stage: 'outcome', decision: 'achieved', actorRole: 'league_admin' };
  }
  if (action === 'mark_not_achieved') {
    return { stage: 'outcome', decision: 'not_achieved', actorRole: 'league_admin' };
  }
  if (action === 'mark_void') {
    return { stage: 'outcome', decision: 'void', actorRole: 'league_admin' };
  }
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  const guarded = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 4 * 1024,
    invalidBodyError: 'Invalid challenge action.',
    rateLimit: { bucket: 'challenge_transition', limit: 20, windowSeconds: 300 },
  });
  if ('response' in guarded) return guarded.response;
  const actor = guarded.actor;
  const parsed = { data: guarded.data };
  const input = parsed.data;
  const { challengeId } = await params;
  if (challengeId !== input.challengeId || actor.uid !== input.actorUserId) {
    return Response.json({ error: 'Challenge action attribution is invalid.' }, { status: 403 });
  }

  try {
    const challengeRef = adminDb.collection('challenges').doc(challengeId);
    const challengeSnapshot = await challengeRef.get();
    if (!challengeSnapshot.exists) {
      return Response.json({ error: 'Challenge not found.' }, { status: 404 });
    }
    const challenge = { id: challengeSnapshot.id, ...challengeSnapshot.data() } as Challenge;
    const athleteSnapshot = await adminDb.collection('athletes').doc(challenge.athleteId).get();
    if (!athleteSnapshot.exists) {
      return Response.json({ error: 'Challenge athlete not found.' }, { status: 409 });
    }
    const athlete = athleteSnapshot.data()!;
    const [teamSnapshot, leagueSnapshot] = await Promise.all([
      adminDb.collection('teams').doc(athlete.teamId).get(),
      adminDb.collection('leagues').doc(challenge.leagueId).get(),
    ]);

    const tokenRole = typeof actor.role === 'string' ? actor.role as AppRole : 'fan';
    const isPlatform = tokenRole === 'platform_admin' || tokenRole === 'super_admin';
    const isAthlete = athlete.userId === actor.uid;
    const isTeamAdmin = Array.isArray(teamSnapshot.data()?.adminUserIds) &&
      teamSnapshot.data()!.adminUserIds.includes(actor.uid);
    const isLeagueAdmin = Array.isArray(leagueSnapshot.data()?.adminUserIds) &&
      leagueSnapshot.data()!.adminUserIds.includes(actor.uid);
    const effectiveRole: AppRole = isPlatform
      ? tokenRole
      : isLeagueAdmin
        ? 'league_admin'
        : isTeamAdmin
          ? 'team_admin'
          : isAthlete
            ? 'athlete'
            : tokenRole;

    if (!roleCanTransitionChallenge(effectiveRole, input.action)) {
      return Response.json({ error: 'Your role cannot perform this challenge action.' }, { status: 403 });
    }
    if (!challengeActionMatchesFundingModel(challenge.fundingModel, input.action)) {
      return Response.json({ error: 'This action does not apply to this challenge funding model.' }, { status: 409 });
    }
    if (input.action.startsWith('team_') && !isTeamAdmin && !isPlatform) {
      return Response.json({ error: 'Only this athlete’s Team Admin can review feasibility.' }, { status: 403 });
    }
    const leagueActions: ChallengeAction[] = [
      'league_approve',
      'activate_non_cash',
      'commit_grant',
      'open_funding',
      'lock_funding',
      'start_challenge',
      'begin_review',
      'mark_achieved',
      'mark_not_achieved',
      'mark_void',
    ];
    if (leagueActions.includes(input.action) && !isLeagueAdmin && !isPlatform) {
      return Response.json({ error: 'Only the owning league can perform this action.' }, { status: 403 });
    }
    if (input.action === 'submit_evidence' && !isAthlete && !isTeamAdmin && !isPlatform) {
      return Response.json({ error: 'Only the athlete or Team Admin can submit evidence.' }, { status: 403 });
    }
    if (['prepare_allocation', 'settle', 'close_non_cash'].includes(input.action) && !isPlatform) {
      return Response.json({ error: 'Settlement is restricted to the trusted platform service.' }, { status: 403 });
    }
    if (input.action === 'submit_evidence' && !(input.evidenceRefs?.length || input.note)) {
      return Response.json({ error: 'Evidence or an evidence note is required.' }, { status: 400 });
    }
    if (input.action.startsWith('mark_') && !input.note) {
      return Response.json({ error: 'An outcome decision requires a written reason.' }, { status: 400 });
    }
    if (['team_approve', 'team_reject'].includes(input.action) && challenge.submittedBy === actor.uid) {
      return Response.json({ error: 'The challenge proposer cannot approve feasibility.' }, { status: 409 });
    }
    if (input.action === 'league_approve' &&
      [challenge.submittedBy, challenge.teamApprovedByUserId].includes(actor.uid)) {
      return Response.json({ error: 'League approval requires a separate reviewer.' }, { status: 409 });
    }
    if (input.action.startsWith('mark_') &&
      [challenge.submittedBy, challenge.teamApprovedByUserId].includes(actor.uid)) {
      return Response.json({ error: 'The proposer or Team Admin cannot verify the outcome.' }, { status: 409 });
    }
    if (
      (challenge.sponsorGrantAmountMinor ?? 0) > 5_000_000 &&
      input.action.startsWith('mark_') &&
      !isPlatform
    ) {
      return Response.json({ error: 'High-value outcomes require Platform Admin review.' }, { status: 409 });
    }
    if (input.action === 'settle' && challenge.outcomeVerifiedByUserId === actor.uid) {
      return Response.json({ error: 'The outcome verifier cannot approve settlement.' }, { status: 409 });
    }

    const nextStatus = challengeNextStatus(challenge.status, input.action);
    await adminDb.runTransaction(async (transaction) => {
      const currentSnapshot = await transaction.get(challengeRef);
      if (!currentSnapshot.exists) throw new Error('Challenge disappeared during review.');
      const current = { id: currentSnapshot.id, ...currentSnapshot.data() } as Challenge;
      const transactionStatus = challengeNextStatus(current.status, input.action);
      if (transactionStatus !== nextStatus) throw new Error('Challenge changed during review.');

      const updates: Record<string, unknown> = {
        status: nextStatus,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (input.action === 'team_approve') updates.teamApprovedByUserId = actor.uid;
      if (input.action === 'league_approve') updates.leagueApprovedByUserId = actor.uid;
      if (['open_funding', 'activate_non_cash'].includes(input.action)) updates.termsLockedAt = FieldValue.serverTimestamp();
      if (['lock_funding', 'commit_grant'].includes(input.action)) updates.fundingLockedAt = FieldValue.serverTimestamp();
      if (input.action === 'submit_evidence') {
        updates.evidenceRefs = input.evidenceRefs ?? [];
        updates.evidenceNote = input.note ?? '';
      }
      if (input.action.startsWith('mark_')) {
        updates.outcomeVerifiedByUserId = actor.uid;
        updates.outcomeNote = input.note;
        updates.verificationStatus = input.action === 'mark_achieved' ? 'verified' : 'rejected';
      }
      transaction.update(challengeRef, updates);

      const approval = approvalDetails(input.action);
      if (approval) {
        const approvalRef = adminDb.collection('challengeApprovals').doc();
        transaction.create(approvalRef, {
          id: approvalRef.id,
          challengeId,
          athleteId: challenge.athleteId,
          teamId: athlete.teamId,
          leagueId: challenge.leagueId,
          ...approval,
          actorRole: isPlatform ? 'platform_admin' : approval.actorRole,
          actorUserId: actor.uid,
          note: input.note ?? '',
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      const eventRef = challengeRef.collection('events').doc();
      transaction.create(eventRef, {
        id: eventRef.id,
        challengeId,
        action: input.action,
        from: current.status,
        to: nextStatus,
        actorUserId: actor.uid,
        actorRole: effectiveRole,
        note: input.note ?? '',
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return Response.json({ ok: true, status: nextStatus });
  } catch (error) {
    console.error('Challenge transition failed', error);
    return Response.json({
      error: error instanceof Error ? error.message : 'Challenge action failed.',
    }, { status: 409 });
  }
}
