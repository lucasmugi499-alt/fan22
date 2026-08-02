import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { accessIndexId, type PermissionCapability } from '@/lib/auth/access';
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

function isRestrictedStatus(status: unknown) {
  return status === 'suspended' || status === 'disabled' || status === 'deletion_pending';
}

function hasCapability(snapshot: FirebaseFirestore.DocumentSnapshot, capability: PermissionCapability) {
  const capabilities = snapshot.data()?.capabilities;
  return Array.isArray(capabilities) && capabilities.includes(capability);
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
    if (!hasRoleGrant && !hasCapability(platformAccess, requiredCapability)) {
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
