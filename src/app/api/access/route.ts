import { createHash, randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation, requireRole } from '@/server/api/security';
import { PERMISSION_BUNDLES, isIssuableBundle } from '@/lib/auth/access';
import { normalizeAccessAssignment, readScopeProjection } from '@/server/access/projector';
import { resolveAccountClass } from '@/lib/auth/accountClass';
import { sendAccessInvitationEmail } from '@/server/email/accessInvitation';
import type { AccountClass } from '@/types';

export const runtime = 'nodejs';

const PRIVILEGED_ROLES = ['league_admin', 'platform_admin', 'super_admin'];
const ORGANIZATION_OPERATOR_INVITATION_ERROR = 'This invitation requires a GoalPlace256 Organization Operator account. Sign out and create or access your operator account using the invited email.';
const PLATFORM_OPERATOR_INVITATION_ERROR = 'This invitation requires a GoalPlace256 Platform Operator account.';
const OPERATOR_INVITATION_ROLES = new Set([
  'league_owner',
  'league_admin',
  'team_owner',
  'team_admin',
  'roster_manager',
  'result_reporter',
  'content_manager',
  'platform_admin',
  'super_admin',
]);
const ORGANIZATION_OPERATOR_ROLES = new Set([
  'league_owner',
  'league_admin',
  'team_owner',
  'team_admin',
  'roster_manager',
  'result_reporter',
  'content_manager',
]);
const PLATFORM_OPERATOR_ROLES = new Set([
  'platform_admin',
  'super_admin',
]);

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
  z.object({
    action: z.literal('accept_invitation'),
    invitationId: z.string().trim().min(1).max(180),
    token: z.string().trim().min(20).max(512),
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

function publicBaseUrl(request: Request) {
  return process.env.GOALPLACE_APP_BASE_URL
    ?? process.env.NEXT_PUBLIC_APP_URL
    ?? new URL(request.url).origin;
}

function slugPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'league';
}

function defaultScoringFor(sport: string) {
  if (sport === 'basketball') return { win: 2, draw: null, loss: 0 };
  if (sport === 'rugby') return { win: 4, draw: 2, loss: 0 };
  return { win: 3, draw: 1, loss: 0 };
}

function assignmentRecord(input: {
  id: string;
  userId: string;
  roleKey: string;
  scopeType: 'platform' | 'organization' | 'league' | 'team' | 'athlete';
  scopeId: string;
  permissionBundleId: string;
  grantedByUserId: string;
  invitationId: string;
  applicationId?: string;
}) {
  return {
    id: input.id,
    userId: input.userId,
    roleKey: input.roleKey,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    permissionBundleId: input.permissionBundleId,
    status: 'active',
    grantedByUserId: input.grantedByUserId,
    invitationId: input.invitationId,
    ...(input.applicationId ? { applicationId: input.applicationId } : {}),
    validFrom: new Date().toISOString(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function primaryPersonaForRole(roleKey: string) {
  if (roleKey === 'league_owner' || roleKey === 'league_admin') return 'league_admin';
  if (roleKey === 'team_owner' || roleKey === 'team_admin' || roleKey === 'roster_manager' || roleKey === 'result_reporter' || roleKey === 'content_manager') return 'team_admin';
  if (roleKey === 'athlete_self') return 'athlete';
  if (roleKey === 'platform_admin' || roleKey === 'super_admin') return roleKey;
  return 'fan';
}

function requiredAccountClassForRole(roleKey: string): AccountClass | null {
  if (ORGANIZATION_OPERATOR_ROLES.has(roleKey)) return 'organization_operator';
  if (PLATFORM_OPERATOR_ROLES.has(roleKey)) return 'platform_operator';
  if (roleKey === 'athlete_self' || roleKey === 'athlete_guardian') return 'athlete';
  return OPERATOR_INVITATION_ROLES.has(roleKey) ? 'organization_operator' : null;
}

function accountClassViolation(
  actorRole: unknown,
  userData: Record<string, unknown> | undefined,
  roleKey: string,
) {
  const requiredClass = requiredAccountClassForRole(roleKey);
  if (!requiredClass) return null;
  const accountClass = resolveAccountClass({
    accountClass: userData?.accountClass,
    role: String(actorRole ?? userData?.role ?? 'fan'),
  });
  if (accountClass === requiredClass) return null;
  return requiredClass === 'platform_operator'
    ? PLATFORM_OPERATOR_INVITATION_ERROR
    : ORGANIZATION_OPERATOR_INVITATION_ERROR;
}

export async function POST(request: Request) {
  // Accepting an invitation grants scoped authority, so the token-guessing surface is
  // rate limited per account in addition to the token check itself.
  const guarded = await requireAuthenticatedMutation(request, accessActionSchema, {
    maxBytes: 4 * 1024,
    invalidBodyError: 'Invalid access action.',
    rateLimit: { bucket: 'access_action', limit: 20, windowSeconds: 300 },
  });
  if ('response' in guarded) return guarded.response;

  const actor = guarded.actor;
  const body = guarded.data;

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
      const userSnapshot = await adminDb.collection('users').doc(actor.uid).get();
      const violation = accountClassViolation(actor.role, userSnapshot.data(), 'team_admin');
      if (violation) {
        return Response.json({ error: violation }, { status: 409 });
      }
      if (data.status === 'active' && data.userId === actor.uid) {
        const role = await synchronizeRoleClaim(actor.uid, 'team_admin');
        return Response.json({ ok: true, role });
      }
      if (data.status !== 'invited') return Response.json({ error: 'Invitation is no longer active.' }, { status: 409 });

      /**
       * The legacy team invitation door, closed.
       *
       * This path once wrote `teamAssignments` and `team.adminUserIds` and stopped there, so the
       * person was told they were a Team Admin while the canonical model had never heard of
       * them. It was then rebuilt to flow into the same canonical assignment the modern
       * invitation produced, which was the right fix at the time.
       *
       * ADR-004 removes what was on the other side of it. There is no team authority left for
       * an acceptance to create, so an old link is refused by name rather than accepted into an
       * assignment that grants nothing. An accepted invitation that silently confers nothing is
       * the same split-brain failure in a new costume.
       */
      return Response.json({
        error: 'Team administration has moved to League Operations. Ask your league for access.',
      }, { status: 409 });

    }

    if (body.action === 'approve_league_admin') {
      const forbidden = requireRole(actor, ['platform_admin', 'super_admin'], 'Platform Admin access required.');
      if (forbidden) return forbidden;
      const applicationRef = adminDb.collection('leagueAdminApplications').doc(body.applicationId);
      const application = await applicationRef.get();
      if (!application.exists) return Response.json({ error: 'Application not found.' }, { status: 404 });
      const data = application.data()!;
      if (data.status === 'approved' && data.leagueId && data.invitationId) {
        return Response.json({
          ok: true,
          leagueId: data.leagueId,
          invitationId: data.invitationId,
          actionUrl: data.invitationActionUrl,
        });
      }
      if (!['pending', 'submitted', 'under_review', 'needs_information', 'resubmitted'].includes(data.status)) {
        return Response.json({ error: 'Application has already been decided.' }, { status: 409 });
      }
      const applicant = await adminAuth.getUser(data.userId).catch(() => null);
      const invitedEmail = data.applicantEmail?.toLowerCase() ?? applicant?.email?.toLowerCase();
      if (!invitedEmail) {
        return Response.json({ error: 'A League Admin setup email is required before approval.' }, { status: 409 });
      }
      const existingInvitedAccount = await adminAuth.getUserByEmail(invitedEmail).catch(() => null);
      if (existingInvitedAccount) {
        const existingUser = await adminDb.collection('users').doc(existingInvitedAccount.uid).get();
        const existingClass = resolveAccountClass({
          accountClass: existingUser.data()?.accountClass,
          role: typeof existingInvitedAccount.customClaims?.role === 'string'
            ? existingInvitedAccount.customClaims.role
            : existingUser.data()?.role,
        });
        if (existingClass !== 'organization_operator') {
          return Response.json({
            error: 'This email already belongs to a non-operator account. Request a separate operational email before approving this league.',
          }, { status: 409 });
        }
      }
      const now = new Date();
      const year = now.getUTCFullYear();
      const unique = createHash('sha256').update(`${application.id}:${data.userId}:${now.toISOString()}`).digest('hex').slice(0, 8);
      const organizationId = `org_${slugPart(data.leagueName)}_${unique}`;
      const leagueId = `league_${slugPart(data.leagueName)}_${unique}`;
      const seasonId = `season_${leagueId}_${year}`;
      const invitationId = `invite_${createHash('sha256').update(`${application.id}:${data.userId}:league_owner`).digest('hex').slice(0, 32)}`;
      const token = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const actionUrl = `/invitations/access/${invitationId}?token=${encodeURIComponent(token)}`;
      const deliveryAttemptId = `${invitationId}_email_1`;

      await adminDb.runTransaction(async (transaction) => {
        const current = await transaction.get(applicationRef);
        if (!current.exists || !['pending', 'submitted', 'under_review', 'needs_information', 'resubmitted'].includes(current.data()?.status)) {
          throw new Error('Application has already been decided.');
        }
        transaction.set(adminDb.collection('organizations').doc(organizationId), {
          id: organizationId,
          name: data.leagueName,
          country: data.country ?? 'Uganda',
          status: 'draft',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(adminDb.collection('leagues').doc(leagueId), {
          id: leagueId,
          organizationId,
          name: data.leagueName,
          sport: data.sport,
          city: data.city,
          country: 'Uganda',
          description: `${data.leagueName} is preparing its first GoalPlace256 season.`,
          status: 'draft',
          lifecycleStatus: 'application_approved',
          plan: 'free',
          verified: false,
          adminUserIds: [],
          season: `${year} Season`,
          currentSeasonId: seasonId,
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
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(adminDb.collection('seasons').doc(seasonId), {
          id: seasonId,
          leagueId,
          name: `${year} Season`,
          sport: data.sport,
          status: 'registration',
          startDate: now.toISOString().slice(0, 10),
          competitionFormat: 'league',
          scoring: defaultScoringFor(String(data.sport)),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(adminDb.collection('invitations').doc(invitationId), {
          id: invitationId,
          type: 'league_owner',
          invitedEmail,
          roleKey: 'league_owner',
          scopeType: 'league',
          scopeId: leagueId,
          permissionBundleId: 'league_owner',
          tokenHash,
          tokenVersion: 1,
          // Creation proves only that the invitation is queued. Provider acceptance is
          // recorded after the transaction and never inferred from this document existing.
          status: 'queued',
          invitedByUserId: actor.uid,
          applicationId: application.id,
          organizationId,
          leagueId,
          actionUrl,
          expiresAt,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(adminDb.collection('invitationDeliveryAttempts').doc(deliveryAttemptId), {
          id: deliveryAttemptId,
          invitationId,
          channel: 'email',
          destination: invitedEmail,
          provider: 'resend',
          status: 'queued',
          attemptNumber: 1,
          requestedByUserId: actor.uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(applicationRef, {
          status: 'approved',
          reviewedByUserId: actor.uid,
          organizationId,
          leagueId,
          invitationId,
          invitationActionUrl: actionUrl,
          invitationDeliveryStatus: 'queued',
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(adminDb.collection('adminAuditEvents').doc(), {
          actorUserId: actor.uid,
          action: 'approved',
          targetCollection: 'leagueAdminApplications',
          targetId: application.id,
          note: `Created ${organizationId}, ${leagueId}, and League Owner invitation ${invitationId}.`,
          createdAt: FieldValue.serverTimestamp(),
        });
      });

      const delivery = await sendAccessInvitationEmail({
        to: invitedEmail,
        inviteUrl: new URL(actionUrl, publicBaseUrl(request)).toString(),
        invitationId,
        leagueName: String(data.leagueName),
        roleLabel: 'League Owner',
        expiresAt,
        attemptId: deliveryAttemptId,
      });
      const deliveryStatus = delivery.status === 'sent' ? 'sent' : 'failed_delivery';
      await adminDb.runTransaction(async (transaction) => {
        transaction.update(adminDb.collection('invitations').doc(invitationId), {
          status: deliveryStatus,
          deliveryAttemptCount: 1,
          lastDeliveryAttemptId: deliveryAttemptId,
          lastDeliveryStatus: delivery.status,
          ...(delivery.id ? { emailMessageId: delivery.id } : {}),
          ...(delivery.error ? { deliveryError: delivery.error } : {}),
          ...(delivery.status === 'sent' ? { sentAt: FieldValue.serverTimestamp() } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(adminDb.collection('invitationDeliveryAttempts').doc(deliveryAttemptId), {
          status: deliveryStatus,
          providerStatus: delivery.status,
          ...(delivery.id ? { providerMessageId: delivery.id } : {}),
          ...(delivery.error ? { error: delivery.error } : {}),
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(applicationRef, {
          invitationDeliveryStatus: deliveryStatus,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      return Response.json({
        ok: true,
        leagueId,
        organizationId,
        invitationId,
        actionUrl: new URL(actionUrl, publicBaseUrl(request)).toString(),
        delivery: { status: deliveryStatus, providerStatus: delivery.status, ...(delivery.error ? { error: delivery.error } : {}) },
      });
    }

    if (body.action === 'accept_invitation') {
      if (actor.email_verified !== true) {
        return Response.json({ error: 'Verify your email address before accepting an invitation.' }, { status: 403 });
      }
      const invitationRef = adminDb.collection('invitations').doc(body.invitationId);
      const invitation = await invitationRef.get();
      if (!invitation.exists) return Response.json({ error: 'Invitation not found.' }, { status: 404 });
      const data = invitation.data()!;
      const suppliedTokenHash = createHash('sha256').update(body.token).digest('hex');
      if (!data.tokenHash || suppliedTokenHash !== data.tokenHash) {
        return Response.json({ error: 'This invitation link is invalid.' }, { status: 403 });
      }
      if (data.expiresAt && Date.parse(data.expiresAt) <= Date.now()) {
        return Response.json({ error: 'This invitation has expired. Ask the sender for a new one.' }, { status: 410 });
      }
      if (data.invitedEmail && data.invitedEmail.toLowerCase() !== actor.email?.toLowerCase()) {
        return Response.json({ error: 'Sign in with the email address that received this invitation.' }, { status: 403 });
      }
      const persona = primaryPersonaForRole(String(data.roleKey));
      const userSnapshot = await adminDb.collection('users').doc(actor.uid).get();
      const violation = accountClassViolation(actor.role, userSnapshot.data(), String(data.roleKey));
      if (violation) {
        return Response.json({ error: violation }, { status: 409 });
      }
      if (data.status === 'accepted') {
        if (data.roleKey === 'league_owner' || data.roleKey === 'league_admin') {
          const role = await synchronizeRoleClaim(actor.uid, 'league_admin');
          return Response.json({ ok: true, role, scopeId: data.scopeId });
        }
        if (persona === 'team_admin') {
          const role = await synchronizeRoleClaim(actor.uid, 'team_admin');
          return Response.json({ ok: true, role, scopeId: data.scopeId });
        }
        return Response.json({ ok: true, scopeId: data.scopeId });
      }
      if (!['sent', 'delivered', 'viewed', 'queued'].includes(String(data.status))) {
        return Response.json({ error: 'Invitation is no longer active.' }, { status: 409 });
      }

      const assignmentId = `assignment_${body.invitationId}`;
      const bundle = PERMISSION_BUNDLES.find((item) => item.id === String(data.permissionBundleId))
        ?? PERMISSION_BUNDLES.find((item) => item.roleKey === data.roleKey);
      if (!bundle) return Response.json({ error: 'Invitation permission bundle is not supported.' }, { status: 409 });
      /**
       * A retired bundle is refused here rather than allowed to resolve to nothing.
       *
       * ADR-004 versioned the Team Admin bundles to zero capabilities, so accepting one
       * would succeed, write an assignment, and hand the invitee a role that grants nothing.
       * They would have no way to tell that from a permissions bug. Refusing names the
       * reason, which is also the point of the sunset: the account class is offered a
       * destination, never silently transformed into an empty one.
       */
      if (!isIssuableBundle(bundle)) {
        return Response.json({
          error: 'Team administration has moved to League Operations. This invitation can no longer be accepted.',
        }, { status: 409 });
      }
      const assignment = assignmentRecord({
        id: assignmentId,
        userId: actor.uid,
        roleKey: String(data.roleKey),
        scopeType: data.scopeType,
        scopeId: data.scopeId,
        permissionBundleId: bundle.id,
        grantedByUserId: String(data.invitedByUserId),
        invitationId: body.invitationId,
        applicationId: data.applicationId,
      });
      const now = new Date();
      const nowIso = now.toISOString();
      const projectedAssignment = normalizeAccessAssignment(assignmentId, assignment, nowIso);
      const scope = { userId: actor.uid, scopeType: data.scopeType, scopeId: data.scopeId };

      await adminDb.runTransaction(async (transaction) => {
        const current = await transaction.get(invitationRef);
        if (!current.exists || !['sent', 'delivered', 'viewed', 'queued'].includes(String(current.data()?.status))) {
          throw new Error('Invitation is no longer active.');
        }
        const projection = await readScopeProjection(transaction, scope, {
          now,
          pending: [{ operation: 'upsert', assignment: projectedAssignment }],
        });
        transaction.set(adminDb.collection('accessAssignments').doc(assignmentId), assignment);
        projection.apply(transaction);
        transaction.update(invitationRef, {
          status: 'accepted',
          acceptedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (data.scopeType === 'league') {
          transaction.update(adminDb.collection('leagues').doc(data.scopeId), {
            adminUserIds: FieldValue.arrayUnion(actor.uid),
            lifecycleStatus: 'onboarding',
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        if (data.scopeType === 'team') {
          transaction.update(adminDb.collection('teams').doc(data.scopeId), {
            adminUserIds: FieldValue.arrayUnion(actor.uid),
            updatedAt: FieldValue.serverTimestamp(),
          });
          if (data.legacyTeamAssignmentId) {
            transaction.set(adminDb.collection('teamAssignments').doc(data.legacyTeamAssignmentId), {
              userId: actor.uid,
              status: 'active',
              acceptedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
          }
        }
        transaction.set(adminDb.collection('users').doc(actor.uid), {
          accountClass: requiredAccountClassForRole(String(data.roleKey)) ?? 'organization_operator',
          primaryPersona: persona,
          role: persona,
          accountStatus: 'active',
          accessVersion: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(adminDb.collection('adminAuditEvents').doc(), {
          actorUserId: actor.uid,
          action: 'accepted',
          targetCollection: 'invitations',
          targetId: body.invitationId,
          note: `Accepted ${data.roleKey} invitation for ${data.scopeType}:${data.scopeId}.`,
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      if (data.roleKey === 'league_owner' || data.roleKey === 'league_admin') {
        const role = await synchronizeRoleClaim(actor.uid, 'league_admin');
        return Response.json({ ok: true, role, scopeId: data.scopeId });
      }
      if (persona === 'team_admin') {
        const role = await synchronizeRoleClaim(actor.uid, 'team_admin');
        return Response.json({ ok: true, role, scopeId: data.scopeId });
      }
      return Response.json({ ok: true, scopeId: data.scopeId });
    }

    return Response.json({ error: 'Unsupported access action.' }, { status: 400 });
  } catch (error) {
    console.error('Trusted access action failed', error);
    return Response.json({ error: 'GoalPlace256 could not complete this access action.' }, { status: 500 });
  }
}
