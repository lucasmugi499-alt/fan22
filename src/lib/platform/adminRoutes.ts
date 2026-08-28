export const LEGACY_ADMIN_ROUTE_TARGETS = {
  '/admin/work': '/admin?tab=mine',
  '/admin/approvals': '/admin?tab=applications',
  '/admin/applications': '/admin/network?tab=applications',
  '/admin/leagues': '/admin/network?tab=leagues',
  '/admin/teams': '/admin/network?tab=teams',
  '/admin/athletes': '/admin/network?tab=athletes',
  '/admin/organizations': '/admin/network?tab=organizations',
  '/admin/people': '/admin/network?tab=people',
  '/admin/access': '/admin/network?tab=access',
  '/admin/competition': '/admin/integrity?tab=escalations',
  '/admin/trust': '/admin/integrity?tab=trust',
  '/admin/audit': '/admin/integrity?tab=audit',
  '/admin/finance': '/admin/money?tab=allocations',
  '/admin/sponsors': '/admin/money?tab=sponsors',
  '/admin/reports': '/admin/money?tab=reports',
  '/admin/site': '/admin/platform?tab=site',
  '/admin/control-plane': '/admin/platform?tab=controls',
  '/admin/system': '/admin/platform?tab=health',
} as const;

export type LegacyAdminRoute = keyof typeof LEGACY_ADMIN_ROUTE_TARGETS;
export type LegacySearchParams = Record<string, string | string[] | undefined>;

/** Preserve useful legacy filters without allowing an old tab name to replace the new workspace tab. */
export function legacyAdminTarget(route: LegacyAdminRoute, searchParams: LegacySearchParams = {}) {
  const target = new URL(LEGACY_ADMIN_ROUTE_TARGETS[route], 'https://goalplace256.local');
  for (const [key, rawValue] of Object.entries(searchParams)) {
    if (key === 'tab' || rawValue === undefined) continue;
    target.searchParams.delete(key);
    for (const value of Array.isArray(rawValue) ? rawValue : [rawValue]) {
      target.searchParams.append(key, value);
    }
  }
  return `${target.pathname}${target.search}`;
}

export type LegacyAdminEntity = 'application' | 'league' | 'team' | 'person' | 'campaign' | 'organization' | 'sponsor' | 'trust';

export function legacyAdminEntityTarget(kind: LegacyAdminEntity, rawId: string) {
  const id = encodeURIComponent(decodeURIComponent(rawId));
  switch (kind) {
    case 'application': return `/admin/network/applications/${id}`;
    case 'league': return `/admin/network/leagues/${id}`;
    case 'team': return `/admin/network/teams/${id}`;
    case 'person': return `/admin/network/people/${id}`;
    case 'trust': return `/admin/integrity/trust/${id}`;
    case 'campaign': return `/admin/money?tab=sponsors&campaign=${id}`;
    case 'organization': return `/admin/network?tab=organizations&organization=${id}`;
    case 'sponsor': return `/admin/money?tab=sponsors&sponsor=${id}`;
  }
}
