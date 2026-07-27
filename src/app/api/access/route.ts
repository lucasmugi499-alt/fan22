import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
}

async function actorFor(request: Request) {
  const token = bearerToken(request);
  if (!token) return null;
  return adminAuth.verifyIdToken(token).catch(() => null);
}

async function synchronizeRoleClaim(uid: string, role: 'team_admin' | 'league_admin') {
  const account = await adminAuth.getUser(uid);
  await adminAuth.setCustomUserClaims(uid, {
    ...(account.customClaims ?? {}),
    role,
  });
}

export async function POST(request: Request) {
  const actor = await actorFor(request);
  if (!actor) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as {
    action?: 'accept_team_invitation' | 'approve_league_admin';
    assignmentId?: string;
    applicationId?: string;
  };

  try {
    if (body.action === 'accept_team_invitation') {
      if (actor.email_verified !== true) {
        return Response.json({ error: 'Verify your email address before accepting an invitation.' }, { status: 403 });
      }
      if (!body.assignmentId) return Response.json({ error: 'Invitation is required.' }, { status: 400 });
      const assignmentRef = adminDb.collection('teamAssignments').doc(body.assignmentId);
      const assignment = await assignmentRef.get();
      if (!assignment.exists) return Response.json({ error: 'Invitation not found.' }, { status: 404 });
      const data = assignment.data()!;
      if (data.userId && data.userId !== actor.uid) return Response.json({ error: 'This invitation belongs to another account.' }, { status: 403 });
      if (data.invitedEmail && data.invitedEmail.toLowerCase() !== actor.email?.toLowerCase()) {
        return Response.json({ error: 'Sign in with the email address that received this invitation.' }, { status: 403 });
      }
      if (data.status === 'active' && data.userId === actor.uid) {
        await synchronizeRoleClaim(actor.uid, 'team_admin');
        return Response.json({ ok: true, role: 'team_admin' });
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
        transaction.set(adminDb.collection('users').doc(actor.uid), {
          role: 'team_admin',
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(adminDb.collection('adminAuditEvents').doc(), {
          actorUserId: actor.uid,
          action: 'accepted',
          targetCollection: 'teamAssignments',
          targetId: assignment.id,
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      await synchronizeRoleClaim(actor.uid, 'team_admin');
      return Response.json({ ok: true, role: 'team_admin' });
    }

    if (body.action === 'approve_league_admin') {
      if (!['platform_admin', 'super_admin'].includes(String(actor.role))) {
        return Response.json({ error: 'Platform Admin access required.' }, { status: 403 });
      }
      if (!body.applicationId) return Response.json({ error: 'Application is required.' }, { status: 400 });
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
            allowsPerformancePledges: true,
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
