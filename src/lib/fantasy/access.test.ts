import { describe, expect, it } from 'vitest';
import { isFantasyFanRole } from './access';

describe('fantasy participant access', () => {
  it('allows Fan accounts', () => {
    expect(isFantasyFanRole(undefined, 'fan')).toBe(true);
    expect(isFantasyFanRole('fan', 'fan')).toBe(true);
  });

  it.each(['athlete', 'team_admin', 'league_admin', 'platform_admin', 'super_admin'])(
    'denies %s accounts',
    (role) => {
      expect(isFantasyFanRole(role, role)).toBe(false);
    },
  );

  it('trusts a privileged claim over a stale Fan profile', () => {
    expect(isFantasyFanRole('league_admin', 'fan')).toBe(false);
  });
});
