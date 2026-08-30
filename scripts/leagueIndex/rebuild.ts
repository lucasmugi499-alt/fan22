import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeMigrationFirestore } from '../lib/firestoreTarget';
import { recomputeLeagueIndexes } from '../../src/server/leagueIndex/projection';

/**
 * Recompute the GoalPlace Index for every league, now rather than on the hourly pass.
 *
 * `convergeLifecycle` does this every 60 minutes, which is the right cadence for a measure of
 * how a league is being run over a season. It is the wrong cadence immediately after a deploy:
 * until the first pass runs, every league document still carries whatever the seed put there —
 * on demo that was a literal 797 against a 0-100 scale — and the league page reads the old
 * seven-key `indexSignals` shape, so most of the breakdown has nothing to show.
 *
 * The read path tolerates that window (`getGoalPlaceIndexSignals` returns nothing unless every
 * signal was measured), but tolerating it is not the same as closing it. This closes it.
 *
 *   tsx --env-file=.env.local scripts/leagueIndex/rebuild.ts --project=... --database=fg256
 *
 * Safe to run repeatedly: the computation is deterministic from each league's own records, so
 * a second run over unchanged data writes identical documents.
 */
export async function main() {
  const target = initializeMigrationFirestore();
  console.log(`League index rebuild — target ${target.label}`);

  const result = await recomputeLeagueIndexes(target.db);

  console.log('');
  console.log(`Target        : ${target.label}`);
  console.log(`Leagues       : ${result.leaguesScanned}`);
  console.log(`Updated       : ${result.leaguesUpdated}`);
  // Not a failure. A league below the minimum match count publishes `null` rather than a
  // score, because the ratios swing on a single result at that size.
  console.log(`Not yet rated : ${result.leaguesUnrated}`);
  console.log(`Computed at   : ${result.computedAt}`);
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then(() => process.exit(0)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
