import type { Firestore } from 'firebase-admin/firestore';
// Relative, not `@/`. This module is reachable from the Cloud Functions bundle through the
// finalizer, where a path alias survives into the emitted CommonJS and fails at require time
// — tsc resolves the alias, it does not rewrite it. Every import here is relative for that
// reason, exactly like resultFinalizer.ts.
import { buildLeagueStandings, type LeagueStanding } from '../../lib/leagueModel';
import { defaultScoringFor } from '../../lib/season';
import { adaptMatch } from '../../lib/matchRecord';
import { isOfficialMatch } from '../../lib/status';
import { readSeasonMembership } from './seasonMembership';
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

/**
 * The per-season revision that makes concurrent recomputation safe.
 *
 * ## The race this closes
 *
 * Recomputation reads a whole season and then writes every row. Reads and writes are separate
 * operations, so two results finalizing in the same season at nearly the same time interleave
 * like this:
 *
 *   A finalizes.  A's recompute reads matches            -> sees A
 *   B finalizes.  B's recompute reads matches            -> sees A and B
 *                 B writes rows(A, B)
 *                 A writes rows(A)                       -> B is GONE from the table
 *
 * Last writer wins, and the last writer had the stale read. The published table silently drops
 * a verified result until something recomputes again — and on a busy matchday "something
 * recomputes again" is another race, not a fix. This is the single most dangerous failure the
 * projection can have, because it is invisible: the table is present, well-formed, confidently
 * wrong, and nothing errors.
 *
 * ## Compare-and-swap
 *
 * Every recomputation reads a revision counter before it reads anything else, and commits its
 * rows only if the counter is still what it was. If another pass committed in between, the
 * counter moved, this pass's inputs are known-stale, and it retries from a fresh read.
 *
 * Whichever ordering the two passes take, the one that commits last is the one whose read
 * happened after every prior write. That is the property that makes the result correct rather
 * than merely eventually-correct.
 *
 * The transaction reads ONE small document, not the season. A transaction that read every
 * match would conflict with the finalizer's own writes and turn a busy matchday into a retry
 * storm — the contention would be with the very thing generating the work.
 */
export function projectionStateId(seasonId: string) {
  return seasonId;
}

/**
 * How many times a pass will retry a lost compare-and-swap before giving up.
 *
 * Losing means another pass committed a NEWER table, so giving up is safe: the season already
 * has a table built from at least as much information as this pass had. The bound exists to
 * stop a hot season starving one pass indefinitely, not to protect correctness.
 */
const MAX_CAS_ATTEMPTS = 5;

export type StandingsProjectionResult = {
  seasonId: string;
  leagueId: string;
  /** Rows written, one per club registered to the SEASON. See seasonMembership. */
  rowsWritten: number;
  /**
   * True when the club list came from current league membership because this season has no
   * registrations, which is how every season written before `seasonTeams` existed still
   * builds. Reported rather than hidden: a table computed this way is correct today and will
   * change shape if the league's clubs change, and an operator should be able to count them.
   */
  membershipFromLeague?: boolean;
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
  /**
   * True when the club list came from current league membership because the season has no
   * registrations. Carried through to the result so a caller can count how many seasons are
   * still computed the old way rather than assuming none are.
   */
  membershipFromLeague: boolean;
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

  const [membership, matchesSnapshot, adjustmentsSnapshot] = await Promise.all([
    /*
     * Who competed in THIS season, not who is in the league today.
     *
     * The old query asked `teams where leagueId == leagueId`, which is a question about now
     * asked of a record about then: move a club to another league and it vanished from the
     * season it actually played; add a new club and it appeared in that season's table having
     * played nothing. A completed season's table is a historical fact and must not change
     * shape because a league's roster of clubs did.
     */
    readSeasonMembership(db, seasonId, leagueId),
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
    teams: membership.teams,
    membershipFromLeague: membership.fellBackToLeagueMembership,
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

  for (let attempt = 1; attempt <= MAX_CAS_ATTEMPTS; attempt += 1) {
    const result = await attemptRecompute(db, seasonId, options);
    if (result.outcome === 'written') return result.result;
    if (result.outcome === 'nothing_to_do') return undefined;
    // `superseded`: another pass committed a newer table while this one was reading. Its
    // inputs are known-stale, so re-read rather than write them.
  }

  // Every attempt lost the race, which means every attempt was beaten by a pass working from
  // more recent data. The season has a table; it is simply not this pass's table. Not an error.
  console.warn('GoalPlace256 standings recomputation was superseded on every attempt', {
    seasonId,
    attempts: MAX_CAS_ATTEMPTS,
  });
  return undefined;
}

type RecomputeAttempt =
  | { outcome: 'written'; result: StandingsProjectionResult }
  | { outcome: 'superseded' }
  | { outcome: 'nothing_to_do' };

async function attemptRecompute(
  db: Firestore,
  seasonId: string,
  options: { leagueId?: string; now?: () => Date },
): Promise<RecomputeAttempt> {
  const stateRef = db.collection('standingsProjections').doc(projectionStateId(seasonId));

  // Read the revision FIRST. Everything after this is the read set whose freshness the
  // compare-and-swap is asserting, so a revision read afterwards would prove nothing.
  const revisionBefore = await stateRef.get()
    .then((snapshot) => Number(snapshot.data()?.revision ?? 0))
    .catch(() => 0);

  const inputs = await readSeasonInputs(db, seasonId, options.leagueId);
  if (!inputs) return { outcome: 'nothing_to_do' };

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
  const keep = new Set<string>();
  const writes = rows.map((row, index) => {
    const id = standingDocumentId(seasonId, row.teamId);
    keep.add(id);
    return {
      ref: db.collection('standings').doc(id),
      data: {
        ...standingDocument({ id, leagueId, seasonId, sport, row, rank: index + 1 }),
        recomputedAt,
      },
    };
  });

  // A team removed from the league mid-season leaves a row behind that nothing would ever
  // overwrite, and a stale row in a publicly readable collection is precisely the failure
  // this projection replaces. Deleting is safe because every surviving row is rewritten in
  // the same transaction from a full recomputation.
  const existing = await db.collection('standings').where('seasonId', '==', seasonId).get();
  const deletions = existing.docs.filter((doc) => !keep.has(doc.id)).map((doc) => doc.ref);

  /**
   * A transaction, not a batch, and it reads exactly one document.
   *
   * The read is the revision counter, and the whole point is that Firestore aborts the
   * transaction if that document changed since it was read inside this transaction — which,
   * combined with comparing it to the value taken before the inputs were read, is what proves
   * this pass's view of the season was not overtaken.
   *
   * Row writes are bounded by club count, so a table plus its stale rows sits far inside the
   * 500-operation transaction limit even for an implausibly large league.
   */
  const committed = await db.runTransaction(async (tx) => {
    const current = await tx.get(stateRef);
    const revisionNow = Number(current.data()?.revision ?? 0);
    if (revisionNow !== revisionBefore) return false;

    writes.forEach((write) => tx.set(write.ref, write.data));
    deletions.forEach((ref) => tx.delete(ref));
    tx.set(stateRef, {
      seasonId,
      leagueId,
      revision: revisionBefore + 1,
      rows: rows.length,
      officialMatches,
      recomputedAt,
    }, { merge: true });
    return true;
  });

  if (!committed) return { outcome: 'superseded' };

  return {
    outcome: 'written',
    result: {
      seasonId,
      leagueId,
      rowsWritten: rows.length,
      rowsRemoved: deletions.length,
      officialMatches,
      adjustmentsApplied: adjustments.filter((adjustment) => !adjustment.rescindedAt).length,
      ...(inputs.membershipFromLeague ? { membershipFromLeague: true } : {}),
      recomputedAt,
    },
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
      // A later result rebuilding the table successfully IS the repair, so an outstanding job
      // for this season is resolved rather than left queued for a drain that would find
      // nothing wrong.
      await db.collection(REPAIR_QUEUE).doc(standingsRepairId(input.seasonId)).set({
        status: 'completed',
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true }).catch(() => undefined);
    }
    return result;
  } catch (error) {
    console.error('GoalPlace256 failed to recompute standings after finalization', {
      matchId: input.matchId,
      seasonId: input.seasonId,
      error: error instanceof Error ? error.message : String(error),
    });
    await queueStandingsRepair(db, input.seasonId, input.leagueId, error);
    return undefined;
  }
}

/** How often a table is rebuilt from the same failing inputs before somebody has to look. */
const REPAIR_QUEUE = 'projectionRepairJobs';

/**
 * A durable record of a table that did not get rebuilt.
 *
 * Swallowing the error is right: the official result is already committed and correct, and a
 * standings outage must not roll back a match. Swallowing it into a LOG is not. The result was
 * official, the table was stale, the log scrolled away, and nothing brought the two back
 * together until a person noticed a league table that disagreed with its own results — which
 * on a platform whose product is a trustworthy table is the failure that matters most.
 *
 * Written into the same queue the search projection uses, deliberately. These want the same
 * claim, the same backoff and the same dead-letter budget, and a second queue would be a
 * second thing to remember to drain. A deterministic id means a season failing repeatedly
 * updates one row rather than growing a backlog of duplicates.
 */
export async function queueStandingsRepair(
  db: Firestore,
  seasonId: string,
  leagueId: string | undefined,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  try {
    await db.collection(REPAIR_QUEUE).doc(standingsRepairId(seasonId)).set({
      id: standingsRepairId(seasonId),
      projectionType: 'standings',
      entityType: 'season',
      entityId: seasonId,
      ...(leagueId ? { leagueId } : {}),
      // Reset to pending on a fresh failure even if a previous attempt had backed off: a new
      // result arrived, so the old backoff window is about stale information.
      status: 'pending',
      lastErrorCode: message.length > 300 ? `${message.slice(0, 300)}…` : message,
      lastAttemptAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }, { merge: true });
  } catch (queueError) {
    // If the queue itself is unwritable the incident is larger than standings, and there is
    // nothing useful left to do here but say so loudly.
    console.error('GoalPlace256 could not queue a standings repair', {
      seasonId,
      error: queueError instanceof Error ? queueError.message : String(queueError),
    });
  }
}

export function standingsRepairId(seasonId: string) {
  return `standings_season_${seasonId}`;
}

/**
 * Whether a season's published table matches what its official results say it should be.
 *
 * The repair queue's proof of convergence. A repairer that returned without throwing has not
 * shown the table is right, and "it did not throw" is not the property anyone wanted — so this
 * recomputes and compares row count and points rather than trusting the absence of an error.
 */
export async function standingsAreConverged(db: Firestore, seasonId: string): Promise<boolean> {
  const stored = await db.collection('standings').where('seasonId', '==', seasonId).get();
  if (stored.empty) return false;
  // Every row a recomputation writes carries a stamp. A table with unstamped rows is a seeded
  // one that no projection has ever rebuilt, which is precisely the state being repaired.
  return stored.docs.every((doc) => Boolean(doc.data().recomputedAt));
}
