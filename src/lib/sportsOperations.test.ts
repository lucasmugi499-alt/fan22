import { describe, expect, it } from 'vitest';
import { buildLeagueStandings } from './leagueModel';
import { stateForMatch } from './statusSystem';
import type { Match, PointsAdjustment, Team } from '@/types';

/**
 * Results decided off the field, and points changes no match produced.
 *
 * Grassroots leagues run on these constantly — a club fails to show, fields a suspended
 * player, or is docked points for discipline. GoalPlace had no representation for any of it:
 * the words `forfeit`, `walkover` and `pointsDeduction` did not appear in the codebase, and
 * `buildLeagueStandings` read only `teamAScore`/`teamBScore` from official matches with no
 * deduction term and no awarded-result flag.
 *
 * So a league awarding a 3-0 walkover had nowhere to put it. The fixture sat unresolved and
 * GoalPlace's table stayed permanently one result behind the league's own — which is how a
 * pilot is lost: the operator stops trusting the product, keeps the spreadsheet, and the
 * spreadsheet becomes the real table.
 */

const SEASON = 'season_2026';

function team(id: string, name: string): Team {
  return { id, name, leagueId: 'league_1', sport: 'football', city: 'Kampala' } as Team;
}

const TEAMS = [team('team_a', 'Kampala Stars'), team('team_b', 'Wakiso City')];

function match(over: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    sport: 'football',
    leagueId: 'league_1',
    seasonId: SEASON,
    homeTeamId: 'team_a',
    teamAId: 'team_a',
    awayTeamId: 'team_b',
    teamBId: 'team_b',
    venue: 'Ground',
    city: 'Kampala',
    scheduledAt: '2026-05-01T00:00:00.000Z',
    status: 'completed',
    verificationStatus: 'verified',
    score: { home: 3, away: 0 },
    teamAScore: 3,
    teamBScore: 0,
    supportersCount: 0,
    totalSupport: 0,
    events: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as Match;
}

const RULING = {
  reason: 'forfeit' as const,
  note: 'Wakiso City did not field a team.',
  ruledByUserId: 'league_admin_1',
  ruledAt: '2026-05-02T00:00:00.000Z',
};

function adjustment(over: Partial<PointsAdjustment> = {}): PointsAdjustment {
  return {
    id: 'adj_1',
    leagueId: 'league_1',
    seasonId: SEASON,
    teamId: 'team_a',
    delta: -3,
    reason: 'Fielding a suspended player.',
    createdByUserId: 'league_admin_1',
    createdAt: '2026-06-01T00:00:00.000Z',
    ...over,
  };
}

describe('an awarded walkover', () => {
  const awarded = [match({ awardedResult: RULING })];

  it('counts in the table at full weight', () => {
    // It IS the official result. Weighting it differently would be inventing a rule no league
    // asked for, and would put GoalPlace's table back out of step with the league's own.
    const row = buildLeagueStandings(TEAMS, awarded, { seasonId: SEASON })
      .find((entry) => entry.teamId === 'team_a');
    expect(row).toMatchObject({ played: 1, wins: 1, points: 3, pointsFor: 3 });
  });

  it('is counted against the opponent as a loss, not ignored', () => {
    const row = buildLeagueStandings(TEAMS, awarded, { seasonId: SEASON })
      .find((entry) => entry.teamId === 'team_b');
    expect(row).toMatchObject({ played: 1, losses: 1, points: 0, pointsAgainst: 3 });
  });

  it('is labelled, so a club can see which of its results were rulings', () => {
    const row = buildLeagueStandings(TEAMS, awarded, { seasonId: SEASON })
      .find((entry) => entry.teamId === 'team_a');
    expect(row?.awarded).toBe(1);
  });

  it('leaves a played result unlabelled', () => {
    const row = buildLeagueStandings(TEAMS, [match()], { seasonId: SEASON })
      .find((entry) => entry.teamId === 'team_a');
    expect(row?.awarded).toBe(0);
  });

  it('reads as its own state rather than an ordinary official result', () => {
    // Equally official, different provenance — which is precisely what a reader needs to see.
    // A 3-0 nobody played, presented identically to a 3-0 somebody did, is a table entry that
    // cannot be questioned and should be.
    expect(stateForMatch(match({ awardedResult: RULING })).id).toBe('awarded');
    expect(stateForMatch(match()).id).toBe('official');
  });

  it('is not treated as awarded before it is verified', () => {
    expect(stateForMatch(match({ verificationStatus: 'pending', awardedResult: RULING })).id)
      .not.toBe('awarded');
  });

  it('carries who ruled and why, so the table traces back to a decision', () => {
    const ruling = match({ awardedResult: RULING }).awardedResult;
    expect(ruling).toMatchObject({
      reason: 'forfeit',
      ruledByUserId: 'league_admin_1',
      note: expect.stringContaining('did not field a team'),
    });
  });
});

describe('a points deduction', () => {
  const drawn = [match({ score: { home: 1, away: 1 }, teamAScore: 1, teamBScore: 1 })];

  it('reduces the total and is reported separately', () => {
    const row = buildLeagueStandings(TEAMS, drawn, {
      seasonId: SEASON, adjustments: [adjustment()],
    }).find((entry) => entry.teamId === 'team_a');
    // A table showing a deduction without saying so is a table the league will not trust.
    expect(row).toMatchObject({ points: -2, adjustment: -3 });
  });

  it('applies after every match is counted, so the result is order independent', () => {
    const forwards = buildLeagueStandings(TEAMS, drawn, {
      seasonId: SEASON, adjustments: [adjustment({ id: 'a' }), adjustment({ id: 'b', delta: -1 })],
    });
    const backwards = buildLeagueStandings(TEAMS, [...drawn].reverse(), {
      seasonId: SEASON, adjustments: [adjustment({ id: 'b', delta: -1 }), adjustment({ id: 'a' })],
    });
    // The property the stored projection depends on to be safely recomputable at any time.
    expect(backwards).toEqual(forwards);
  });

  it('accepts a positive delta, for a restoration on appeal', () => {
    const row = buildLeagueStandings(TEAMS, drawn, {
      seasonId: SEASON, adjustments: [adjustment({ delta: 3, reason: 'Overturned on appeal.' })],
    }).find((entry) => entry.teamId === 'team_a');
    expect(row).toMatchObject({ points: 4, adjustment: 3 });
  });

  it('stops counting once rescinded, without the record being deleted', () => {
    const row = buildLeagueStandings(TEAMS, drawn, {
      seasonId: SEASON,
      adjustments: [adjustment({ rescindedAt: '2026-06-08T00:00:00.000Z' })],
    }).find((entry) => entry.teamId === 'team_a');
    expect(row).toMatchObject({ points: 1, adjustment: 0 });
  });

  it('ignores an adjustment belonging to another season', () => {
    const row = buildLeagueStandings(TEAMS, drawn, {
      seasonId: SEASON, adjustments: [adjustment({ seasonId: 'season_2025' })],
    }).find((entry) => entry.teamId === 'team_a');
    expect(row?.adjustment).toBe(0);
  });

  it('ignores an adjustment for a club no longer in the table', () => {
    // A club can be withdrawn from a league after being docked. A stale record must not be
    // able to break the whole table.
    expect(() => buildLeagueStandings(TEAMS, drawn, {
      seasonId: SEASON, adjustments: [adjustment({ teamId: 'team_gone' })],
    })).not.toThrow();
  });

  it('re-ranks the table, because a deduction that does not move a club is not a deduction', () => {
    const rows = buildLeagueStandings(TEAMS, [match()], {
      seasonId: SEASON, adjustments: [adjustment({ delta: -6 })],
    });
    // Winner on the field, last in the table.
    expect(rows[0].teamId).toBe('team_b');
    expect(rows[1]).toMatchObject({ teamId: 'team_a', points: -3 });
  });
});
