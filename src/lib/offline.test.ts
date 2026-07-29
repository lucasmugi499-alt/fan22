import { describe, expect, it } from 'vitest';
import { privateCacheNamespace } from './offline';

describe('private cache namespace', () => {
  it('partitions records by deployment, identity, role, assignment scope and query version', () => {
    const base = {
      projectId: 'staging-project',
      databaseId: 'fg256',
      dataMode: 'firebase',
      uid: 'user-a',
      role: 'team_admin',
      leagueId: 'league-a',
      teamId: 'team-a',
      queryVersion: 'v2',
    };
    const key = privateCacheNamespace(base);
    expect(privateCacheNamespace({ ...base, uid: 'user-b' })).not.toBe(key);
    expect(privateCacheNamespace({ ...base, role: 'fan' })).not.toBe(key);
    expect(privateCacheNamespace({ ...base, teamId: 'team-b' })).not.toBe(key);
    expect(privateCacheNamespace({ ...base, queryVersion: 'v3' })).not.toBe(key);
  });
});
