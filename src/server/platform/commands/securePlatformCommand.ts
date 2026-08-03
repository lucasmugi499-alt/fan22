import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { accessIndexId, type PermissionCapability } from '@/lib/auth/access';
import { compareLegacyCapability, indexGrantsCapability } from '@/server/access/capabilities';
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

  if (requiredCapability && String(actor.role) !== 'super_admin') {
    const platformAccess = await adminDb
      .collection('accessIndex')
      .doc(accessIndexId('platform', 'global', actor.uid))
      .get();
    const hasRoleGrant = String(actor.role) === 'platform_admin';
    if (!hasRoleGrant && !indexGrantsCapability(platformAccess.data(), requiredCapability)) {
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

  if (!isPlatformActor) {
    const leagueData = leagueSnapshot.data();
    const isLegacyAdmin = Array.isArray(leagueData?.adminUserIds) && leagueData.adminUserIds.includes(actor.uid);
    // Stage A of the access migration. Legacy stays enforced, the canonical decision is
    // computed alongside it, and disagreements are recorded durably. `legacy_broader`
    // events are operators still working from a stale adminUserIds entry after their
    // assignment was revoked — that population must reach zero before Stage C drops the
    // legacy arm and leaves canonical standing alone.
    const decision = await compareLegacyCapability({
      userId: actor.uid,
      scope: { scopeType: 'league', scopeId: leagueId },
      capability: requiredCapability,
      legacyGranted: isLegacyAdmin,
      resource: `leagues/${leagueId}`,
      requestId,
    });
    if (!decision.granted) {
      return { response: jsonError('You do not manage this league.', 403) };
    }
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
