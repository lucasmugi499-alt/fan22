import type { Firestore } from 'firebase-admin/firestore';
// Relative, not `@/`. This module is reachable from the Cloud Functions bundle through the
// finalizer, where a path alias survives into the emitted CommonJS and fails at require time
// — tsc resolves the alias, it does not rewrite it. Every import here is relative for that
// reason, exactly like resultFinalizer.ts.
import { buildLeagueStandings, type LeagueStanding } from '../../lib/leagueModel';
import { defaultScoringFor } from '../../lib/season';
import { adaptMatch } from '../../lib/matchRecord';
import { isOfficialMatch } from '../../lib/status';
import type {
  Match,
  PointsAdjustment,
  Season,
  SportSlug,
  StoredStanding,
  Team,
} from '../../types';

/**
 * The league table, as a server-owned projection.
 *
 * ## What was wrong
 *
 * Standings were never persisted or server-computed. `buildLeagueStandings` ran in the
 * BROWSER, over whatever matches the page happened to have loaded. The server handed the
 * public league page 240 matches for the whole league with no `orderBy` — so Firestore key
 * order, an arbitrary subset — and the client then fetched 120 of its own and REPLACED the
 * server's set with the smaller one.
 *
 * Past roughly 120 fixtures in a league, the published table was therefore computed from an
 * arbitrary slice of the season. It did not render empty or warn; it rendered a confident,
 * wrong table. Worse, anonymous visitors (server data only) and signed-in visitors (client
 * data) were reading different subsets, so the same league had two different published
 * tables depending on who was looking.
 *
 * A 20-team double round robin is 380 fixtures. A real league reaches that in its first
 * season. For a product whose entire proposition is verified truth, publishing a confidently
 * wrong table is the most damaging failure available to it.
 *
 * ## The shape of the fix
 *
 * One `standings/{seasonId}_{teamId}` document per team per season, written only by the
 * server, read by everything. The table becomes a single bounded query instead of a match
 * scan, and every reader — anonymous, signed-in, discovery, the operator console — sees the
 * same rows because there is only one set of rows.
 *
 * The `standings` collection already existed. It was seeded, publicly readable, and read by
 * nothing; the App Hosting build of 2026-08-27 deliberately removed the last dead read of it
 * because an unmaintained projection is worse than none. This makes it the real projection
 * rather than deleting it.
 *
 * ## Recomputed, never incremented
 *
 * Every recomputation reads all of the season's official matches and rebuilds every row from
 * scratch. It never adds to a stored total.
 *
 * That is the single most important property here. An incremented counter cannot be repaired:
 * a double-delivered trigger, a correction that supersedes an earlier result, a partial
 * failure — each leaves a total that is wrong with no way to detect it short of recomputing,
 * at which point you may as well have recomputed. Deterministic recomputation means running
 * this twice produces byte-identical documents, and means a corrupted table is fixed by
 * running it again rather than by an archaeology exercise.
 *
 * It is also why this runs AFTER the finalization transaction rather than inside it. The
 * finalizer's transaction is budgeted (`MAX_FINALIZATION_WRITES`) and already refuses to
 * expand an oversized submission; adding a whole-season read plus a row-per-team write to it
 * would push ordinary matchdays into that refusal. Standings are derived data — they can be
 * rebuilt from the official results at any time — so they do not need the same transaction as
 * the truth they are derived from. A failure here leaves a stale table and a logged error,
 * never a wrong official result.
 */

/** Deterministic, so a rerun overwrites rather than duplicates. */
export function standingDocumentId(seasonId: string, teamId: string) {
  return `${seasonId}_${teamId}`;
}

export type StandingsProjectionResult = {
  seasonId: string;
  leagueId: string;
  /** Rows written, one per team registered to the league. */
  rowsWritten: number;
  /** Stale rows removed — a team withdrawn from the league mid-season. */
  rowsRemoved: number;
  /** Official matches the table was computed from. */
  officialMatches: number;
  /** Adjustments applied, so a surprising total can be explained from the log line alone. */
  adjustmentsApplied: number;
  recomputedAt: string;
};

/**
 * How many matches one season may hold before this refuses to publish a table.
 *
 * Not a page size — this reads the whole season and would rather fail loudly than truncate.
 * A truncated projection is the exact defect this module exists to remove, and it would be
 * perverse to reintroduce it here at a higher limit. 2,000 comfortably covers a 40-team
 * double round robin (1,560); a season past it is a data problem, not a table to publish.
 */
export const MAX_SEASON_MATCHES = 2000;

export class SeasonTooLargeError extends Error {
  constructor(readonly seasonId: string, readonly count: number) {
    super(
      `Season ${seasonId} has at least ${count} matches, above the ${MAX_SEASON_MATCHES} this `
      + 'projection will compute in one pass. Refusing to publish a partial table.',
    );
    this.name = 'SeasonTooLargeError';
  }
}

type SeasonInputs = {
  season: Season | undefined;
  leagueId: string;
  sport: SportSlug;
  teams: Team[];
  matches: Match[];
  adjustments: PointsAdjustment[];
};

async function readSeasonInputs(
  db: Firestore,
  seasonId: string,
  leagueIdHint?: string,
): Promise<SeasonInputs | undefined> {
  const seasonSnapshot = await db.collection('seasons').doc(seasonId).get();
  const season = seasonSnapshot.exists
    ? ({ id: seasonSnapshot.id, ...seasonSnapshot.data() } as Season)
    : undefined;

  const leagueId = season?.leagueId ?? leagueIdHint;
  if (!leagueId) return undefined;

  const [teamsSnapshot, matchesSnapshot, adjustmentsSnapshot] = await Promise.all([
    db.collection('teams').where('leagueId', '==', leagueId).get(),
    // By season, not by league. A league's matches span seasons and a table is meaningless
    // across them; scoping the query is also what keeps this bounded as a league ages.
    db.collection('matches')
      .where('seasonId', '==', seasonId)
      .limit(MAX_SEASON_MATCHES + 1)
      .get(),
    db.collection('pointsAdjustments').where('seasonId', '==', seasonId).get(),
  ]);

  if (matchesSnapshot.size > MAX_SEASON_MATCHES) {
    throw new SeasonTooLargeError(seasonId, matchesSnapshot.size);
  }

  return {
    season,
    leagueId,
    sport: (season?.sport ?? 'football') as SportSlug,
    teams: teamsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Team)),
    // Adapted exactly as the client and the public catalogue adapt them. Legacy-shaped
    // matches (`status: 'verified'`, no `teamAScore`) fail both `isOfficialMatch` and the
    // score check when read raw, which is what once left ten leagues with an empty table.
    matches: matchesSnapshot.docs.map((doc) => adaptMatch({ id: doc.id, ...doc.data() } as Match)),
    adjustments: adjustmentsSnapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as PointsAdjustment),
    ),
  };
}

/**
 * Rebuild one season's table from its official results and write it.
 *
 * Idempotent by construction: same inputs, same documents, every time. Safe to call from a
 * retried Cloud Function, a backfill script, and an operator command without coordination
 * between them.
 */
export async function recomputeSeasonStandings(
  db: Firestore,
  seasonId: string,
  options: { leagueId?: string; now?: () => Date } = {},
): Promise<StandingsProjectionResult | undefined> {
  if (!seasonId) return undefined;

  const inputs = await readSeasonInputs(db, seasonId, options.leagueId);
  if (!inputs) return undefined;

  const { season, leagueId, sport, teams, matches, adjustments } = inputs;
  const scoring = season?.scoring ?? defaultScoringFor(sport);

  const rows = buildLeagueStandings(teams, matches, { seasonId, scoring, adjustments });
  const officialMatches = matches.filter((match) => (
    match.seasonId === seasonId
    && isOfficialMatch(match)
    && typeof (match.teamAScore ?? match.score?.home) === 'number'
    && typeof (match.teamBScore ?? match.score?.away) === 'number'
  )).length;

  const recomputedAt = (options.now?.() ?? new Date()).toISOString();
  const batch = db.batch();
  const keep = new Set<string>();

  rows.forEach((row, index) => {
    const id = standingDocumentId(seasonId, row.teamId);
    keep.add(id);
    batch.set(db.collection('standings').doc(id), {
      ...standingDocument({ id, leagueId, seasonId, sport, row, rank: index + 1 }),
      recomputedAt,
    });
  });

  // A team removed from the league mid-season leaves a row behind that nothing would ever
  // overwrite, and a stale row in a publicly readable collection is precisely the failure
  // this projection replaces. Deleting is safe because every surviving row is rewritten in
  // the same batch from a full recomputation.
  const existing = await db.collection('standings').where('seasonId', '==', seasonId).get();
  let rowsRemoved = 0;
  existing.docs.forEach((doc) => {
    if (keep.has(doc.id)) return;
    batch.delete(doc.ref);
    rowsRemoved += 1;
  });

  await batch.commit();

  return {
    seasonId,
    leagueId,
    rowsWritten: rows.length,
    rowsRemoved,
    officialMatches,
    adjustmentsApplied: adjustments.filter((adjustment) => !adjustment.rescindedAt).length,
    recomputedAt,
  };
}

/**
 * One stored row.
 *
 * Field-for-field the shape already seeded into this collection, so the 60 existing documents
 * and everything this writes are the same kind of thing and no reader needs to branch.
 */
function standingDocument(input: {
  id: string;
  leagueId: string;
  seasonId: string;
  sport: SportSlug;
  row: LeagueStanding;
  rank: number;
}): StoredStanding {
  const { id, leagueId, seasonId, sport, row, rank } = input;
  return {
    id,
    leagueId,
    seasonId,
    sport,
    teamId: row.teamId,
    teamName: row.teamName,
    played: row.played,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    pointsFor: row.pointsFor,
    pointsAgainst: row.pointsAgainst,
    difference: row.difference,
    points: row.points,
    rank,
    adjustment: row.adjustment,
    awarded: row.awarded,
  };
}

/**
 * Recompute after a result becomes official, without ever failing the finalization.
 *
 * The official result is the truth and it is already committed by the time this runs.
 * Standings are derived from it and can be rebuilt at any moment, so a failure here must
 * degrade to a stale table plus a log line — never to a rolled-back result, and never to a
 * thrown error that a Cloud Function would retry into a redelivery of the finalization
 * itself.
 */
export async function recomputeStandingsAfterFinalization(
  db: Firestore,
  input: { seasonId?: string; leagueId?: string; matchId: string },
): Promise<StandingsProjectionResult | undefined> {
  if (!input.seasonId) {
    // A field report may carry no season. Nothing to project onto, and inventing one would
    // write a table under an id no reader looks up.
    console.warn('GoalPlace256 skipped a standings recomputation: no season on the result', {
      matchId: input.matchId,
    });
    return undefined;
  }
  try {
    const result = await recomputeSeasonStandings(db, input.seasonId, {
      leagueId: input.leagueId,
    });
    if (result) {
      console.log('GoalPlace256 recomputed standings', { matchId: input.matchId, ...result });
    }
    return result;
  } catch (error) {
    console.error('GoalPlace256 failed to recompute standings after finalization', {
      matchId: input.matchId,
      seasonId: input.seasonId,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}
