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

/**
 * Capabilities that a superseded name still satisfies, until projections are rebuilt.
 *
 * ADR-003 renamed and split the League capabilities. Changing the catalogue does not rewrite
 * already-materialized projections, so between the deploy and the rebuild every stored league
 * index carries only the old names. Without this map, a League Admin would be refused athlete
 * creation, claim verification, evidence review, field-manager assignment and post-match entry
 * on the day the new application shipped, and nothing about the deploy would have suggested it.
 *
 * The Rules helper was widened for precisely this reason and the server check was not, which is
 * the kind of half-migration that looks complete because one of the two enforcement points was
 * remembered.
 *
 * Every mapping is a genuine equivalence rather than a convenience. Each superseded capability
 * was held by the same bundle and covered the same domain, so this restores the status quo for
 * existing operators rather than granting anybody something they did not have:
 *
 *   team.manage          was team.create
 *   roster.manage        was roster.verify
 *   athlete.manage       was roster.verify, which is what verifying a roster meant
 *   fixture.manage       was implicit in season.manage
 *   result.enter         a league that could resolve a result could set one
 *   match.takeover       the same adjudication authority
 *   field_manager.manage running the competition, which season.manage expressed
 *
 * This map is deleted once `access:sunset-invariants` reports zero stale projections. It is
 * migration scaffolding, and leaving it in place would quietly make two spellings permanent.
 */
const SUPERSEDED_CAPABILITY_EQUIVALENTS: Partial<Record<PermissionCapability, PermissionCapability[]>> = {
  'league.team.manage': ['league.team.create'],
  'league.roster.manage': ['league.roster.verify'],
  'league.athlete.manage': ['league.roster.verify'],
  'league.fixture.manage': ['league.season.manage'],
  'league.result.enter': ['league.result.resolve'],
  'league.match.takeover': ['league.result.resolve'],
  'league.field_manager.manage': ['league.season.manage'],
};

/** The capability asked for, plus any superseded spelling that still satisfies it. */
export function acceptedSpellings(capability: PermissionCapability): PermissionCapability[] {
  return [capability, ...(SUPERSEDED_CAPABILITY_EQUIVALENTS[capability] ?? [])];
}

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
  if (!Array.isArray(capabilities)) return false;
  // Either spelling, while stored projections still carry the pre-ADR-003 names.
  return acceptedSpellings(capability).some((accepted) => capabilities.includes(accepted));
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
