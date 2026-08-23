import 'server-only';

import { adminDb } from '@/lib/firebase/admin';
import { accessIndexId, isAccessIndexLive, type AccessScopeType, type PermissionCapability } from '@/lib/auth/access';
import { recordAccessDivergence } from './securityEvents';

/**
 * The single server-side capability check.
 *
 * Three separate implementations of this existed — in the platform command guard, the
 * upload authorizer and the admin command route — each re-deriving "does this actor hold
 * this capability" from the projection. One of them also accepted a legacy `adminUserIds`
 * entry as an alternative, so authority depended on which file the caller happened to
 * reach.
 *
 * The server is authoritative. A client access context may decide what to render, never
 * what is permitted.
 */

export type CapabilityScope = {
  scopeType: AccessScopeType;
  scopeId: string;
};

export function indexGrantsCapability(
  data: FirebaseFirestore.DocumentData | undefined,
  capability: PermissionCapability,
  now: Date = new Date(),
) {
  // Expiry first. A projection whose earliest contributing assignment has lapsed grants
  // nothing at all, regardless of what its capability array still says — the array is a
  // cache of a decision that is no longer valid.
  if (!isAccessIndexLive(data, now)) return false;
  const capabilities = data?.capabilities;
  return Array.isArray(capabilities) && capabilities.includes(capability);
}

/** Canonical check: does the projection for this scope grant the capability? */
export async function hasCapability(
  userId: string,
  scope: CapabilityScope,
  capability: PermissionCapability,
): Promise<boolean> {
  const snapshot = await adminDb
    .collection('accessIndex')
    .doc(accessIndexId(scope.scopeType, scope.scopeId, userId))
    .get();
  return indexGrantsCapability(snapshot.data(), capability);
}

/**
 * Canonical check that also accepts a platform-global grant, for actions a platform
 * operator performs against an organization scope.
 */
export async function hasCapabilityOrPlatformGrant(
  userId: string,
  scope: CapabilityScope,
  capability: PermissionCapability,
  platformCapability: PermissionCapability = 'platform.admin.manage',
): Promise<boolean> {
  const [scoped, platform] = await Promise.all([
    hasCapability(userId, scope, capability),
    hasCapability(userId, { scopeType: 'platform', scopeId: 'global' }, platformCapability),
  ]);
  return scoped || platform;
}

export type CanonicalDecision = {
  /** The decision enforced. Always the canonical one — there is no other arm. */
  granted: boolean;
  /**
   * What a legacy field would have decided, had it still carried authority. Recorded for
   * observability only; it can never widen `granted`.
   */
  observedLegacy: boolean;
  diverged: boolean;
};

/**
 * The enforced capability check for scoped operator commands.
 *
 * Stage C of the access migration. Until 2026-08-08 this function returned
 * `legacyGranted || canonical`, which meant a stale `adminUserIds` entry still authorized
 * after the canonical assignment had been revoked — the Admin SDK bypasses Firestore
 * Rules, so Rules could not correct it. That `OR` is gone: **canonical stands alone.**
 *
 * The legacy field is still read at the call site and passed here, but only as an
 * observation. Removing the comparison entirely would make the cutover silent — an
 * operator working from a stale `adminUserIds` entry would simply start getting 403s with
 * nothing on record explaining why. A `legacy_broader` event is precisely that person, so
 * the signal is worth more now than it was during the shadow period.
 *
 * `adminUserIds` holds zero authority. Do not reintroduce it into an authorization
 * decision; it is membership metadata.
 */
export async function authorizeCapability(input: {
  userId: string;
  scope: CapabilityScope;
  capability: PermissionCapability;
  /** What the legacy field says. Observed and recorded, never enforced. */
  observedLegacyGrant: boolean;
  resource?: string;
  requestId?: string;
}): Promise<CanonicalDecision> {
  const canonical = await hasCapability(input.userId, input.scope, input.capability);
  const diverged = canonical !== input.observedLegacyGrant;

  if (diverged) {
    await recordAccessDivergence({
      userId: input.userId,
      scopeType: input.scope.scopeType,
      scopeId: input.scope.scopeId,
      capability: input.capability,
      resource: input.resource,
      legacyDecision: input.observedLegacyGrant,
      assignmentDecision: canonical,
      requestId: input.requestId,
    });
  }

  return {
    granted: canonical,
    observedLegacy: input.observedLegacyGrant,
    diverged,
  };
}
