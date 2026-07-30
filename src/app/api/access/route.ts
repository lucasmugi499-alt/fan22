import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { parseJsonBody, requireAuthenticatedUser, requireRole } from '@/server/api/security';

export const runtime = 'nodejs';

const PRIVILEGED_ROLES = ['league_admin', 'platform_admin', 'super_admin'];

const accessActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('accept_team_invitation'),
    assignmentId: z.string().trim().min(1).max(180),
    token: z.string().trim().min(20).max(512),
  }),
  z.object({
    action: z.literal('approve_league_admin'),
    applicationId: z.string().trim().min(1).max(180),
  }),
]);

async function synchronizeRoleClaim(uid: string, role: 'team_admin' | 'league_admin') {
  const account = await adminAuth.getUser(uid);
  const currentRole = typeof account.customClaims?.role === 'string' ? account.customClaims.role : 'fan';
  const nextRole = role === 'team_admin' && PRIVILEGED_ROLES.includes(currentRole) ? currentRole : role;
  await adminAuth.setCustomUserClaims(uid, {
    ...(account.customClaims ?? {}),
    role: nextRole,
  });
  return nextRole;
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;

  const parsed = await parseJsonBody(request, accessActionSchema, { maxBytes: 4 * 1024 });
  if ('response' in parsed) return parsed.response;

  const actor = auth.actor;
  const body = parsed.data;

  try {
    if (body.action === 'accept_team_invitation') {
      if (actor.email_verified !== true) {
        return Response.json({ error: 'Verify your email address before accepting an invitation.' }, { status: 403 });
      }
      const assignmentRef = adminDb.collection('teamAssignments').doc(body.assignmentId);
      const assignment = await assignmentRef.get();
      if (!assignment.exists) return Response.json({ error: 'Invitation not found.' }, { status: 404 });
      const data = assignment.data()!;
      const suppliedTokenHash = createHash('sha256').update(body.token).digest('hex');
      if (!data.tokenHash || suppliedTokenHash !== data.tokenHash) {
        return Response.json({ error: 'This invitation link is invalid.' }, { status: 403 });
      }
      if (data.expiresAt && Date.parse(data.expiresAt) <= Date.now()) {
        return Response.json({ error: 'This invitation has expired. Ask the League Admin for a new one.' }, { status: 410 });
      }
      if (data.userId && data.userId !== actor.uid) return Response.json({ error: 'This invitation belongs to another account.' }, { status: 403 });
      if (data.invitedEmail && data.invitedEmail.toLowerCase() !== actor.email?.toLowerCase()) {
        return Response.json({ error: 'Sign in with the email address that received this invitation.' }, { status: 403 });
      }
      if (data.status === 'active' && data.userId === actor.uid) {
        const role = await synchronizeRoleClaim(actor.uid, 'team_admin');
        return Response.json({ ok: true, role });
      }
      if (data.status !== 'invited') return Response.json({ error: 'Invitation is no longer active.' }, { status: 409 });

      await adminDb.runTransaction(async (transaction) => {
        const current = await transaction.get(assignmentRef);
        if (!current.exists || current.data()?.status !== 'invited') {
          throw new Error('Invitation is no longer active.');
        }
        transaction.update(assignmentRef, {
          userId: actor.uid,
          status: 'active',
          acceptedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(adminDb.collection('teams').doc(data.teamId), {
          adminUserIds: FieldValue.arrayUnion(actor.uid),
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (!PRIVILEGED_ROLES.includes(String(actor.role ?? ''))) {
          transaction.set(adminDb.collection('users').doc(actor.uid), {
            role: 'team_admin',
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
        transaction.set(adminDb.collection('adminAuditEvents').doc(), {
          actorUserId: actor.uid,
          action: 'accepted',
          targetCollection: 'teamAssignments',
          targetId: assignment.id,
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      const role = await synchronizeRoleClaim(actor.uid, 'team_admin');
      return Response.json({ ok: true, role });
    }

    if (body.action === 'approve_league_admin') {
      const forbidden = requireRole(actor, ['platform_admin', 'super_admin'], 'Platform Admin access required.');
      if (forbidden) return forbidden;
      const applicationRef = adminDb.collection('leagueAdminApplications').doc(body.applicationId);
      const application = await applicationRef.get();
      if (!application.exists) return Response.json({ error: 'Application not found.' }, { status: 404 });
      const data = application.data()!;
      if (data.status === 'approved' && data.leagueId) {
        await synchronizeRoleClaim(data.userId, 'league_admin');
        return Response.json({ ok: true, role: 'league_admin', leagueId: data.leagueId });
      }
      if (!['pending', 'needs_information'].includes(data.status)) {
        return Response.json({ error: 'Application has already been decided.' }, { status: 409 });
      }
      const applicant = await adminAuth.getUser(data.userId);
      if (!applicant.emailVerified) {
        return Response.json({ error: 'The applicant must verify their email before approval.' }, { status: 409 });
      }
      const leagueId = `league_${application.id}`;

      await adminDb.runTransaction(async (transaction) => {
        const current = await transaction.get(applicationRef);
        if (!current.exists || !['pending', 'needs_information'].includes(current.data()?.status)) {
          throw new Error('Application has already been decided.');
        }
        transaction.set(adminDb.collection('leagues').doc(leagueId), {
          id: leagueId,
          name: data.leagueName,
          sport: data.sport,
          city: data.city,
          country: 'Uganda',
          description: `${data.leagueName} is preparing its first GoalPlace256 season.`,
          status: 'draft',
          plan: 'free',
          verified: false,
          adminUserIds: [data.userId],
          season: 'Not launched',
          teamsCount: 0,
          athletesCount: 0,
          matchesCount: 0,
          matchCompletionRate: 0,
          verifiedResultsRate: 0,
          goalPlaceIndex: 0,
          totalSupport: 0,
          supportersCount: 0,
          verificationRules: {
            requiresLeagueAdminApproval: true,
            requiresRefereeConfirmation: false,
            allowsPerformancePledges: false,
          },
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.update(applicationRef, {
          status: 'approved',
          reviewedByUserId: actor.uid,
          leagueId,
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(adminDb.collection('users').doc(data.userId), {
          role: 'league_admin',
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(adminDb.collection('adminAuditEvents').doc(), {
          actorUserId: actor.uid,
          action: 'approved',
          targetCollection: 'leagueAdminApplications',
          targetId: application.id,
          note: `Created ${leagueId} and granted League Admin access.`,
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      await synchronizeRoleClaim(data.userId, 'league_admin');
      return Response.json({ ok: true, role: 'league_admin', leagueId });
    }

    return Response.json({ error: 'Unsupported access action.' }, { status: 400 });
  } catch (error) {
    console.error('Trusted access action failed', error);
    return Response.json({ error: 'GoalPlace256 could not complete this access action.' }, { status: 500 });
  }
}
