import type { Firestore } from 'firebase-admin/firestore';
// Relative, not `@/`: this module is compiled into the Cloud Functions bundle by the hourly
// lifecycle pass, where a path alias survives into the emitted CommonJS and fails at require
// time. verify-bundle fails the build if one reappears.
import { computeLeagueIndex, publishedIndexScore } from '../../lib/leagueIndex';
import { adaptMatch } from '../../lib/matchRecord';
import type { Athlete, League, Match, Roster, Team } from '../../types';

/**
 * Recompute the GoalPlace Index for every league, from each league's own records.
 *
 * Runs in the hourly `convergeLifecycle` pass. The index is a slow-moving operational measure
 * — it describes how a league is being run over a season, not what happened in the last
 * minute — so hourly is the right cadence and anything faster is cost without meaning.
 *
 * Written back onto the league document rather than into a separate collection, because
 * `goalPlaceIndex` is already a field on `League` that discovery sorts by and every league
 * card reads. The signals go alongside it so the league page can show the breakdown that
 * produced the number, which is the difference between a metric and a claim.
 */

export type LeagueIndexProjectionResult = {
  leaguesScanned: number;
  leaguesUpdated: number;
  leaguesUnrated: number;
  /** The whole catalogue, not just this pass. */
  totalLeagues: number;
  /** How many hourly passes the rotation needs to reach every league. */
  passesToCoverAll: number;
  computedAt: string;
};

/**
 * How many leagues one pass rebuilds, and why it is a rotating window rather than a cap.
 *
 * This was `.limit(500)` with no ordering and no cursor, which is a bug that hides until the
 * catalogue outgrows it: Firestore returns documents in key order, so past 500 leagues the
 * hourly job would rebuild the SAME 500 every hour and the rest would never be rated at all.
 * Not slowly — never. And nothing would report it, because the job would finish cleanly having
 * done exactly what it was asked.
 *
 * It is now a rotating scan with a persisted cursor over document id, so every league is
 * reached in ceil(total / window) hours regardless of how many there are.
 *
 * The obvious alternative — `orderBy('indexComputedAt', 'asc')` to take the least recently
 * computed first — is wrong in a way that is easy to miss: **a Firestore `orderBy` excludes
 * documents that do not have the field.** Every league that had never been rated would be
 * filtered out of the query that exists to rate it, and would stay unrated forever. That is
 * strictly worse than the bug it would be replacing. Document id is on every document by
 * definition, which is why the cursor rides on that instead.
 *
 * The window exists because the pass shares a 300s function timeout with the access expiry and
 * projection repairs that run after it, and each league costs four queries.
 *
 * 1,000, not 200, because the leagues are now processed with bounded concurrency rather than
 * one at a time. Sequentially, four round trips per league put 1,000 leagues well past the
 * timeout; at ten in flight the same work is a fraction of it. At 10,000 leagues the rotation
 * comes round in ten hours rather than fifty.
 */
export const MAX_LEAGUES_PER_PASS = 1000;

/**
 * How many leagues are computed at once.
 *
 * Bounded rather than unbounded: `Promise.all` over a thousand leagues would open four
 * thousand concurrent Firestore queries, which is a self-inflicted load spike on the database
 * the rest of the product is trying to serve. Ten keeps the pass fast without the hourly job
 * becoming the reason a matchday feels slow.
 */
const LEAGUE_CONCURRENCY = 10;

/**
 * Map with a fixed number of workers.
 *
 * Deliberately not `Promise.all` over chunks: a chunked version runs at the speed of the
 * slowest league in each chunk, and league cost varies by an order of magnitude between a
 * two-fixture league and a full season. Workers pulling from a shared queue keep every slot
 * busy until the work runs out.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

/** Where the rotation's position is kept between hourly passes. Server-owned. */
const CURSOR_ID = 'leagueIndex';

export async function recomputeLeagueIndexes(
  db: Firestore,
  options: { now?: Date } = {},
): Promise<LeagueIndexProjectionResult> {
  const now = options.now ?? new Date();
  const computedAt = now.toISOString();

  const cursorRef = db.collection('projectionCursors').doc(CURSOR_ID);
  const cursor = await cursorRef.get()
    .then((snapshot) => snapshot.data()?.lastLeagueId as string | undefined)
    .catch(() => undefined);

  // Ordered by document id, which every document has. See the note on MAX_LEAGUES_PER_PASS
  // for why this cannot order on `indexComputedAt`.
  const page = db.collection('leagues').orderBy('__name__').limit(MAX_LEAGUES_PER_PASS);
  let leaguesSnapshot = await (cursor ? page.startAfter(cursor) : page).get();

  // The cursor ran off the end of the catalogue, so wrap. Without this the rotation would
  // stall permanently at the last page once it got there.
  if (leaguesSnapshot.empty && cursor) {
    leaguesSnapshot = await page.get();
  }

  // A league catalogue larger than one window is normal, not an error — it just means the
  // rotation takes more than one hour to come round. Reported so the cadence is observable
  // rather than assumed.
  const totalLeagues = await db.collection('leagues').count().get()
    .then((snapshot) => snapshot.data().count)
    .catch(() => leaguesSnapshot.size);

  const outcomes = await mapWithConcurrency(
    leaguesSnapshot.docs,
    LEAGUE_CONCURRENCY,
    (leagueDoc) => rebuildOneLeague(db, leagueDoc, now, computedAt),
  );

  const leaguesUpdated = outcomes.length;
  const leaguesUnrated = outcomes.filter((outcome) => !outcome.rated).length;

  // Advanced only after the work, so a pass that dies partway retries the same page rather
  // than skipping it. Recomputation is deterministic, so repeating a page costs reads and
  // changes nothing.
  const lastId = leaguesSnapshot.docs.at(-1)?.id;
  if (lastId) {
    await cursorRef.set({ lastLeagueId: lastId, updatedAt: computedAt }, { merge: true })
      .catch((error) => {
        // A lost cursor restarts the rotation from the beginning, which is slow rather than
        // wrong. Not worth failing a completed pass over.
        console.warn('GoalPlace256 could not persist the league index cursor', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  return {
    leaguesScanned: leaguesSnapshot.size,
    leaguesUpdated,
    leaguesUnrated,
    totalLeagues,
    /** Hours for the rotation to reach every league at the current catalogue size. */
    passesToCoverAll: Math.max(1, Math.ceil(totalLeagues / MAX_LEAGUES_PER_PASS)),
    computedAt,
  };
}

/**
 * One league's index, from that league's own records.
 *
 * Extracted from the pass so the concurrency wrapper reads as what it is — a scheduler — and
 * the per-league work reads as the computation. It also means a single league can be rebuilt
 * on its own without going through the rotation.
 */
async function rebuildOneLeague(
  db: Firestore,
  leagueDoc: FirebaseFirestore.QueryDocumentSnapshot,
  now: Date,
  computedAt: string,
): Promise<{ rated: boolean }> {
  const league = { id: leagueDoc.id, ...leagueDoc.data() } as League;

  // Per league rather than one global read, so each league's score depends only on its own
  // records. A shared slice across leagues is exactly what made the old discovery tables
  // depend on how many of a league's matches happened to fall inside someone else's limit.
  const [matchesSnapshot, teamsSnapshot, athletesSnapshot, rostersSnapshot] = await Promise.all([
    db.collection('matches').where('leagueId', '==', league.id).limit(2000).get(),
    db.collection('teams').where('leagueId', '==', league.id).limit(200).get(),
    db.collection('athletes').where('leagueId', '==', league.id).limit(3000).get(),
    db.collection('rosters').where('leagueId', '==', league.id).limit(400).get(),
  ]);

  const result = computeLeagueIndex({
    league,
    seasonId: league.currentSeasonId,
    // Adapted like every other match read, or legacy-shaped documents fail `isOfficialMatch`
    // and the verification signal reads low for records that are perfectly fine.
    matches: matchesSnapshot.docs.map((doc) => adaptMatch({ id: doc.id, ...doc.data() } as Match)),
    teams: teamsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Team)),
    athletes: athletesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Athlete)),
    rosters: rostersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Roster)),
    now,
  });

  const published = publishedIndexScore(result);

  await leagueDoc.ref.set({
    // `null` for a league with too little history. Not 0, which would rank it below a
    // badly-run league, and emphatically not the 45 this replaced.
    goalPlaceIndex: published,
    indexSignals: Object.fromEntries(result.signals.map((signal) => [signal.key, signal.value])),
    /**
     * The counts behind each signal, so the league page can show "38 of 40 verified" rather
     * than only "95". A breakdown that shows percentages alone is only marginally more
     * defensible than the constant was.
     */
    indexEvidence: Object.fromEntries(result.signals.map((signal) => [
      signal.key,
      { numerator: signal.numerator, denominator: signal.denominator },
    ])),
    indexEstablished: result.established,
    indexComputedAt: computedAt,
  }, { merge: true });

  return { rated: published !== null };
}
