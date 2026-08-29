import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeMigrationFirestore } from '../lib/firestoreTarget';
import { recomputeSeasonStandings } from '../../src/server/standings/projection';

/**
 * Rebuild every season's stored league table from its official results.
 *
 * ## When this is needed
 *
 * Once, to backfill. The projection is written when a result is finalized, so a season whose
 * results were all finalized before the projection existed has no rows — and the read path
 * falls back to computing in the browser, which is the behaviour being replaced. Running this
 * is what actually moves existing leagues onto the projection.
 *
 * After that, as a repair. Because recomputation is deterministic and reads all of a season's
 * verified matches rather than adding to a stored total, running this is always safe and
 * always converges: a table corrupted by anything at all is fixed by running it again. That
 * property is the reason the projection was built this way, and this script is where it pays
 * off.
 *
 * ## Usage
 *
 *   tsx scripts/standings/rebuild.ts                      # dry run, prints what would change
 *   tsx scripts/standings/rebuild.ts --apply              # writes
 *   tsx scripts/standings/rebuild.ts --apply --season=X   # one season
 *
 * Dry run by default, and it prints its resolved project and database before doing anything —
 * a count with no stated target is not evidence.
 */

type Args = {
  apply: boolean;
  seasonId?: string;
  leagueId?: string;
};

function parseArgs(argv: string[]): Args {
  const value = (name: string) => {
    const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
    return inline?.slice(name.length + 3);
  };
  return {
    apply: argv.includes('--apply'),
    seasonId: value('season'),
    leagueId: value('league'),
  };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const target = initializeMigrationFirestore();

  console.log(`Standings rebuild — target ${target.label}`);
  console.log(args.apply ? 'Mode: APPLY (writes)' : 'Mode: dry run (no writes)');

  const seasonsQuery = args.seasonId
    ? target.db.collection('seasons').where('__name__', '==', args.seasonId)
    : args.leagueId
      ? target.db.collection('seasons').where('leagueId', '==', args.leagueId)
      : target.db.collection('seasons');

  const seasons = await seasonsQuery.get();
  console.log(`Seasons in scope: ${seasons.size}`);

  let rebuilt = 0;
  let rowsWritten = 0;
  let rowsRemoved = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const seasonDoc of seasons.docs) {
    const seasonId = seasonDoc.id;
    const leagueId = seasonDoc.data()?.leagueId as string | undefined;

    if (!args.apply) {
      // A dry run must not write, so it reports what a rebuild would cover rather than
      // computing a table it would then throw away.
      const matches = await target.db.collection('matches')
        .where('seasonId', '==', seasonId)
        .count()
        .get()
        .catch(() => undefined);
      const existing = await target.db.collection('standings')
        .where('seasonId', '==', seasonId)
        .count()
        .get()
        .catch(() => undefined);
      console.log(
        `  ${seasonId} (league ${leagueId ?? 'unknown'}): `
        + `${matches?.data().count ?? '?'} matches, ${existing?.data().count ?? '?'} stored rows`,
      );
      continue;
    }

    try {
      const result = await recomputeSeasonStandings(target.db, seasonId, { leagueId });
      if (!result) {
        skipped += 1;
        console.warn(`  ${seasonId}: skipped (no league could be resolved)`);
        continue;
      }
      rebuilt += 1;
      rowsWritten += result.rowsWritten;
      rowsRemoved += result.rowsRemoved;
      console.log(
        `  ${seasonId}: ${result.rowsWritten} rows from ${result.officialMatches} official `
        + `matches${result.rowsRemoved ? `, ${result.rowsRemoved} stale removed` : ''}`,
      );
    } catch (error) {
      // Carry on. One oversized or malformed season must not stop every other league's table
      // being repaired, and the failures are reported together at the end.
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${seasonId}: ${message}`);
      console.error(`  ${seasonId}: FAILED — ${message}`);
    }
  }

  console.log('');
  console.log(`Target      : ${target.label}`);
  console.log(`Seasons     : ${seasons.size}`);
  if (args.apply) {
    console.log(`Rebuilt     : ${rebuilt}`);
    console.log(`Rows written: ${rowsWritten}`);
    console.log(`Rows removed: ${rowsRemoved}`);
    console.log(`Skipped     : ${skipped}`);
    console.log(`Failed      : ${failures.length}`);
  } else {
    console.log('No writes were made. Re-run with --apply.');
  }

  if (failures.length) {
    throw new Error(`${failures.length} season(s) failed:\n${failures.join('\n')}`);
  }

  return { seasons: seasons.size, rebuilt, rowsWritten, rowsRemoved, skipped };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
