import { describe, expect, it } from 'vitest';
import { resolveLeagueStandings } from './resolve';
import type { Match, StoredStanding, Team } from '@/types';

/**
 * One question, asked in one place: what is this league's table, and can it be trusted?
 *
 * Four surfaces used to answer it independently — the public league page from a 120-match
 * client list, the server from a 240-match slice, discovery from a 700-match global slice
 * shared across 48 leagues, and the operator console from whatever it had. All four rendered
 * with equal confidence, and none could tell a complete season from a page of one.
 */

const SEASON = 'season_2026';

function team(id: string, name: string): Team {
  return { id, name, sport: 'football', leagueId: 'league_1', city: 'Kampala' } as Team;
}

function match(id: string, home: string, away: string, hs: number, as: number): Match {
  return {
    id,
    sport: 'football',
    leagueId: 'league_1',
    seasonId: SEASON,
    homeTeamId: home,
    teamAId: home,
    awayTeamId: away,
    teamBId: away,
    venue: 'Ground',
    city: 'Kampala',
    scheduledAt: '2026-05-01T00:00:00.000Z',
    status: 'completed',
    score: { home: hs, away: as },
    teamAScore: hs,
    teamBScore: as,
    verificationStatus: 'verified',
    supportersCount: 0,
    totalSupport: 0,
    events: [],
    createdAt: '2026-05-01T00:00:00.000Z',
  } as Match;
}

function storedRow(over: Partial<StoredStanding> = {}): StoredStanding {
  return {
    id: `${SEASON}_team_a`,
    leagueId: 'league_1',
    seasonId: SEASON,
    sport: 'football',
    teamId: 'team_a',
    teamName: 'Kampala Stars FC',
    played: 38,
    wins: 25,
    draws: 8,
    losses: 5,
    pointsFor: 70,
    pointsAgainst: 30,
    difference: 40,
    points: 83,
    rank: 1,
    ...over,
  };
}

const TEAMS = [team('team_a', 'Kampala Stars FC'), team('team_b', 'Wakiso City FC')];

describe('preferring the stored projection', () => {
  it('uses the stored rows when the season has them', () => {
    const resolved = resolveLeagueStandings({
      // A row per club. A stored set shorter than the club list is a partial slice, not a
      // table — see the "a stored table that is only part of one" block below.
      stored: [storedRow(), storedRow({ id: 'r2', teamId: 'team_b', teamName: 'Wakiso City FC', rank: 2 })],
      seasonId: SEASON,
      teams: TEAMS,
      // A deliberately contradictory local computation. If the resolver preferred this, the
      // published table would still depend on which matches a page happened to load.
      matches: [match('m1', 'team_a', 'team_b', 0, 5)],
    });
    expect(resolved.source).toBe('projection');
    expect(resolved.rows[0]).toMatchObject({ teamId: 'team_a', played: 38, points: 83 });
  });

  it('is never provisional when it came from the projection', () => {
    expect(resolveLeagueStandings({
      stored: [storedRow(), storedRow({ id: 'r2', teamId: 'team_b', teamName: 'Wakiso City FC', rank: 2 })],
      seasonId: SEASON,
      teams: TEAMS,
      matches: [],
      matchLoadLimit: 0,
    }).provisional).toBe(false);
  });

  it('orders by stored rank rather than recomputing an order', () => {
    const resolved = resolveLeagueStandings({
      stored: [
        storedRow({ id: 'r2', teamId: 'team_b', teamName: 'Wakiso City FC', rank: 2, points: 40 }),
        storedRow({ rank: 1 }),
      ],
      seasonId: SEASON,
      teams: TEAMS,
      matches: [],
    });
    expect(resolved.rows.map((row) => row.teamId)).toEqual(['team_a', 'team_b']);
  });

  it('ignores stored rows belonging to another season', () => {
    // Standings are meaningless across seasons, and the collection holds every season.
    const resolved = resolveLeagueStandings({
      stored: [storedRow({ seasonId: 'season_2025' })],
      seasonId: SEASON,
      teams: TEAMS,
      matches: [match('m1', 'team_a', 'team_b', 2, 0)],
    });
    expect(resolved.source).toBe('computed');
  });

  it('carries the adjustment and awarded counts through, defaulting rows written before they existed', () => {
    const second = storedRow({ id: 'r2', teamId: 'team_b', teamName: 'Wakiso City FC', rank: 2 });
    const withCounts = resolveLeagueStandings({
      stored: [storedRow({ adjustment: -6, awarded: 2 }), second],
      seasonId: SEASON, teams: TEAMS, matches: [],
    });
    expect(withCounts.rows[0]).toMatchObject({ adjustment: -6, awarded: 2 });

    const legacy = resolveLeagueStandings({
      stored: [storedRow(), second], seasonId: SEASON, teams: TEAMS, matches: [],
    });
    expect(legacy.rows[0]).toMatchObject({ adjustment: 0, awarded: 0 });
  });
});

describe('falling back to a local computation', () => {
  it('computes locally when the season has no stored rows yet', () => {
    // Rendering an empty table here would be a worse lie than the old one.
    const resolved = resolveLeagueStandings({
      stored: [],
      seasonId: SEASON,
      teams: TEAMS,
      matches: [match('m1', 'team_a', 'team_b', 2, 0)],
    });
    expect(resolved.source).toBe('computed');
    expect(resolved.rows[0]).toMatchObject({ teamId: 'team_a', points: 3 });
  });

  it('is not provisional when the caller states no limit', () => {
    // A caller that genuinely holds every match passes nothing, and is believed.
    expect(resolveLeagueStandings({
      stored: [], seasonId: SEASON, teams: TEAMS,
      matches: [match('m1', 'team_a', 'team_b', 2, 0)],
    }).provisional).toBe(false);
  });

  it('is not provisional when the match list came in under its limit', () => {
    expect(resolveLeagueStandings({
      stored: [], seasonId: SEASON, teams: TEAMS,
      matches: [match('m1', 'team_a', 'team_b', 2, 0)],
      matchLoadLimit: 120,
    }).provisional).toBe(false);
  });

  it('is provisional when the match list came back exactly at its limit', () => {
    // `>=`, not `>`, and this is the case that matters. Firestore returned as many documents
    // as it was asked for, so there is no way to know whether more existed. Treating that as
    // complete is the precise assumption that made the published table silently wrong.
    const matches = Array.from({ length: 3 }, (_, i) => match(`m${i}`, 'team_a', 'team_b', 1, 0));
    expect(resolveLeagueStandings({
      stored: [], seasonId: SEASON, teams: TEAMS, matches, matchLoadLimit: 3,
    }).provisional).toBe(true);
  });

  it('still returns usable rows while flagged provisional', () => {
    // The flag is a caveat on the rows, not a replacement for them. A league admin mid-season
    // still needs to see something.
    const matches = Array.from({ length: 2 }, (_, i) => match(`m${i}`, 'team_a', 'team_b', 2, 0));
    const resolved = resolveLeagueStandings({
      stored: [], seasonId: SEASON, teams: TEAMS, matches, matchLoadLimit: 2,
    });
    expect(resolved.provisional).toBe(true);
    expect(resolved.rows).toHaveLength(2);
    expect(resolved.rows[0].points).toBe(6);
  });

  it('applies points adjustments in the fallback too', () => {
    const resolved = resolveLeagueStandings({
      stored: [], seasonId: SEASON, teams: TEAMS,
      matches: [match('m1', 'team_a', 'team_b', 2, 0)],
      adjustments: [{
        id: 'adj_1', leagueId: 'league_1', seasonId: SEASON, teamId: 'team_a',
        delta: -3, reason: 'Discipline.', createdByUserId: 'u1',
        createdAt: '2026-06-01T00:00:00.000Z',
      }],
    });
    expect(resolved.rows.find((row) => row.teamId === 'team_a'))
      .toMatchObject({ points: 0, adjustment: -3 });
  });
});

describe('anonymous and signed-in convergence', () => {
  it('gives the same rows from server initialData and from a client subscription', () => {
    // The two used to disagree: the anonymous view came from the server's 240-match slice and
    // the signed-in view from the client's 120-match slice. Now both read one projection, so
    // the only way they can differ is if the projection itself changed between the reads.
    const stored = [
      storedRow({ rank: 1 }),
      storedRow({ id: 'r2', teamId: 'team_b', teamName: 'Wakiso City FC', rank: 2, points: 40 }),
    ];

    const anonymous = resolveLeagueStandings({
      stored, seasonId: SEASON, teams: TEAMS, matches: [], matchLoadLimit: 240,
    });
    const signedIn = resolveLeagueStandings({
      stored,
      seasonId: SEASON,
      teams: TEAMS,
      // A different, smaller match page — which is exactly the difference that used to
      // produce two different published tables.
      matches: [match('m1', 'team_a', 'team_b', 9, 0)],
      matchLoadLimit: 120,
    });

    expect(signedIn.rows).toEqual(anonymous.rows);
    expect(signedIn.provisional).toBe(false);
    expect(anonymous.provisional).toBe(false);
  });
});

describe('a stored table that is only part of one', () => {
  /**
   * `/discover` reads standings for every league at once, ordered by rank and capped at 1,200.
   * At 18 leagues that is every row of every table. At 1,000 leagues it is roughly the top two
   * rows of each — so a league's "table" would be two clubs.
   *
   * Before this check that came back as `source: 'projection', provisional: false`: a two-row
   * league table presented as complete and authoritative. Exactly the failure this module was
   * written to remove, reintroduced at a different scale.
   */
  const twoOfTen: StoredStanding[] = [
    storedRow({ id: 'r1', teamId: 'team_a', rank: 1 }),
    storedRow({ id: 'r2', teamId: 'team_b', teamName: 'Wakiso City FC', rank: 2 }),
  ];
  const tenTeams = Array.from({ length: 10 }, (_, i) => team(`team_${i}`, `Club ${i}`));

  it('does not present a partial slice as the table', () => {
    const resolved = resolveLeagueStandings({
      stored: twoOfTen,
      seasonId: SEASON,
      teams: tenTeams,
      matches: [match('m1', 'team_0', 'team_1', 2, 0)],
    });
    expect(resolved.source).toBe('computed');
  });

  it('marks it provisional, because neither source is known to be complete', () => {
    expect(resolveLeagueStandings({
      stored: twoOfTen, seasonId: SEASON, teams: tenTeams, matches: [],
    }).provisional).toBe(true);
  });

  it('still trusts a stored table with a row for every club', () => {
    const complete = tenTeams.map((t, i) => storedRow({
      id: `r${i}`, teamId: t.id, teamName: t.name, rank: i + 1,
    }));
    const resolved = resolveLeagueStandings({
      stored: complete, seasonId: SEASON, teams: tenTeams, matches: [],
    });
    expect(resolved.source).toBe('projection');
    expect(resolved.provisional).toBe(false);
  });

  it('catches a projection that has not caught up with a new club', () => {
    // The same check, doing a second job: a club registered since the last recomputation has
    // no row yet, and computing locally is the better answer until the rebuild lands.
    const nineOfTen = tenTeams.slice(0, 9).map((t, i) => storedRow({
      id: `r${i}`, teamId: t.id, teamName: t.name, rank: i + 1,
    }));
    expect(resolveLeagueStandings({
      stored: nineOfTen, seasonId: SEASON, teams: tenTeams, matches: [],
    }).source).toBe('computed');
  });

  it('takes stored rows at face value when the caller does not know the clubs', () => {
    // A caller reading one league's standings by leagueId has nothing to compare against and
    // is not the one at risk — the global-slice reader is.
    expect(resolveLeagueStandings({
      stored: twoOfTen, seasonId: SEASON, teams: [], matches: [],
    }).source).toBe('projection');
  });
});
