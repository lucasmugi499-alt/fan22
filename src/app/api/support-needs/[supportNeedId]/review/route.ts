import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import type { AppRole, SupportNeed } from '@/types';

export const runtime = 'nodejs';

const bodySchema = z.object({
  supportNeedId: z.string().min(1),
  actorUserId: z.string().min(1),
  action: z.enum(['team_verify', 'team_reject', 'league_approve', 'league_reject']),
  note: z.string().trim().max(1000).optional(),
});

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ supportNeedId: string }> },
) {
  const token = bearerToken(request);
  const actor = token ? await adminAuth.verifyIdToken(token).catch(() => null) : null;
  if (!actor) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid support need review.' }, { status: 400 });
  const input = parsed.data;
  const { supportNeedId } = await params;
  if (supportNeedId !== input.supportNeedId || actor.uid !== input.actorUserId) {
    return Response.json({ error: 'Review attribution is invalid.' }, { status: 403 });
  }

  try {
    const needRef = adminDb.collection('supportNeeds').doc(supportNeedId);
    const needSnapshot = await needRef.get();
    if (!needSnapshot.exists) return Response.json({ error: 'Support need not found.' }, { status: 404 });
    const need = { id: needSnapshot.id, ...needSnapshot.data() } as SupportNeed;
    const athleteSnapshot = need.athleteId
      ? await adminDb.collection('athletes').doc(need.athleteId).get()
      : null;
    const teamId = need.teamId ?? athleteSnapshot?.data()?.teamId;
    const [teamSnapshot, leagueSnapshot] = await Promise.all([
      teamId ? adminDb.collection('teams').doc(teamId).get() : Promise.resolve(null),
      adminDb.collection('leagues').doc(need.leagueId).get(),
    ]);
    const role = typeof actor.role === 'string' ? actor.role as AppRole : 'fan';
    const isPlatform = role === 'platform_admin' || role === 'super_admin';
    const isTeamAdmin = Array.isArray(teamSnapshot?.data()?.adminUserIds) &&
      teamSnapshot!.data()!.adminUserIds.includes(actor.uid);
    const isLeagueAdmin = Array.isArray(leagueSnapshot.data()?.adminUserIds) &&
      leagueSnapshot.data()!.adminUserIds.includes(actor.uid);
    const teamAction = input.action === 'team_verify' || input.action === 'team_reject';
    if (teamAction && !isTeamAdmin && !isPlatform) {
      return Response.json({ error: 'Only the recipient’s Team Admin can verify this need.' }, { status: 403 });
    }
    if (!teamAction && !isLeagueAdmin && !isPlatform) {
      return Response.json({ error: 'Only the owning League Admin can approve publication.' }, { status: 403 });
    }
    if (need.createdByUserId === actor.uid) {
      return Response.json({ error: 'The need creator cannot approve their own request.' }, { status: 409 });
    }
    if (!teamAction && need.teamVerifiedByUserId === actor.uid) {
      return Response.json({ error: 'League publication requires a separate reviewer.' }, { status: 409 });
    }
    if (!input.action.endsWith('approve') && !input.action.endsWith('verify') && !input.note) {
      return Response.json({ error: 'A rejection requires a written reason.' }, { status: 400 });
    }

    const expectedStatus = teamAction ? 'proposed' : 'team_verified';
    const nextApprovalStatus = input.action === 'team_verify'
      ? 'team_verified'
      : input.action === 'league_approve'
        ? 'league_approved'
        : 'rejected';
    await adminDb.runTransaction(async (transaction) => {
      const currentSnapshot = await transaction.get(needRef);
      if (!currentSnapshot.exists) throw new Error('Support need disappeared during review.');
      const current = currentSnapshot.data() as SupportNeed;
      if (current.approvalStatus !== expectedStatus) {
        throw new Error(`Support need is no longer awaiting ${teamAction ? 'team' : 'league'} review.`);
      }
      const rejected = nextApprovalStatus === 'rejected';
      const updates: Record<string, unknown> = {
        approvalStatus: nextApprovalStatus,
        verificationStatus: nextApprovalStatus === 'league_approved'
          ? 'verified'
          : rejected
            ? 'rejected'
            : 'pending',
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (input.action === 'team_verify') updates.teamVerifiedByUserId = actor.uid;
      if (input.action === 'league_approve') updates.leagueApprovedByUserId = actor.uid;
      if (rejected) updates.status = 'cancelled';
      transaction.update(needRef, updates);

      const approvalRef = adminDb.collection('supportNeedApprovals').doc();
      transaction.create(approvalRef, {
        id: approvalRef.id,
        supportNeedId,
        athleteId: need.athleteId ?? null,
        teamId: teamId ?? null,
        leagueId: need.leagueId,
        stage: teamAction ? 'team_verification' : 'league_publication',
        decision: rejected ? 'rejected' : 'approved',
        actorUserId: actor.uid,
        actorRole: isPlatform ? 'platform_admin' : teamAction ? 'team_admin' : 'league_admin',
        note: input.note ?? '',
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return Response.json({ ok: true, status: nextApprovalStatus });
  } catch (error) {
    console.error('Support need review failed', error);
    return Response.json({
      error: error instanceof Error ? error.message : 'Support need review failed.',
    }, { status: 409 });
  }
}
