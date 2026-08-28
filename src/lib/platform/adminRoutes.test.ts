import { describe, expect, it } from 'vitest';
import { LEGACY_ADMIN_ROUTE_TARGETS, legacyAdminEntityTarget, legacyAdminTarget } from './adminRoutes';

describe('Platform Console route migration map', () => {
  it('folds every legacy directory into one of the five Platform destinations', () => {
    expect(Object.keys(LEGACY_ADMIN_ROUTE_TARGETS)).toHaveLength(18);
    for (const target of Object.values(LEGACY_ADMIN_ROUTE_TARGETS)) {
      expect(['/admin', '/admin/network', '/admin/integrity', '/admin/money', '/admin/platform'])
        .toContain(target.split('?')[0]);
    }
  });

  it('preserves meaningful filters without replacing the destination tab', () => {
    expect(legacyAdminTarget('/admin/applications', { tab: 'old', query: 'Kampala', status: ['pending', 'risk'] }))
      .toBe('/admin/network?tab=applications&query=Kampala&status=pending&status=risk');
  });

  it('preserves entity identifiers in their new workbench or folded view', () => {
    expect(legacyAdminEntityTarget('league', 'league/a')).toBe('/admin/network/leagues/league%2Fa');
    expect(legacyAdminEntityTarget('trust', 'case 1')).toBe('/admin/integrity/trust/case%201');
    expect(legacyAdminEntityTarget('campaign', 'spring')).toBe('/admin/money?tab=sponsors&campaign=spring');
  });
});
