import { beforeEach, describe, expect, it, vi } from 'vitest';

const docs = new Map<string, Record<string, unknown>>();
const affiliations: Record<string, unknown>[] = [];

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => {
      if (name === 'teamAffiliations') {
        const query = {
          where: () => query,
          get: async () => ({ docs: affiliations.map((a) => ({ id: String(a.id), data: () => a })) }),
        };
        return query;
      }
      return { doc: (id: string) => ({ get: async () => ({ data: () => docs.get(`${name}/${id}`) }) }) };
    },
  },
}));

const { resolveConflictContext } = await import('./resolveConflictContext');

const NOW = new Date('2026-08-24T12:00:00.000Z');

function affiliation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aff_1',
    userId: 'user_1',
    teamId: 'team_home',
    leagueId: 'league_1',
    relationship: 'coach',
    basis: 'declared',
    declaredAt: '2026-01-01T00:00:00.000Z',
    declaredByUserId: 'user_1',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    status: 'active',
    ...overrides,
  };
}

const user = { principalType: 'user' as const, userId: 'user_1' };

beforeEach(() => {
  docs.clear();
  affiliations.length = 0;
  docs.set('matches/match_1', { homeTeamId: 'team_home', awayTeamId: 'team_away' });
});

describe('conflict of interest is separate from authorization', () => {
  it('flags an admin affiliated with a team that is playing', async () => {
    affiliations.push(affiliation());

    const context = await resolveConflictContext({ principal: user, matchId: 'match_1', now: NOW });

    expect(context.conflictWithMatch).toBe(true);
    expect(context.relationships).toEqual(['coach']);
    expect(context.basis).toBe('declared');
  });

  it('does not flag an affiliation with a club that is not in this fixture', async () => {
    affiliations.push(affiliation({ teamId: 'team_elsewhere' }));

    const context = await resolveConflictContext({ principal: user, matchId: 'match_1', now: NOW });

    expect(context.conflictWithMatch).toBe(false);
    // Still reported, because the reviewer is owed the whole picture even when it does not
    // bear on this match.
    expect(context.affiliatedTeamIds).toEqual(['team_elsewhere']);
    expect(context.basis).toBeNull();
  });

  it('ignores an affiliation that has ended', async () => {
    affiliations.push(affiliation({ effectiveTo: '2026-06-01T00:00:00.000Z' }));

    expect((await resolveConflictContext({ principal: user, matchId: 'match_1', now: NOW })).conflictWithMatch)
      .toBe(false);
  });

  it('ignores an affiliation that has not started yet', async () => {
    affiliations.push(affiliation({ effectiveFrom: '2027-01-01T00:00:00.000Z' }));

    expect((await resolveConflictContext({ principal: user, matchId: 'match_1', now: NOW })).conflictWithMatch)
      .toBe(false);
  });

  it('reports a league-recorded basis ahead of a self-declared one', async () => {
    // What the league wrote down outranks what the person said, when explaining an escalation.
    affiliations.push(affiliation(), affiliation({ id: 'aff_2', basis: 'league_recorded', relationship: 'owner' }));

    const context = await resolveConflictContext({ principal: user, matchId: 'match_1', now: NOW });

    expect(context.basis).toBe('league_recorded');
    expect(context.relationships.sort()).toEqual(['coach', 'owner']);
  });

  it('never flags a match ops session, which has no club allegiance to declare', async () => {
    affiliations.push(affiliation());

    const context = await resolveConflictContext({
      principal: {
        principalType: 'match_ops_session',
        matchSessionId: 'mos_1',
        fieldManagerAssignmentId: 'fma_1',
      },
      matchId: 'match_1',
      now: NOW,
    });

    expect(context.conflictWithMatch).toBe(false);
  });

  it('never flags the system principal', async () => {
    affiliations.push(affiliation());

    expect((await resolveConflictContext({
      principal: { principalType: 'system', component: 'finalizer' },
      matchId: 'match_1',
      now: NOW,
    })).conflictWithMatch).toBe(false);
  });
});
