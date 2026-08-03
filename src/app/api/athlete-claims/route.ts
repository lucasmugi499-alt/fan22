import { FieldValue } from 'firebase-admin/firestore';
import { createHash } from 'crypto';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { hasCapabilityOrPlatformGrant } from '@/server/access/capabilities';
import type { AccessAssignment } from '@/lib/auth/access';
import { readScopeProjection } from '@/server/access/projector';

export const runtime = 'nodejs';

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('request'),
    athleteId: z.string().trim().min(1).max(180),
    invitationToken: z.string().trim().min(16).max(512),
  }),
  z.object({ action: z.literal('team_confirm'), claimId: z.string().trim().min(1).max(180) }),
  z.object({ action: z.literal('league_verify'), claimId: z.string().trim().min(1).max(180) }),
  z.object({ action: z.literal('reject'), claimId: z.string().trim().min(1).max(180), reason: z.string().trim().min(4).max(300) }),
]);

/**
 * Canonical scope authority. This route previously read `adminUserIds` directly, which
 * after the Stage C cutover would have authorized from a field Firestore Rules no longer
 * honour — a server path granting what the client path denies.
 */
function managesTeam(uid: string, teamId: string) {
  return hasCapabilityOrPlatformGrant(uid, { scopeType: 'team', scopeId: teamId }, 'team.roster.manage');
}

function managesLeague(uid: string, leagueId: string) {
  return hasCapabilityOrPlatformGrant(uid, { scopeType: 'league', scopeId: leagueId }, 'league.roster.verify');
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

/**
 * The same grant expressed with plain ISO timestamps, for the projector's overlay.
 * The stored document uses server timestamps, which cannot be projected before commit.
 */
function athleteSelfProjectionAssignment(input: {
  athleteId: string;
  userId: string;
  grantedByUserId: string;
  claimId: string;
}): AccessAssignment {
  const nowIso = new Date().toISOString();
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
    validFrom: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export async function POST(request: Request) {
  // Claiming an athlete profile binds a real identity to a record, so attempts are bounded.
  const guarded = await requireAuthenticatedMutation(request, schema, {
    maxBytes: 4 * 1024,
    invalidBodyError: 'Invalid athlete claim action.',
    rateLimit: { bucket: 'athlete_claim', limit: 20, windowSeconds: 300 },
  });
  if ('response' in guarded) return guarded.response;
  const actor = guarded.actor;
  const parsed = { data: guarded.data };
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
        const invitedEmail = normalizeEmail(athlete.invitedEmail);
        if (!invitedEmail || !athlete.invitationTokenHash) {
          throw new Error('Ask your Team Admin for an athlete invitation link.');
        }
        if (athlete.invitationExpiresAt && Date.parse(String(athlete.invitationExpiresAt)) <= Date.now()) {
          throw new Error('This athlete invitation link has expired.');
        }
        if (normalizeEmail(actor.email) !== invitedEmail) {
          throw new Error('Use the athlete account email that received this invitation.');
        }
        const tokenHash = createHash('sha256').update(input.invitationToken).digest('hex');
        if (tokenHash !== athlete.invitationTokenHash) {
          throw new Error('This athlete invitation link is invalid or expired.');
        }
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
          status: 'league_pending',
          teamReviewedByUserId: athlete.createdByUserId ?? 'team_invitation',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { id: claimRef.id, status: 'league_pending' };
      }

      const claimRef = adminDb.collection('athleteClaims').doc(input.claimId);
      const claimSnapshot = await transaction.get(claimRef);
      if (!claimSnapshot.exists) throw new Error('Athlete claim not found.');
      const claim = claimSnapshot.data()!;
      const platform = ['platform_admin', 'super_admin'].includes(String(actor.role ?? ''));

      if (input.action === 'team_confirm') {
        if (claim.status !== 'team_pending') throw new Error('This claim is no longer waiting for Team confirmation.');
        if (!platform && !await managesTeam(actor.uid, claim.teamId)) throw new Error('Only an assigned Team Admin can confirm this claim.');
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
        const scope = {
          userId: requesterUserId,
          scopeType: 'athlete' as const,
          scopeId: claim.athleteId as string,
        };
        // The projector rebuilds this scope from every active assignment. The previous
        // hand-built document asserted exactly one role with `merge: true`, so a second
        // assignment in the same scope could leave capabilities behind after revocation.
        const pending = [{
          operation: 'upsert' as const,
          assignment: athleteSelfProjectionAssignment({
            athleteId: claim.athleteId as string,
            userId: requesterUserId,
            grantedByUserId: actor.uid,
            claimId: claimRef.id,
          }),
        }];

        if (claim.status === 'linked') {
          const projection = await readScopeProjection(transaction, scope, { pending });
          transaction.set(adminDb.collection('accessAssignments').doc(assignmentId), assignment, { merge: true });
          projection.apply(transaction);
          return {
            id: claimRef.id,
            status: 'linked',
            requesterUserId,
          };
        }
        if (claim.status !== 'league_pending') throw new Error('Team confirmation is required first.');
        if (!platform && !await managesLeague(actor.uid, claim.leagueId)) throw new Error('Only an assigned League Admin can verify this claim.');
        const athleteRef = adminDb.collection('athletes').doc(claim.athleteId);
        // Both remaining reads must precede every write in this transaction.
        const [athleteSnapshot, projection] = await Promise.all([
          transaction.get(athleteRef),
          readScopeProjection(transaction, scope, { pending }),
        ]);
        if (athleteSnapshot.data()?.userId) throw new Error('This athlete profile was linked while the claim was under review.');
        transaction.update(athleteRef, { userId: requesterUserId, updatedAt: FieldValue.serverTimestamp() });
        transaction.set(adminDb.collection('accessAssignments').doc(assignmentId), assignment);
        projection.apply(transaction);
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
        (claim.status === 'team_pending' && await managesTeam(actor.uid, claim.teamId)) ||
        (claim.status === 'league_pending' && await managesLeague(actor.uid, claim.leagueId));
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
