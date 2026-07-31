import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { parseJsonBody, requireAuthenticatedUser } from '@/server/api/security';
import { accessIndexId, capabilitiesForAssignment } from '@/lib/auth/access';

export const runtime = 'nodejs';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('request'), athleteId: z.string().trim().min(1).max(180) }),
  z.object({ action: z.literal('team_confirm'), claimId: z.string().trim().min(1).max(180) }),
  z.object({ action: z.literal('league_verify'), claimId: z.string().trim().min(1).max(180) }),
  z.object({ action: z.literal('reject'), claimId: z.string().trim().min(1).max(180), reason: z.string().trim().min(4).max(300) }),
]);

function manages(data: FirebaseFirestore.DocumentData | undefined, uid: string) {
  return Array.isArray(data?.adminUserIds) && data.adminUserIds.includes(uid);
}

async function synchronizeAthleteRole(uid: string) {
  const account = await adminAuth.getUser(uid);
  const currentRole = typeof account.customClaims?.role === 'string' ? account.customClaims.role : 'fan';
  const protectedRoles = ['team_admin', 'league_admin', 'platform_admin', 'super_admin'];
  const nextRole = protectedRoles.includes(currentRole) ? currentRole : 'athlete';
  await Promise.all([
    adminDb.collection('users').doc(uid).set({
      role: nextRole,
      primaryPersona: nextRole,
      accountStatus: 'active',
      accessVersion: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
    adminAuth.setCustomUserClaims(uid, {
      ...(account.customClaims ?? {}),
      role: nextRole,
    }),
  ]);
}

function athleteSelfAssignmentId(athleteId: string, userId: string) {
  return `assignment_athlete_${athleteId}_${userId}`;
}

function athleteSelfAssignment(input: {
  athleteId: string;
  userId: string;
  grantedByUserId: string;
  claimId: string;
}) {
  return {
    id: athleteSelfAssignmentId(input.athleteId, input.userId),
    userId: input.userId,
    roleKey: 'athlete_self',
    scopeType: 'athlete',
    scopeId: input.athleteId,
    permissionBundleId: 'athlete_self',
    status: 'active',
    grantedByUserId: input.grantedByUserId,
    applicationId: input.claimId,
    validFrom: new Date().toISOString(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;
  const parsed = await parseJsonBody(request, schema, { maxBytes: 4 * 1024 });
  if ('response' in parsed) return Response.json({ error: 'Invalid athlete claim action.' }, { status: parsed.response.status });
  const actor = auth.actor;
  const input = parsed.data;

  try {
    const result = await adminDb.runTransaction(async (transaction) => {
      if (input.action === 'request') {
        if (actor.email_verified !== true) throw new Error('Verify your email before claiming an athlete profile.');
        const athleteRef = adminDb.collection('athletes').doc(input.athleteId);
        const athleteSnapshot = await transaction.get(athleteRef);
        if (!athleteSnapshot.exists) throw new Error('Athlete profile not found.');
        const athlete = athleteSnapshot.data()!;
        if (athlete.userId) throw new Error('This athlete profile is already linked.');
        const existing = await transaction.get(
          adminDb.collection('athleteClaims')
            .where('athleteId', '==', input.athleteId)
            .where('status', 'in', ['team_pending', 'league_pending']),
        );
        if (!existing.empty) throw new Error('This athlete profile already has a claim under review.');
        const claimRef = adminDb.collection('athleteClaims').doc();
        transaction.create(claimRef, {
          id: claimRef.id,
          athleteId: input.athleteId,
          teamId: athlete.teamId,
          leagueId: athlete.leagueId,
          requesterUserId: actor.uid,
          status: 'team_pending',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { id: claimRef.id, status: 'team_pending' };
      }

      const claimRef = adminDb.collection('athleteClaims').doc(input.claimId);
      const claimSnapshot = await transaction.get(claimRef);
      if (!claimSnapshot.exists) throw new Error('Athlete claim not found.');
      const claim = claimSnapshot.data()!;
      const [teamSnapshot, leagueSnapshot] = await Promise.all([
        transaction.get(adminDb.collection('teams').doc(claim.teamId)),
        transaction.get(adminDb.collection('leagues').doc(claim.leagueId)),
      ]);
      const platform = ['platform_admin', 'super_admin'].includes(String(actor.role ?? ''));

      if (input.action === 'team_confirm') {
        if (claim.status !== 'team_pending') throw new Error('This claim is no longer waiting for Team confirmation.');
        if (!platform && !manages(teamSnapshot.data(), actor.uid)) throw new Error('Only an assigned Team Admin can confirm this claim.');
        transaction.update(claimRef, {
          status: 'league_pending',
          teamReviewedByUserId: actor.uid,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { id: claimRef.id, status: 'league_pending' };
      }

      if (input.action === 'league_verify') {
        const requesterUserId = claim.requesterUserId as string;
        const assignment = athleteSelfAssignment({
          athleteId: claim.athleteId as string,
          userId: requesterUserId,
          grantedByUserId: actor.uid,
          claimId: claimRef.id,
        });
        const assignmentId = assignment.id;
        const capabilities = capabilitiesForAssignment({
          permissionBundleId: 'athlete_self',
          roleKey: 'athlete_self',
        });
        if (claim.status === 'linked') {
          transaction.set(adminDb.collection('accessAssignments').doc(assignmentId), assignment, { merge: true });
          transaction.set(adminDb.collection('accessIndex').doc(accessIndexId('athlete', claim.athleteId, requesterUserId)), {
            userId: requesterUserId,
            scopeType: 'athlete',
            scopeId: claim.athleteId,
            activeRoles: ['athlete_self'],
            capabilities,
            assignmentIds: [assignmentId],
            accessVersion: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          return {
            id: claimRef.id,
            status: 'linked',
            requesterUserId,
          };
        }
        if (claim.status !== 'league_pending') throw new Error('Team confirmation is required first.');
        if (!platform && !manages(leagueSnapshot.data(), actor.uid)) throw new Error('Only an assigned League Admin can verify this claim.');
        const athleteRef = adminDb.collection('athletes').doc(claim.athleteId);
        const athleteSnapshot = await transaction.get(athleteRef);
        if (athleteSnapshot.data()?.userId) throw new Error('This athlete profile was linked while the claim was under review.');
        transaction.update(athleteRef, { userId: requesterUserId, updatedAt: FieldValue.serverTimestamp() });
        transaction.set(adminDb.collection('accessAssignments').doc(assignmentId), assignment);
        transaction.set(adminDb.collection('accessIndex').doc(accessIndexId('athlete', claim.athleteId, requesterUserId)), {
          userId: requesterUserId,
          scopeType: 'athlete',
          scopeId: claim.athleteId,
          activeRoles: ['athlete_self'],
          capabilities,
          assignmentIds: [assignmentId],
          accessVersion: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.update(claimRef, {
          status: 'linked',
          leagueReviewedByUserId: actor.uid,
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(adminDb.collection('athleteVerificationRecords').doc(), {
          athleteId: claim.athleteId,
          type: 'team_affiliation',
          status: 'verified',
          verifiedByUserId: actor.uid,
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.set(adminDb.collection('adminAuditEvents').doc(), {
          actorUserId: actor.uid,
          action: 'athlete_claim_linked',
          targetCollection: 'athletes',
          targetId: claim.athleteId,
          createdAt: FieldValue.serverTimestamp(),
        });
        return {
          id: claimRef.id,
          status: 'linked',
          requesterUserId,
        };
      }

      const mayReject = platform ||
        (claim.status === 'team_pending' && manages(teamSnapshot.data(), actor.uid)) ||
        (claim.status === 'league_pending' && manages(leagueSnapshot.data(), actor.uid));
      if (!mayReject) throw new Error('You cannot reject this athlete claim.');
      transaction.update(claimRef, {
        status: 'rejected',
        rejectionReason: input.reason,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { id: claimRef.id, status: 'rejected' };
    });
    if (result.status === 'linked' && 'requesterUserId' in result && typeof result.requesterUserId === 'string') {
      await synchronizeAthleteRole(result.requesterUserId);
    }
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Athlete claim action failed.' },
      { status: 409 },
    );
  }
}
