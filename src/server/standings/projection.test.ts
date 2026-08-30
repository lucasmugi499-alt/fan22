import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { fakeFirestore } from './fakeFirestore';
import {
  MAX_SEASON_MATCHES,
  recomputeSeasonStandings,
  recomputeStandingsAfterFinalization,
  standingDocumentId,
  standingsAreConverged,
} from './projection';
import { buildLeagueStandings } from '../../lib/leagueModel';
import type { Match, Team } from '../../types';

/**
 * The defect this replaces, stated once so the assertions below have a subject:
 *
 * standings were computed IN THE BROWSER from whatever matches a page had loaded. The server
 * sent the public league page 240 matches with no `orderBy` — Firestore key order, an
 * arbitrary subset — and the client then fetched 120 of its own and replaced the server's set
 * with the smaller one. Past ~120 fixtures the published table was computed from an arbitrary
 * slice, silently, and anonymous and signed-in visitors saw different tables of the same
 * league.
 *
 * So the tests that matter are not "does it add up" — the pure function already has those.
 * They are: does it read the WHOLE season, is it byte-identically repeatable, and does it
 * refuse rather than truncate.
 */

const SEASON = 'season_2026';
const LEAGUE = 'league_kampala';

function team(index: number): Team {
  return {
    id: `team_${String(index).padStart(2, '0')}`,
    name: `Club ${String(index).padStart(2, '0')}`,
    sport: 'football',
    leagueId: LEAGUE,
    city: 'Kampala',
  } as Team;
}

function match(input: {
  id: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  seasonId?: string;
  verified?: boolean;
  awarded?: boolean;
}): Match {
  return {
    id: input.id,
    sport: 'football',
    leagueId: LEAGUE,
    seasonId: input.seasonId ?? SEASON,
    homeTeamId: input.home,
    teamAId: input.home,
    awayTeamId: input.away,
    teamBId: input.away,
    venue: 'Ground',
    city: 'Kampala',
    scheduledAt: '2026-05-01T00:00:00.000Z',
    status: 'completed',
    score: { home: input.homeScore, away: input.awayScore },
    teamAScore: input.homeScore,
    teamBScore: input.awayScore,
    verificationStatus: (input.verified ?? true) ? 'verified' : 'pending',
    supportersCount: 0,
    totalSupport: 0,
    events: [],
    createdAt: '2026-05-01T00:00:00.000Z',
    ...(input.awarded
      ? {
        awardedResult: {
          reason: 'forfeit' as const,
          note: 'Away club did not field a team.',
          ruledByUserId: 'league_admin_1',
          ruledAt: '2026-05-02T00:00:00.000Z',
        },
      }
      : {}),
  } as Match;
}

/**
 * A full double round robin, which is the scale the browser computation broke at.
 *
 * 20 teams double round robin is 380 fixtures. The old client path loaded 120.
 */
function doubleRoundRobin(teamCount: number) {
  const teams = Array.from({ length: teamCount }, (_, index) => team(index + 1));
  const matches: Match[] = [];
  let n = 0;
  for (const home of teams) {
    for (const away of teams) {
      if (home.id === away.id) continue;
      n += 1;
      // Deterministic, spread scores so the table has a real ordering rather than a tie.
      const homeScore = (n * 7) % 5;
      const awayScore = (n * 3) % 4;
      matches.push({
        ...match({
          id: `match_${String(n).padStart(4, '0')}`,
          home: home.id,
          away: away.id,
          homeScore,
          awayScore,
        }),
      });
    }
  }
  return { teams, matches };
}

function seeded(teams: Team[], matches: Match[], extra: { adjustments?: unknown[] } = {}) {
  const fake = fakeFirestore();
  fake.seed('seasons', [{
    id: SEASON, leagueId: LEAGUE, sport: 'football', name: '2026 Season', status: 'active',
  }]);
  fake.seed('teams', teams as unknown as Record<string, unknown>[]);
  fake.seed('matches', matches as unknown as Record<string, unknown>[]);
  if (extra.adjustments) {
    fake.seed('pointsAdjustments', extra.adjustments as Record<string, unknown>[]);
  }
  return fake;
}

describe('a season larger than the old client limit', () => {
  const { teams, matches } = doubleRoundRobin(20);

  it('builds the fixture list this test claims to build', () => {
    // Guarding the fixture: a round robin generator that quietly produced 12 matches would
    // make every assertion below vacuous.
    expect(matches).toHaveLength(380);
    expect(matches.length).toBeGreaterThan(240); // the old server limit
    expect(matches.length).toBeGreaterThan(120); // the old client limit that replaced it
  });

  it('publishes a table computed from every fixture, not a slice of them', async () => {
    const fake = seeded(teams, matches);
    const result = await recomputeSeasonStandings(fake.db as Firestore, SEASON);

    expect(result?.officialMatches).toBe(380);
    expect(result?.rowsWritten).toBe(20);
    // 380 fixtures across 20 clubs, each club playing 38.
    const rows = fake.documents('standings');
    expect(rows.every((row) => row.played === 38)).toBe(true);
  });

  it('matches an independent computation over the full match list, row for row', async () => {
    // The acceptance criterion, verbatim: a league with hundreds of verified fixtures
    // publishes a table identical to a hand computation.
    const fake = seeded(teams, matches);
    await recomputeSeasonStandings(fake.db as Firestore, SEASON);

    const expected = buildLeagueStandings(teams, matches, { seasonId: SEASON });
    const stored = fake.documents('standings')
      .sort((a, b) => Number(a.rank) - Number(b.rank));

    expect(stored).toHaveLength(expected.length);
    expected.forEach((row, index) => {
      expect(stored[index]).toMatchObject({
        teamId: row.teamId,
        played: row.played,
        wins: row.wins,
        draws: row.draws,
        losses: row.losses,
        pointsFor: row.pointsFor,
        pointsAgainst: row.pointsAgainst,
        difference: row.difference,
        points: row.points,
        rank: index + 1,
      });
    });
  });

  it('reads the table as one scoped query rather than scanning matches', async () => {
    const fake = seeded(teams, matches);
    await recomputeSeasonStandings(fake.db as Firestore, SEASON);
    // Scoped to the season, not the league: a league's matches span seasons, and a
    // league-scoped query is what grows without bound as a league ages.
    expect(fake.reads).toContain(`matches[seasonId==${SEASON}]:${MAX_SEASON_MATCHES + 1}`);
  });
});

describe('determinism', () => {
  it('produces byte-identical documents when run twice', async () => {
    const { teams, matches } = doubleRoundRobin(8);
    const fake = seeded(teams, matches);
    const frozen = () => new Date('2026-08-29T00:00:00.000Z');

    await recomputeSeasonStandings(fake.db as Firestore, SEASON, { now: frozen });
    const first = JSON.stringify(fake.documents('standings'));
    await recomputeSeasonStandings(fake.db as Firestore, SEASON, { now: frozen });
    const second = JSON.stringify(fake.documents('standings'));

    // This is what makes a corrupted table repairable by re-running rather than by
    // archaeology, and it is why nothing here increments a stored counter.
    expect(second).toBe(first);
  });

  it('does not double-count on a second pass', async () => {
    const { teams, matches } = doubleRoundRobin(4);
    const fake = seeded(teams, matches);
    await recomputeSeasonStandings(fake.db as Firestore, SEASON);
    const after1 = fake.documents('standings').map((row) => row.points);
    await recomputeSeasonStandings(fake.db as Firestore, SEASON);
    await recomputeSeasonStandings(fake.db as Firestore, SEASON);
    expect(fake.documents('standings').map((row) => row.points)).toEqual(after1);
  });
});

describe('what the table counts', () => {
  const teams = [team(1), team(2), team(3)];

  it('counts only official results', async () => {
    const fake = seeded(teams, [
      match({ id: 'm1', home: 'team_01', away: 'team_02', homeScore: 2, awayScore: 0 }),
      match({ id: 'm2', home: 'team_01', away: 'team_03', homeScore: 5, awayScore: 0, verified: false }),
    ]);
    await recomputeSeasonStandings(fake.db as Firestore, SEASON);
    const leader = fake.documents('standings').find((row) => row.teamId === 'team_01');
    expect(leader).toMatchObject({ played: 1, points: 3, pointsFor: 2 });
  });

  it('ignores matches belonging to another season', async () => {
    const fake = seeded(teams, [
      match({ id: 'm1', home: 'team_01', away: 'team_02', homeScore: 2, awayScore: 0 }),
      match({ id: 'm2', home: 'team_01', away: 'team_03', homeScore: 9, awayScore: 0, seasonId: 'season_2025' }),
    ]);
    await recomputeSeasonStandings(fake.db as Firestore, SEASON);
    expect(fake.documents('standings').find((row) => row.teamId === 'team_01'))
      .toMatchObject({ played: 1, pointsFor: 2 });
  });

  it('removes a row for a team that has left the league', async () => {
    const fake = seeded(teams, [
      match({ id: 'm1', home: 'team_01', away: 'team_02', homeScore: 1, awayScore: 1 }),
    ]);
    // A row from a previous recomputation, for a club since withdrawn. Nothing would ever
    // overwrite it, and a stale row in a publicly readable collection is the exact failure
    // this projection exists to remove.
    fake.seed('standings', [{
      id: standingDocumentId(SEASON, 'team_99'),
      seasonId: SEASON, leagueId: LEAGUE, teamId: 'team_99', teamName: 'Withdrawn FC',
      played: 6, points: 12, rank: 1,
    }]);

    const result = await recomputeSeasonStandings(fake.db as Firestore, SEASON);

    expect(result?.rowsRemoved).toBe(1);
    expect(fake.documents('standings').some((row) => row.teamId === 'team_99')).toBe(false);
  });

  it('writes one row per team, keyed deterministically', async () => {
    const fake = seeded(teams, []);
    await recomputeSeasonStandings(fake.db as Firestore, SEASON);
    expect(fake.documents('standings').map((row) => row.id).sort()).toEqual([
      `${SEASON}_team_01`,
      `${SEASON}_team_02`,
      `${SEASON}_team_03`,
    ]);
  });
});

describe('results decided off the field', () => {
  const teams = [team(1), team(2)];

  it('counts an awarded walkover in the table at full weight', async () => {
    // A league that awards a 3-0 walkover and cannot record it keeps a spreadsheet, and the
    // spreadsheet becomes the real table.
    const fake = seeded(teams, [
      match({ id: 'm1', home: 'team_01', away: 'team_02', homeScore: 3, awayScore: 0, awarded: true }),
    ]);
    await recomputeSeasonStandings(fake.db as Firestore, SEASON);
    expect(fake.documents('standings').find((row) => row.teamId === 'team_01'))
      .toMatchObject({ played: 1, wins: 1, points: 3, pointsFor: 3 });
  });

  it('labels it, so a club can see which of its results were rulings', async () => {
    const fake = seeded(teams, [
      match({ id: 'm1', home: 'team_01', away: 'team_02', homeScore: 3, awayScore: 0, awarded: true }),
      match({ id: 'm2', home: 'team_02', away: 'team_01', homeScore: 1, awayScore: 1 }),
    ]);
    await recomputeSeasonStandings(fake.db as Firestore, SEASON);
    expect(fake.documents('standings').find((row) => row.teamId === 'team_01'))
      .toMatchObject({ played: 2, awarded: 1 });
  });
});

describe('points adjustments', () => {
  const teams = [team(1), team(2)];
  const drawn = [match({ id: 'm1', home: 'team_01', away: 'team_02', homeScore: 1, awayScore: 1 })];

  it('applies a deduction to the total and reports it separately', async () => {
    const fake = seeded(teams, drawn, {
      adjustments: [{
        id: 'adj_1', leagueId: LEAGUE, seasonId: SEASON, teamId: 'team_01',
        delta: -3, reason: 'Fielding a suspended player.',
        createdByUserId: 'league_admin_1', createdAt: '2026-06-01T00:00:00.000Z',
      }],
    });
    await recomputeSeasonStandings(fake.db as Firestore, SEASON);
    const row = fake.documents('standings').find((r) => r.teamId === 'team_01');
    // A table showing a deduction without saying so is a table the league will not trust.
    expect(row).toMatchObject({ points: -2, adjustment: -3 });
  });

  it('ignores a rescinded adjustment without deleting the record', async () => {
    const fake = seeded(teams, drawn, {
      adjustments: [{
        id: 'adj_1', leagueId: LEAGUE, seasonId: SEASON, teamId: 'team_01',
        delta: -3, reason: 'Overturned on appeal.',
        createdByUserId: 'league_admin_1', createdAt: '2026-06-01T00:00:00.000Z',
        rescindedAt: '2026-06-08T00:00:00.000Z', rescindedByUserId: 'league_admin_1',
      }],
    });
    await recomputeSeasonStandings(fake.db as Firestore, SEASON);
    expect(fake.documents('standings').find((r) => r.teamId === 'team_01'))
      .toMatchObject({ points: 1, adjustment: 0 });
    // The ruling and its reversal are both part of the season's record.
    expect(fake.documents('pointsAdjustments')).toHaveLength(1);
  });

  it('re-ranks the table when a deduction changes the order', async () => {
    const fake = seeded(teams, [
      match({ id: 'm1', home: 'team_01', away: 'team_02', homeScore: 2, awayScore: 0 }),
    ], {
      adjustments: [{
        id: 'adj_1', leagueId: LEAGUE, seasonId: SEASON, teamId: 'team_01',
        delta: -6, reason: 'Administrative penalty.',
        createdByUserId: 'league_admin_1', createdAt: '2026-06-01T00:00:00.000Z',
      }],
    });
    await recomputeSeasonStandings(fake.db as Firestore, SEASON);
    const byRank = fake.documents('standings').sort((a, b) => Number(a.rank) - Number(b.rank));
    // Winner on the field, last in the table. Applying the adjustment before ranking is the
    // point — a deduction that does not move the club is not a deduction.
    expect(byRank[0].teamId).toBe('team_02');
    expect(byRank[1]).toMatchObject({ teamId: 'team_01', points: -3 });
  });
});

describe('refusing rather than truncating', () => {
  it('throws instead of publishing a partial table for an implausibly large season', async () => {
    const teams = [team(1), team(2)];
    const matches = Array.from({ length: MAX_SEASON_MATCHES + 1 }, (_, index) => match({
      id: `match_${String(index).padStart(5, '0')}`,
      home: 'team_01', away: 'team_02', homeScore: 1, awayScore: 0,
    }));
    const fake = seeded(teams, matches);

    // Truncating is the exact defect this module removes. Reintroducing it at a higher limit
    // would be the same bug with a bigger number.
    await expect(recomputeSeasonStandings(fake.db as Firestore, SEASON))
      .rejects.toThrow(/Refusing to publish a partial table/);
    expect(fake.documents('standings')).toEqual([]);
  });
});

describe('recomputing after a finalization', () => {
  it('never throws, so a failed projection cannot fail a committed result', async () => {
    // The official result is already committed by the time this runs. A thrown error would
    // make a Cloud Function retry the finalization itself.
    const broken = { collection: () => { throw new Error('firestore is down'); } };
    await expect(recomputeStandingsAfterFinalization(broken as unknown as Firestore, {
      seasonId: SEASON, leagueId: LEAGUE, matchId: 'match_1',
    })).resolves.toBeUndefined();
  });

  it('skips quietly when the source carries no season', async () => {
    const fake = seeded([team(1)], []);
    await expect(recomputeStandingsAfterFinalization(fake.db as Firestore, {
      seasonId: undefined, leagueId: LEAGUE, matchId: 'match_1',
    })).resolves.toBeUndefined();
    expect(fake.documents('standings')).toEqual([]);
  });

  it('leaves a durable repair job when the rebuild fails', async () => {
    /*
     * Swallowing the error is right; swallowing it into a log is not. The result was official,
     * the table stayed stale, the log scrolled away, and nothing brought them back together
     * until a person noticed a league table disagreeing with its own results.
     */
    const written: Record<string, unknown>[] = [];
    const broken = {
      collection: (name: string) => {
        if (name === 'projectionRepairJobs') {
          return { doc: () => ({ set: async (data: Record<string, unknown>) => { written.push(data); } }) };
        }
        throw new Error('firestore is down');
      },
    };
    await recomputeStandingsAfterFinalization(broken as unknown as Firestore, {
      seasonId: SEASON, leagueId: LEAGUE, matchId: 'match_1',
    });
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      projectionType: 'standings',
      entityType: 'season',
      entityId: SEASON,
      status: 'pending',
    });
  });

  it('still never throws when even the repair queue is unwritable', async () => {
    // A thrown error here would make a Cloud Function retry the finalization itself.
    const broken = { collection: () => { throw new Error('firestore is down'); } };
    await expect(recomputeStandingsAfterFinalization(broken as unknown as Firestore, {
      seasonId: SEASON, leagueId: LEAGUE, matchId: 'match_1',
    })).resolves.toBeUndefined();
  });

  it('rebuilds the table for the season the result belongs to', async () => {
    const teams = [team(1), team(2)];
    const fake = seeded(teams, [
      match({ id: 'm1', home: 'team_01', away: 'team_02', homeScore: 2, awayScore: 1 }),
    ]);
    const result = await recomputeStandingsAfterFinalization(fake.db as Firestore, {
      seasonId: SEASON, leagueId: LEAGUE, matchId: 'm1',
    });
    expect(result).toMatchObject({ seasonId: SEASON, rowsWritten: 2, officialMatches: 1 });
    expect(fake.documents('standings').find((row) => row.rank === 1))
      .toMatchObject({ teamId: 'team_01', points: 3 });
  });
});

describe('a correction that supersedes a result', () => {
  it('moves the table when the stored score changes', async () => {
    const teams = [team(1), team(2)];
    const fake = seeded(teams, [
      match({ id: 'm1', home: 'team_01', away: 'team_02', homeScore: 3, awayScore: 0 }),
    ]);
    await recomputeSeasonStandings(fake.db as Firestore, SEASON);
    expect(fake.documents('standings').find((r) => r.teamId === 'team_01')?.points).toBe(3);

    // The correction path rewrites the match and re-finalizes; the projection follows it.
    fake.seed('matches', [{
      ...match({ id: 'm1', home: 'team_01', away: 'team_02', homeScore: 0, awayScore: 2 }),
    } as unknown as Record<string, unknown>]);
    await recomputeSeasonStandings(fake.db as Firestore, SEASON);

    expect(fake.documents('standings').find((r) => r.teamId === 'team_01'))
      .toMatchObject({ points: 0, losses: 1, wins: 0 });
    expect(fake.documents('standings').find((r) => r.teamId === 'team_02'))
      .toMatchObject({ points: 3, wins: 1, rank: 1 });
  });
});

describe('two results finalizing in the same season at once', () => {
  /**
   * The failure this closes, spelled out:
   *
   *   A finalizes.  A's recompute reads matches            -> sees A
   *   B finalizes.  B's recompute reads matches            -> sees A and B
   *                 B writes rows(A, B)
   *                 A writes rows(A)                       -> B is GONE from the table
   *
   * Last writer wins and the last writer had the stale read. It is the most dangerous failure
   * this projection can have, because nothing errors: the table is present, well-formed,
   * confidently wrong, and stays that way until something else recomputes.
   *
   * On a real matchday this is not exotic. Ten fixtures kicking off together finish together,
   * and every finalization triggers a recomputation of the same season.
   *
   * ## Why the interleaving is forced rather than hoped for
   *
   * Running two passes concurrently over UNCHANGING data proves nothing — both read the same
   * matches and compute the same table whether or not the guard exists. Reproducing the defect
   * needs a write to land between one pass's input read and its commit, which is what
   * `beforeTransaction` is for. An earlier version of this test used `Promise.all` over static
   * data and passed with the compare-and-swap deleted.
   */
  const teams = [team(1), team(2), team(3), team(4)];

  const matchA = match({ id: 'm_a', home: 'team_01', away: 'team_02', homeScore: 3, awayScore: 0 });
  const matchB = match({ id: 'm_b', home: 'team_03', away: 'team_04', homeScore: 2, awayScore: 1 });

  /**
   * Seeds a season holding only match A, then arranges for match B to be finalized AND
   * projected while the first pass is between its input read and its commit.
   */
  function racedFixture() {
    const fake = fakeFirestore({
      beforeTransaction: async () => {
        // The competing finalization: B's result lands, and B's own recomputation publishes a
        // table containing both. The first pass is now holding inputs that predate all of it.
        fake.seed('matches', [matchB as unknown as Record<string, unknown>]);
        await recomputeSeasonStandings(fake.db as Firestore, SEASON);
      },
    });
    fake.seed('seasons', [{
      id: SEASON, leagueId: LEAGUE, sport: 'football', name: '2026 Season', status: 'active',
    }]);
    fake.seed('teams', teams as unknown as Record<string, unknown>[]);
    fake.seed('matches', [matchA as unknown as Record<string, unknown>]);
    return fake;
  }

  it('does not let a stale pass drop a result the fresher pass counted', async () => {
    const fake = racedFixture();

    await recomputeSeasonStandings(fake.db as Firestore, SEASON);

    // Four clubs, two results, every club played exactly once. The defect shows as team_03 and
    // team_04 on played 0 — match B erased by a pass that never saw it.
    const rows = fake.documents('standings');
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.played === 1)).toBe(true);
    expect(rows.reduce((total, row) => total + Number(row.points), 0)).toBe(6);
  });

  it('keeps the result the stale pass could not have known about', async () => {
    const fake = racedFixture();
    await recomputeSeasonStandings(fake.db as Firestore, SEASON);

    // Named explicitly, because "every row played 1" would also hold if the table were
    // rebuilt from B alone.
    const winnerOfB = fake.documents('standings').find((row) => row.teamId === 'team_03');
    expect(winnerOfB).toMatchObject({ played: 1, wins: 1, points: 3 });
  });

  it('records a revision that advances with each committed rebuild', async () => {
    const fake = seeded(teams, [matchA, matchB]);

    await recomputeSeasonStandings(fake.db as Firestore, SEASON);
    const first = fake.documents('standingsProjections')[0];
    await recomputeSeasonStandings(fake.db as Firestore, SEASON);
    const second = fake.documents('standingsProjections')[0];

    // The counter is the whole mechanism: a pass that reads revision N and finds N+1 at commit
    // knows its inputs were overtaken.
    expect(Number(second.revision)).toBe(Number(first.revision) + 1);
  });

  it('publishes the projection state so a stale table is diagnosable', async () => {
    const fake = seeded(teams, [matchA, matchB]);
    await recomputeSeasonStandings(fake.db as Firestore, SEASON);

    expect(fake.documents('standingsProjections')[0]).toMatchObject({
      seasonId: SEASON,
      leagueId: LEAGUE,
      rows: 4,
      officialMatches: 2,
    });
  });
});


describe('proving a repaired table actually converged', () => {
  it('is not converged when the season has no table at all', async () => {
    const fake = seeded([team(1), team(2)], []);
    expect(await standingsAreConverged(fake.db as Firestore, SEASON)).toBe(false);
  });

  it('is converged once every row carries a recomputation stamp', async () => {
    const fake = seeded([team(1), team(2)], [
      match({ id: 'm1', home: 'team_01', away: 'team_02', homeScore: 2, awayScore: 1 }),
    ]);
    await recomputeSeasonStandings(fake.db as Firestore, SEASON, { leagueId: LEAGUE });
    expect(await standingsAreConverged(fake.db as Firestore, SEASON)).toBe(true);
  });

  it('is not converged while a seeded row has never been rebuilt', async () => {
    // "The repairer did not throw" is not the property anyone wanted. A table of rows that no
    // projection has ever written is exactly the state being repaired.
    const fake = seeded([team(1), team(2)], []);
    fake.db.collection('standings').doc('seeded_row').set({
      seasonId: SEASON, teamId: 'team_01', points: 99,
    });
    expect(await standingsAreConverged(fake.db as Firestore, SEASON)).toBe(false);
  });
});
