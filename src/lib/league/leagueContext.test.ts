import { describe, expect, it } from 'vitest';
import type { AccessContext } from '@/lib/auth/access';
import type { League, UserProfile } from '@/types';
import { resolveMyLeague } from './leagueContext';

const profile = { id: 'user_1', uid: 'user_1' } as UserProfile;
const leagues = [
  { id: 'league_a', name: 'A', adminUserIds: [] },
  { id: 'league_b', name: 'B', adminUserIds: ['other_user'] },
] as League[];

function accessContext(leagueId: string): AccessContext {
  return {
    userId: 'user_1',
    accessVersion: 1,
    indexes: [{
      userId: 'user_1',
      scopeType: 'league',
      scopeId: leagueId,
      activeRoles: ['league_owner'],
      capabilities: ['league.profile.manage'],
      assignmentIds: ['assignment_1'],
      accessVersion: 1,
      updatedAt: '2026-07-31T00:00:00.000Z',
    }],
  };
}

describe('resolveMyLeague', () => {
  it('uses scoped league assignments when legacy admin arrays are empty', () => {
    expect(resolveMyLeague(profile, leagues, [], false, accessContext('league_a'))?.id).toBe('league_a');
  });

  it('does not open an unrelated league for a real unassigned account', () => {
    expect(resolveMyLeague(profile, leagues, [], false, accessContext('league_missing'))).toBeNull();
  });
});

describe('legacy admin arrays no longer grant console membership', () => {
  /**
   * The console used to fall back to `adminUserIds`, which meant it disagreed with the
   * server: a revoked operator still saw and could select a league whose every action the
   * server would then refuse with a 403. Technically secure, operationally broken — and from
   * the operator's side, indistinguishable from the product being broken.
   */
  it('ignores a stale adminUserIds entry with no canonical scope', () => {
    const staleLeagues = [
      { id: 'league_stale', name: 'Stale', adminUserIds: ['user_1'] },
    ] as League[];

    expect(resolveMyLeague(profile, staleLeagues, [], false, undefined)).toBeNull();
  });

  it('still resolves a league the operator canonically holds', () => {
    expect(resolveMyLeague(profile, leagues, [], false, accessContext('league_b'))?.id).toBe('league_b');
  });
});
