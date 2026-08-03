import 'server-only';

import { adminDb } from '@/lib/firebase/admin';
import { accessIndexId, type AccessScopeType, type PermissionCapability } from '@/lib/auth/access';
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
) {
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

export type LegacyComparedDecision = {
  /** The decision actually enforced right now. */
  granted: boolean;
  canonical: boolean;
  legacy: boolean;
  diverged: boolean;
};

/**
 * Stage A of the access migration: legacy remains the enforced authority while the
 * canonical decision is computed alongside it and every disagreement is recorded
 * durably.
 *
 * This deliberately preserves today's behaviour, including its flaw — a stale
 * `adminUserIds` entry still authorizes after the canonical assignment was revoked. That
 * is why the recorded divergence matters: `legacy_broader` events are the exact
 * population that must reach zero before Stage C removes the legacy arm. Do not carry
 * this helper past the cutover; canonical must then stand alone, with no `OR`.
 */
export async function compareLegacyCapability(input: {
  userId: string;
  scope: CapabilityScope;
  capability: PermissionCapability;
  legacyGranted: boolean;
  resource?: string;
  requestId?: string;
}): Promise<LegacyComparedDecision> {
  const canonical = await hasCapability(input.userId, input.scope, input.capability);
  const diverged = canonical !== input.legacyGranted;

  if (diverged) {
    await recordAccessDivergence({
      userId: input.userId,
      scopeType: input.scope.scopeType,
      scopeId: input.scope.scopeId,
      capability: input.capability,
      resource: input.resource,
      legacyDecision: input.legacyGranted,
      assignmentDecision: canonical,
      requestId: input.requestId,
    });
  }

  return {
    granted: input.legacyGranted || canonical,
    canonical,
    legacy: input.legacyGranted,
    diverged,
  };
}
