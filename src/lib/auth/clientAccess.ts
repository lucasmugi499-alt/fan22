import type { AppRole } from '@/types';
import type { AccessContext, AccessIndexDocument, PermissionCapability } from './access';

const LEAGUE_ROLES = new Set(['league_owner', 'league_admin', 'league_operator', 'league_verifier']);
const TEAM_ROLES = new Set(['team_owner', 'team_admin', 'roster_manager', 'result_reporter', 'content_manager']);
const ATHLETE_ROLES = new Set(['athlete_self', 'athlete_guardian']);

function hasRole(indexes: AccessIndexDocument[], roles: Set<string>) {
  return indexes.some((index) => index.activeRoles.some((role) => roles.has(role)));
}

export function roleFromAccessContext(context?: AccessContext): AppRole | null {
  const indexes = context?.indexes ?? [];
  if (hasRole(indexes, new Set(['super_admin']))) return 'super_admin';
  if (hasRole(indexes, new Set(['platform_admin', 'platform_reviewer', 'platform_support']))) return 'platform_admin';
  if (hasRole(indexes, LEAGUE_ROLES)) return 'league_admin';
  if (hasRole(indexes, TEAM_ROLES)) return 'team_admin';
  if (hasRole(indexes, ATHLETE_ROLES)) return 'athlete';
  return null;
}

export function resolveEffectiveRole(accountRole: AppRole | null, context?: AccessContext): AppRole | null {
  if (accountRole === 'super_admin' || accountRole === 'platform_admin') return accountRole;
  return roleFromAccessContext(context) ?? accountRole;
}

export function scopedIdsForAccess(
  context: AccessContext | undefined,
  scopeType: 'league' | 'team' | 'athlete',
  capability?: PermissionCapability,
) {
  return new Set(
    (context?.indexes ?? [])
      .filter((index) =>
        index.scopeType === scopeType
        && (!capability || index.capabilities.includes(capability))
      )
      .map((index) => index.scopeId),
  );
}
