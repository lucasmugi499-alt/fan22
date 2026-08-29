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
  computedAt: string;
};

/**
 * A ceiling on one pass, so a runaway catalogue cannot turn the hourly job into an unbounded
 * scan. Well above any plausible league count for this stage; if it is ever reached the job
 * says so rather than silently doing half the work.
 */
export const MAX_LEAGUES_PER_PASS = 500;

export async function recomputeLeagueIndexes(
  db: Firestore,
  options: { now?: Date } = {},
): Promise<LeagueIndexProjectionResult> {
  const now = options.now ?? new Date();
  const computedAt = now.toISOString();

  const leaguesSnapshot = await db.collection('leagues').limit(MAX_LEAGUES_PER_PASS).get();
  let leaguesUpdated = 0;
  let leaguesUnrated = 0;

  for (const leagueDoc of leaguesSnapshot.docs) {
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
    if (published === null) leaguesUnrated += 1;

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

    leaguesUpdated += 1;
  }

  return {
    leaguesScanned: leaguesSnapshot.size,
    leaguesUpdated,
    leaguesUnrated,
    computedAt,
  };
}
