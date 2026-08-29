import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { computeLeagueIndex, publishedIndexScore, type IndexSignalKey } from '../../src/lib/leagueIndex';
import { adaptMatch } from '../../src/lib/matchRecord';
import type { Athlete, League, Match, Roster, Team } from '../../src/types';

/**
 * Recompute the GoalPlace Index in the curated demo dataset, from the dataset's own records.
 *
 * ## Why the seed needed this
 *
 * The seeded indexes were 797, 814, 831, 848, 865 and 882 — an arithmetic sequence, +17 each,
 * on a field the interface labels "index" and renders beside a 0-100 scale. They were not a
 * measurement of anything, and their shape makes that obvious the moment they are listed
 * together. The seeded `indexSignals` carried the seven-key shape whose `adminReliability` and
 * `mediaUploads` were invented.
 *
 * Since `server/leagueIndex/projection.ts` now computes the real number hourly, leaving the
 * seed as it was would mean the demo showed 797 until the first hourly pass and then jumped to
 * something in the eighties — a visible discontinuity in the middle of a walkthrough, on the
 * exact number an investor is most likely to ask about.
 *
 * ## What it does
 *
 * Runs the same `computeLeagueIndex` the server runs, over the seed file, and writes the score
 * and its signals back. Then updates the manifest checksum, because `demo:validate` verifies
 * the dataset by sha256 and would otherwise fail on the next run.
 *
 *   tsx scripts/demo/recompute-index.ts            # report only
 *   tsx scripts/demo/recompute-index.ts --apply    # write the dataset and the checksum
 */

const ROOT = process.cwd();
const DATABASE = path.join(ROOT, 'data/investor-demo/database.json');
const MANIFEST = path.join(ROOT, 'data/demo/seed-manifest.json');

type Database = {
  leagues: League[];
  matches: Match[];
  teams: Team[];
  athletes: Athlete[];
  rosters: Roster[];
  [key: string]: unknown;
};

function signalValue(
  result: ReturnType<typeof computeLeagueIndex>,
  key: IndexSignalKey,
): number {
  const signal = result.signals.find((item) => item.key === key);
  if (!signal) throw new Error(`computeLeagueIndex produced no '${key}' signal`);
  return signal.value;
}

export function main(argv = process.argv.slice(2)) {
  const apply = argv.includes('--apply');
  const database = JSON.parse(readFileSync(DATABASE, 'utf8')) as Database;

  // Fixed, so a rerun produces identical output. A dataset whose contents depend on when the
  // script ran is one that cannot be checksummed.
  const now = new Date('2026-08-29T00:00:00.000Z');
  const matches = database.matches.map((match) => adaptMatch(match));

  const changes: string[] = [];

  for (const league of database.leagues) {
    const result = computeLeagueIndex({
      league,
      seasonId: league.currentSeasonId,
      matches,
      teams: database.teams,
      athletes: database.athletes,
      rosters: database.rosters ?? [],
      now,
    });
    const published = publishedIndexScore(result);

    changes.push(
      `${league.id}: ${league.goalPlaceIndex} -> ${published ?? 'not yet rated'}`
      + `  (${result.signals.map((s) => `${s.key} ${s.numerator}/${s.denominator}`).join(', ')})`,
    );

    league.goalPlaceIndex = published;
    // Built key by key rather than from an index signature, so adding a signal to
    // `IndexSignalKey` without handling it here is a type error instead of a silently
    // incomplete seed.
    league.indexSignals = {
      verification: signalValue(result, 'verification'),
      completion: signalValue(result, 'completion'),
      athleteRegistration: signalValue(result, 'athleteRegistration'),
      rosterConfirmation: signalValue(result, 'rosterConfirmation'),
    };
    league.indexEvidence = Object.fromEntries(result.signals.map((signal) => [
      signal.key,
      { numerator: signal.numerator, denominator: signal.denominator },
    ])) as League['indexEvidence'];
    league.indexEstablished = result.established;
    league.indexComputedAt = result.computedAt;
  }

  changes.forEach((line) => console.log(line));

  if (!apply) {
    console.log('\nNo files were written. Re-run with --apply.');
    return { changes, applied: false };
  }

  // Two spaces, trailing newline: matches the file's existing formatting so the diff is the
  // index values rather than the whole document.
  const serialized = `${JSON.stringify(database, null, 2)}\n`;
  writeFileSync(DATABASE, serialized);

  // `demo:validate` verifies the dataset by sha256 before every seed and as part of
  // `deploy:ready`. Editing the data without the checksum turns a correct change into a
  // failing gate.
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
    content: { databaseSha256: string };
  };
  manifest.content.databaseSha256 = createHash('sha256').update(readFileSync(DATABASE)).digest('hex');
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`\nWrote ${path.relative(ROOT, DATABASE)} and updated the manifest checksum.`);
  return { changes, applied: true };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
