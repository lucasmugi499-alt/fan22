import { createHash, randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { parseJsonBody, requireAuthenticatedUser, requireRole, type AuthenticatedActor } from '@/server/api/security';
import { sendTeamInvitationEmail } from '@/server/email/teamInvitation';

export const runtime = 'nodejs';

function audit(
  actorUserId: string,
  action: string,
  targetCollection: string,
  targetId: string,
  note?: string,
) {
  return {
    actorUserId,
    action,
    targetCollection,
    targetId,
    ...(note ? { note } : {}),
    createdAt: FieldValue.serverTimestamp(),
  };
}

function hasRole(actor: AuthenticatedActor, roles: string[]) {
  return roles.includes(String(actor.role));
}

function publicBaseUrl(request: Request) {
  return process.env.GOALPLACE_APP_BASE_URL
    ?? process.env.NEXT_PUBLIC_APP_URL
    ?? new URL(request.url).origin;
}

const adminActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_team_invitation'),
    teamId: z.string().trim().min(1).max(160),
    leagueId: z.string().trim().min(1).max(160),
    seasonId: z.string().trim().min(1).max(160),
    invitedEmail: z.string().trim().email().max(200).transform((value) => value.toLowerCase()),
  }),
  z.object({
    action: z.literal('review_approval'),
    targetCollection: z.enum(['athletes', 'leagues', 'leagueAdminApplications']),
    targetId: z.string().trim().min(1).max(160),
    decision: z.enum(['approved', 'rejected', 'requested_information']),
    note: z.string().trim().max(1200).optional().default(''),
  }),
  z.object({
    action: z.literal('resolve_report'),
    reportId: z.string().trim().min(1).max(160),
    decision: z.enum(['resolved', 'dismissed']),
    note: z.string().trim().max(1200).optional().default(''),
  }),
]);

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;

  const parsed = await parseJsonBody(request, adminActionSchema, { maxBytes: 8 * 1024 });
  if ('response' in parsed) return parsed.response;

  const actor = auth.actor;
  const body = parsed.data;

  try {
    if (body.action === 'create_team_invitation') {
      const forbidden = requireRole(actor, ['league_admin', 'platform_admin', 'super_admin'], 'League Admin access required.');
      if (forbidden) return forbidden;
      const { teamId, leagueId, seasonId, invitedEmail } = body;
      const league = await adminDb.collection('leagues').doc(leagueId).get();
      const leagueData = league.data();
      if (
        !hasRole(actor, ['platform_admin', 'super_admin'])
        && !leagueData?.adminUserIds?.includes(actor.uid)
      ) {
        return Response.json({ error: 'You do not manage this league.' }, { status: 403 });
      }
      const team = await adminDb.collection('teams').doc(teamId).get();
      const teamData = team.data();
      if (!team.exists || teamData?.leagueId !== leagueId) {
        return Response.json({ error: 'The selected team does not belong to this league.' }, { status: 409 });
      }
      const season = await adminDb.collection('seasons').doc(seasonId).get();
      const seasonData = season.data();

      const invitationKey = createHash('sha256')
        .update(`${leagueId}:${seasonId}:${teamId}:${invitedEmail}`)
        .digest('hex')
        .slice(0, 32);
      const invitationRef = adminDb.collection('teamAssignments').doc(`invite_${invitationKey}`);
      const token = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const actionUrl = `/invitations/team/${invitationRef.id}?token=${encodeURIComponent(token)}`;
      await adminDb.runTransaction(async (transaction) => {
        const existing = await transaction.get(invitationRef);
        if (
          existing.exists
          && ['invited', 'active'].includes(String(existing.data()?.status))
          && (!existing.data()?.expiresAt || Date.parse(existing.data()!.expiresAt) > Date.now())
        ) {
          throw new Error('An active invitation already exists for this email, team, and season.');
        }
        transaction.set(invitationRef, {
          id: invitationRef.id,
          userId: '',
          teamId,
          leagueId,
          seasonId,
          role: 'team_admin',
          status: 'invited',
          invitedByUserId: actor.uid,
          invitedEmail,
          tokenHash,
          expiresAt,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(adminDb.collection('adminAuditEvents').doc(), audit(
          actor.uid,
          'invited',
          'teamAssignments',
          invitationRef.id,
          `Invitation expires ${expiresAt}.`,
        ));
      });
      const email = await sendTeamInvitationEmail({
        to: invitedEmail,
        inviteUrl: new URL(actionUrl, publicBaseUrl(request)).toString(),
        assignmentId: invitationRef.id,
        teamName: String(teamData?.name ?? teamId),
        leagueName: String(leagueData?.name ?? leagueId),
        seasonName: String(seasonData?.name ?? seasonId),
        inviterName: String(actor.name ?? actor.email ?? 'your League Admin'),
        expiresAt,
      });
      await invitationRef.set({
        emailProvider: 'resend',
        emailDelivery: email.status,
        ...(email.id ? {
          emailMessageId: email.id,
          emailSentAt: FieldValue.serverTimestamp(),
        } : {}),
        ...(email.error ? { emailError: email.error.slice(0, 500) } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return Response.json({
        ok: true,
        id: invitationRef.id,
        token,
        expiresAt,
        actionUrl,
        emailDelivery: email.status,
        emailMessageId: email.id,
        emailError: email.error,
      });
    }

    if (body.action === 'review_approval') {
      const forbidden = requireRole(actor, ['platform_admin', 'super_admin'], 'Platform Admin access required.');
      if (forbidden) return forbidden;
      const { targetCollection, targetId, decision, note } = body;
      if (targetCollection === 'leagueAdminApplications' && decision === 'approved') {
        return Response.json({ error: 'League Admin approval uses the access workflow.' }, { status: 409 });
      }
      const targetRef = adminDb.collection(targetCollection).doc(targetId);
      await adminDb.runTransaction(async (transaction) => {
        const target = await transaction.get(targetRef);
        if (!target.exists) throw new Error('Target record not found.');
        const update = targetCollection === 'athletes'
          ? { verified: decision === 'approved', verificationStatus: decision === 'approved' ? 'verified' : 'pending' }
          : targetCollection === 'leagues'
            ? { verified: decision === 'approved', status: decision === 'approved' ? 'verified' : 'draft' }
            : {
                status: decision === 'requested_information' ? 'needs_information' : decision,
                reviewedByUserId: actor.uid,
              };
        transaction.update(targetRef, { ...update, updatedAt: FieldValue.serverTimestamp() });
        transaction.set(adminDb.collection('adminAuditEvents').doc(), audit(
          actor.uid,
          decision,
          targetCollection,
          targetId,
          note,
        ));
      });
      return Response.json({ ok: true, id: targetId });
    }

    if (body.action === 'resolve_report') {
      const forbidden = requireRole(actor, ['platform_admin', 'super_admin'], 'Platform Admin access required.');
      if (forbidden) return forbidden;
      const { reportId, decision, note } = body;
      const reportRef = adminDb.collection('reports').doc(reportId);
      await adminDb.runTransaction(async (transaction) => {
        const report = await transaction.get(reportRef);
        if (!report.exists) throw new Error('Report not found.');
        transaction.update(reportRef, {
          status: decision,
          updatedAt: FieldValue.serverTimestamp(),
          ...(note ? { actionHistory: FieldValue.arrayUnion(note) } : {}),
        });
        transaction.set(adminDb.collection('adminAuditEvents').doc(), audit(
          actor.uid,
          decision,
          'reports',
          reportId,
          note,
        ));
      });
      return Response.json({ ok: true, id: reportId });
    }

    return Response.json({ error: 'Unsupported admin action.' }, { status: 400 });
  } catch (error) {
    console.error('Trusted admin action failed', error);
    return Response.json({
      error: error instanceof Error ? error.message : 'The trusted action failed.',
    }, { status: 500 });
  }
}
