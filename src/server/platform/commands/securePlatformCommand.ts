import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { accessIndexId, type PermissionCapability } from '@/lib/auth/access';
import { authorizeCapability, hasCapability, indexGrantsCapability } from '@/server/access/capabilities';
import { jsonError, requireRole, type AuthenticatedActor } from '@/server/api/security';

type PlatformCommandInput<TResult> = {
  actor: AuthenticatedActor;
  command: string;
  requiredCapability?: PermissionCapability;
  requireReason?: boolean;
  reason?: string;
  handler: (context: {
    actor: AuthenticatedActor;
    requestId: string;
    reason: string;
    profile: FirebaseFirestore.DocumentData;
  }) => Promise<TResult>;
};

type LeagueCommandInput<TResult> = {
  actor: AuthenticatedActor;
  command: string;
  leagueId: string;
  requiredCapability: PermissionCapability;
  requireReason?: boolean;
  reason?: string;
  handler: (context: {
    actor: AuthenticatedActor;
    requestId: string;
    reason: string;
    profile: FirebaseFirestore.DocumentData;
    league: FirebaseFirestore.DocumentSnapshot;
    isPlatformActor: boolean;
  }) => Promise<TResult>;
};

function isRestrictedStatus(status: unknown) {
  return status === 'suspended' || status === 'disabled' || status === 'deletion_pending';
}


export function platformAuditEvent(input: {
  actor: AuthenticatedActor;
  requestId: string;
  action: string;
  targetCollection: string;
  targetId: string;
  note?: string;
  beforeSummary?: Record<string, unknown>;
  afterSummary?: Record<string, unknown>;
}) {
  return {
    actorUserId: input.actor.uid,
    action: input.action,
    targetCollection: input.targetCollection,
    targetId: input.targetId,
    ...(input.note ? { note: input.note } : {}),
    requestId: input.requestId,
    environment: process.env.NEXT_PUBLIC_GOALPLACE_ENVIRONMENT ?? process.env.NODE_ENV ?? 'unknown',
    ...(input.beforeSummary ? { beforeSummary: input.beforeSummary } : {}),
    ...(input.afterSummary ? { afterSummary: input.afterSummary } : {}),
    createdAt: FieldValue.serverTimestamp(),
  };
}

export async function securePlatformCommand<TResult>({
  actor,
  command,
  requiredCapability,
  requireReason = false,
  reason,
  handler,
}: PlatformCommandInput<TResult>): Promise<{ result: TResult } | { response: Response }> {
  const forbidden = requireRole(actor, ['platform_admin', 'super_admin'], 'Platform Admin access required.');
  if (forbidden) return { response: forbidden };

  const normalizedReason = reason?.trim() ?? '';
  if (requireReason && normalizedReason.length < 4) {
    return { response: jsonError('A clear audit reason is required for this Platform Admin command.', 400) };
  }

  const profileSnapshot = await adminDb.collection('users').doc(actor.uid).get();
  const profile = profileSnapshot.data() ?? {};
  const accountClass = typeof actor.accountClass === 'string'
    ? actor.accountClass
    : profile.accountClass;
  if (accountClass !== 'platform_operator') {
    return { response: jsonError('A dedicated Platform Operator account is required.', 403) };
  }
  if (isRestrictedStatus(profile.accountStatus) || isRestrictedStatus(profile.status)) {
    return { response: jsonError('This Platform Operator account is not active.', 403) };
  }

  // One model, applied to everyone: holding a platform role is not holding a capability.
  //
  // This previously exempted `super_admin` from the check entirely and then treated any
  // `platform_admin` as satisfying every `requiredCapability`, which made the capability
  // argument decorative — the audit was right to call the model misleading. Break-glass is
  // modelled as a capability (`break_glass.activate`) in the super_admin bundle, not as a
  // role that skips the check, so a role-shaped exemption here contradicted the design.
  //
  // Verified against live data before removal: all 7 platform accounts hold both
  // capabilities this guard ever requires (`platform.audit.read`, `platform.admin.manage`),
  // so no account loses access. If a projection ever goes missing, the recovery is to
  // rebuild it — `npm run access:migrate:gate` reports it and the migration repairs it —
  // not to reintroduce a role bypass.
  if (requiredCapability) {
    const platformAccess = await adminDb
      .collection('accessIndex')
      .doc(accessIndexId('platform', 'global', actor.uid))
      .get();
    if (!indexGrantsCapability(platformAccess.data(), requiredCapability)) {
      return { response: jsonError(`Missing platform capability: ${requiredCapability}.`, 403) };
    }
  }

  const requestId = `${command}_${randomUUID()}`;
  return {
    result: await handler({
      actor,
      requestId,
      reason: normalizedReason,
      profile,
    }),
  };
}

export async function secureLeagueCommand<TResult>({
  actor,
  command,
  leagueId,
  requiredCapability,
  requireReason = false,
  reason,
  handler,
}: LeagueCommandInput<TResult>): Promise<{ result: TResult } | { response: Response }> {
  const forbidden = requireRole(
    actor,
    ['league_admin', 'platform_admin', 'super_admin'],
    'League Admin access required.',
  );
  if (forbidden) return { response: forbidden };

  const normalizedReason = reason?.trim() ?? '';
  if (requireReason && normalizedReason.length < 4) {
    return { response: jsonError('A clear audit reason is required for this League Admin command.', 400) };
  }

  const [profileSnapshot, leagueSnapshot] = await Promise.all([
    adminDb.collection('users').doc(actor.uid).get(),
    adminDb.collection('leagues').doc(leagueId).get(),
  ]);
  if (!leagueSnapshot.exists) {
    return { response: jsonError('League not found.', 404) };
  }
  const profile = profileSnapshot.data() ?? {};
  const role = String(actor.role);
  const isPlatformActor = role === 'platform_admin' || role === 'super_admin';
  const accountClass = typeof actor.accountClass === 'string'
    ? actor.accountClass
    : profile.accountClass;
  const requiredAccountClass = isPlatformActor ? 'platform_operator' : 'organization_operator';
  if (accountClass !== requiredAccountClass) {
    return {
      response: jsonError(
        isPlatformActor
          ? 'A dedicated Platform Operator account is required.'
          : 'A dedicated Organization Operator account is required.',
        403,
      ),
    };
  }
  if (isRestrictedStatus(profile.accountStatus) || isRestrictedStatus(profile.status)) {
    return { response: jsonError('This operator account is not active.', 403) };
  }

  const requestId = `${command}_${randomUUID()}`;

  // Authorization runs for EVERY actor, including platform operators.
  //
  // This used to be wrapped in `if (!isPlatformActor)`, so holding the platform_admin or
  // super_admin role skipped the league capability check entirely — a platform operator
  // could run any league command on any league without a capability anywhere. Being a
  // platform operator is a scope, not a licence.
  //
  // A platform actor now satisfies the check through the platform-global grant rather than
  // by exemption, which is the same authority expressed as a capability. All seven platform
  // accounts hold `platform.admin.manage`, so this preserves their access while making it
  // reviewable and revocable.
  const leagueData = leagueSnapshot.data();
  // Read only to be recorded. `adminUserIds` carries no authority: it cannot grant, and
  // it cannot widen the canonical decision below. A disagreement is written to
  // securityEvents so a cutover lockout is visible rather than silent.
  const observedLegacyGrant = Array.isArray(leagueData?.adminUserIds)
    && leagueData.adminUserIds.includes(actor.uid);
  const [scopedDecision, platformGranted] = await Promise.all([
    authorizeCapability({
      userId: actor.uid,
      scope: { scopeType: 'league', scopeId: leagueId },
      capability: requiredCapability,
      observedLegacyGrant,
      resource: `leagues/${leagueId}`,
      requestId,
    }),
    hasCapability(actor.uid, { scopeType: 'platform', scopeId: 'global' }, 'platform.admin.manage'),
  ]);
  if (!scopedDecision.granted && !platformGranted) {
    return { response: jsonError('You do not manage this league.', 403) };
  }

  return {
    result: await handler({
      actor,
      requestId,
      reason: normalizedReason,
      profile,
      league: leagueSnapshot,
      isPlatformActor,
    }),
  };
}
