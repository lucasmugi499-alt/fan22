import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/**
 * Fails the build when a surface reads a deprecated team-derived sports field.
 *
 * `team.leaguePoints`, `team.wins`, `team.draws`, `team.losses`, `team.pointsFor`,
 * `team.pointsAgainst` and `team.record` are stored aggregates. They were seeded
 * independently of any match, which is how clubs came to display 19 points and records like
 * 3-0-10 in a competition holding four fixtures, beside a league table showing them on zero.
 *
 * The official standings projection is the only authority for a sporting number. These
 * fields have been repaired to agree with it, but a repaired copy still drifts the moment
 * the next result lands, so nothing may read them as truth again.
 *
 * A fallback is allowed and is what the budget counts: `standing?.points ?? team.leaguePoints`
 * renders something on a surface that has not loaded a table. What is not allowed is a NEW
 * file reading these fields, because that is how a second source of sporting truth grows
 * back.
 */

const DEPRECATED_FIELD_READS = [
  /\.leaguePoints\b/,
  /\.pointsFor\b/,
  /\.pointsAgainst\b/,
  /\bteamRecord\(/,
  // league.teamsCount is the same class of problem one level up: a manually maintained
  // count that advertised eight clubs in leagues holding four. It is repaired and now
  // agrees with the documents, but a stored count drifts the moment a club is added.
  /\.teamsCount\b/,
  /**
   * ADR-001, invariant 08: no document field is named bare `position` or bare `name` on an
   * athlete.
   *
   * An athlete has two names, the one the League registered and the one they call
   * themselves, and they belong to different owners. `athlete.name` is exactly how those two
   * domains leak into each other six months from now, when somebody reaches for the obvious
   * field. Read `legalName` and `registeredPosition`, or the helpers in
   * src/lib/athleteIdentity.ts where a pre-rename document is still possible.
   */
  /\bathlete\??\.name\b/,
  /\bathlete\??\.position\b/,
];

/** Writes and schema declarations are not reads; the repair script must set these. */
const NOT_A_READ = [
  /leaguePoints:/,
  /pointsFor:/,
  /pointsAgainst:/,
  /teamsCount:/,
  /^\s*\*/,
  /^\s*\/\//,
];

type Budget = { file: string; reads: number; why: string };

/**
 * Every remaining read, with why it is tolerated. All of these are fallbacks behind the
 * projection, never the primary value.
 */
const KNOWN: Budget[] = [
  { file: 'src/components/core/EntityCards.tsx', reads: 2, why: 'team points fallback, and the league team count on LeagueCard' },
  { file: 'src/components/core/TeamPublic.tsx', reads: 2, why: 'fallback behind officialRecord' },
  { file: 'src/components/team/TeamProfile.tsx', reads: 3, why: 'fallbacks behind the standings projection' },
  { file: 'src/components/team/TeamConsoleHome.tsx', reads: 2, why: 'fallback behind the standings projection' },
  { file: 'src/components/discover/TeamsDiscover.tsx', reads: 2, why: 'sort fallback when a league has no table' },
  { file: 'src/components/discover/DiscoverHub.tsx', reads: 1, why: 'fallback when a league has no table' },
  { file: 'src/components/discover/LeaguesDiscover.tsx', reads: 1, why: 'already prefers the actual team records; count is the fallback' },
  { file: 'src/components/marketing/Landing.tsx', reads: 1, why: 'marketing figure, not a sporting record' },
  { file: 'src/components/platform/PlatformReports.tsx', reads: 1, why: 'platform rollup, not a sporting record' },
  {
    file: 'src/lib/athleteIdentity.ts',
    reads: 2,
    why: 'the ADR-001 migration bridge itself: the one place permitted to read the pre-rename fields, so the fallback disappears in one edit',
  },
];

const SCAN_ROOTS = ['src/components', 'src/app', 'src/lib'];

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(full);
  }
  return files;
}

function countReads(source: string): number {
  let count = 0;
  for (const line of source.split('\n')) {
    if (NOT_A_READ.some((pattern) => pattern.test(line))) continue;
    if (DEPRECATED_FIELD_READS.some((pattern) => pattern.test(line))) count += 1;
  }
  return count;
}

export async function runDeprecatedFieldsGuard(argv = process.argv.slice(2)) {
  const update = argv.includes('--update');
  const budgets = new Map(KNOWN.map((entry) => [entry.file, entry]));

  const files: string[] = [];
  for (const root of SCAN_ROOTS) files.push(...await walk(root));

  const actual = new Map<string, number>();
  for (const file of files) {
    // The projection helper and the model that defines these fields are the definitions,
    // not consumers of them.
    const normalized = file.split(path.sep).join('/');
    // teamContext defines teamRecord; leagueModel computes pointsFor/pointsAgainst on the
    // projection's OWN rows, which are LeagueStanding fields rather than team aggregates.
    // Both are the definition of the authority, not consumers of the deprecated copy.
    if (normalized === 'src/lib/team/teamContext.ts') continue;
    if (normalized === 'src/lib/leagueModel.ts') continue;
    const count = countReads(await readFile(file, 'utf8'));
    if (count > 0) actual.set(normalized, count);
  }

  const problems: string[] = [];
  const stale: string[] = [];
  for (const [file, count] of [...actual].sort()) {
    const budget = budgets.get(file);
    if (!budget) problems.push(`NEW read of a deprecated team sports field in ${file} (${count}). Read the projection for a sporting number, or legalName/registeredPosition for an athlete.`);
    else if (count > budget.reads) problems.push(`${file} grew from ${budget.reads} to ${count}.`);
    else if (count < budget.reads) stale.push(`${file} is down to ${count} (budget ${budget.reads}) — lower it.`);
  }
  for (const file of budgets.keys()) {
    if (!actual.has(file)) stale.push(`${file} has no reads left — remove its budget entry.`);
  }

  const remaining = [...actual.values()].reduce((a, b) => a + b, 0);
  console.log('Deprecated team sports field guard');
  console.log(`Files scanned: ${files.length}`);
  console.log(`Deprecated field reads: ${remaining} across ${actual.size} file(s)`);

  if (update) {
    console.log('Corrected budget:');
    for (const [file, count] of [...actual].sort()) {
      console.log(`  { file: '${file}', reads: ${count}, why: '${budgets.get(file)?.why ?? 'TODO'}' },`);
    }
    return { remaining, problems, stale };
  }

  console.log('');
  for (const message of problems) console.log(`  BLOCK  ${message}`);
  for (const message of stale) console.log(`  STALE  ${message}`);

  if (problems.length) {
    console.log('');
    console.log('A sporting number must come from the official standings projection.');
    console.log('These stored aggregates derive from no match and drift on the next result.');
    process.exitCode = 1;
  } else if (stale.length) {
    console.log('');
    console.log('Budget is stale. It is meant to shrink in the same commit as the fix.');
    process.exitCode = 1;
  } else {
    console.log('No new reads of deprecated team sports fields. Budget matches.');
  }

  return { remaining, problems, stale };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDeprecatedFieldsGuard().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
