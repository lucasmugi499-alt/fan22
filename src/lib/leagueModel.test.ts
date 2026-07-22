import { describe, expect, it } from 'vitest';
import { Match, MatchStatus, Team, VerificationStatus } from '@/types';
import { buildLeagueStandings } from './leagueModel';
import { isOfficialMatch } from './status';

/**
 * These assertions deliberately run against `buildLeagueStandings`, not against
 * `isOfficialMatch` alone. The original defect was that the standings builder never
 * consulted a verification predicate at all — so a suite that only exercised the predicate
 * would have been fully green while every table in the product stayed wrong. Testing the
 * predicate is a supplement; testing the numbers is the point.
 */

function team(id: string, name: string): Team {
  return {
    id,
    name,
    sport: 'football',
    leagueId: 'league_001',
    city: 'Kampala',
    country: 'Uganda',
    description: `${name} test fixture`,
    plan: 'free',
    verified: true,
    adminUserIds: [],
    totalSupport: 0,
    supportersCount: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    leaguePoints: 0,
    createdAt: '2026-05-01T00:00:00.000Z',
  };
}

function match(
  id: string,
  status: MatchStatus,
  verificationStatus: VerificationStatus,
  homeScore = 2,
  awayScore = 1
): Match {
  return {
    id,
    sport: 'football',
    leagueId: 'league_001',
    homeTeamId: 'team_a',
    awayTeamId: 'team_b',
    teamAId: 'team_a',
    teamBId: 'team_b',
    venue: 'Old Kampala Grounds',
    city: 'Kampala',
    scheduledAt: '2026-05-30T03:03:00.243Z',
    status,
    score: { home: homeScore, away: awayScore },
    teamAScore: homeScore,
    teamBScore: awayScore,
    verificationStatus,
    supportersCount: 0,
    totalSupport: 0,
    events: [],
    createdAt: '2026-05-01T00:00:00.000Z',
  };
}

const TEAMS = [team('team_a', 'Kampala Stars FC'), team('team_b', 'Wakiso City FC')];

function standingFor(teamId: string, matches: Match[]) {
  const row = buildLeagueStandings(TEAMS, matches).find((entry) => entry.teamId === teamId);
  if (!row) throw new Error(`no standing row for ${teamId}`);
  return row;
}

describe('buildLeagueStandings only counts official results', () => {
  const CASES: [string, MatchStatus, VerificationStatus, boolean][] = [
    ['completed + verified', 'completed', 'verified', true],
    ['completed + pending', 'completed', 'pending', false],
    ['completed + disputed', 'completed', 'disputed', false],
    ['completed + rejected', 'completed', 'rejected', false],
    ['scheduled + verified', 'scheduled', 'verified', false],
    ['live + verified', 'live', 'verified', false],
    ['cancelled + verified', 'cancelled', 'verified', false],
  ];

  for (const [name, status, verificationStatus, shouldCount] of CASES) {
    it(`${name} ${shouldCount ? 'counts' : 'does not count'}`, () => {
      const row = standingFor('team_a', [match('m1', status, verificationStatus)]);
      expect(row.played).toBe(shouldCount ? 1 : 0);
      expect(row.points).toBe(shouldCount ? 3 : 0);
      expect(row.pointsFor).toBe(shouldCount ? 2 : 0);
    });
  }
});

describe('verifying a result changes the table', () => {
  it('moves points, played and goal difference when pending becomes verified', () => {
    const before = standingFor('team_a', [match('m1', 'completed', 'pending')]);
    const after = standingFor('team_a', [match('m1', 'completed', 'verified')]);

    expect(before.played).toBe(0);
    expect(before.points).toBe(0);
    expect(before.difference).toBe(0);

    expect(after.played).toBe(1);
    expect(after.points).toBe(3);
    expect(after.wins).toBe(1);
    expect(after.difference).toBe(1);
  });

  it('excludes only the unverified fixtures from a mixed set', () => {
    const matches = [
      match('official_1', 'completed', 'verified', 3, 0),
      match('pending_1', 'completed', 'pending', 5, 0),
      match('disputed_1', 'completed', 'disputed', 4, 0),
      match('scheduled_1', 'scheduled', 'pending', 0, 0),
    ];

    const row = standingFor('team_a', matches);
    expect(row.played).toBe(1);
    expect(row.points).toBe(3);
    // Would be 12 if the unverified fixtures leaked into the table.
    expect(row.pointsFor).toBe(3);
  });

  it('keeps the losing side consistent with the winner', () => {
    const matches = [match('official_1', 'completed', 'verified', 2, 1)];
    expect(standingFor('team_b', matches)).toMatchObject({
      played: 1,
      wins: 0,
      losses: 1,
      points: 0,
      difference: -1,
    });
  });
});

describe('isOfficialMatch', () => {
  it('requires both a played lifecycle and a verified result', () => {
    expect(isOfficialMatch({ status: 'completed', verificationStatus: 'verified' })).toBe(true);
    expect(isOfficialMatch({ status: 'completed', verificationStatus: 'pending' })).toBe(false);
    expect(isOfficialMatch({ status: 'scheduled', verificationStatus: 'verified' })).toBe(false);
  });
});
