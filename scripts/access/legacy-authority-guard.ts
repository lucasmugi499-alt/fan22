import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/**
 * Fails the build when server code makes an authorization decision from a legacy
 * membership field.
 *
 * The canonical authority is `accessIndex` — account class, an active assignment, the
 * exact scope, the exact capability. Firestore Rules enforce that for client reads, but
 * server routes use the Admin SDK, which bypasses Rules entirely. So a route that reads
 * `league.adminUserIds` to decide access is not merely inconsistent: it is unreviewable
 * by the mechanism that is supposed to be canonical.
 *
 * `secureLeagueCommand` used to OR the legacy field into the decision. That arm was
 * removed on 2026-08-08. This guard exists so it cannot come back by accident, and so the
 * routes that still carry the pattern are counted rather than forgotten.
 *
 * ## How the budget works
 *
 * Every remaining site is listed in `KNOWN_LEGACY_AUTHORITY` with the capability it
 * should become. The guard fails if a file holds MORE legacy reads than its budget, and
 * also fails if it holds FEWER — a stale budget is how a list like this rots into
 * fiction. Fix a route, lower the number in the same commit. The budget can only shrink;
 * `npm run access:guard -- --update` prints the corrected table.
 */

/** Reading any of these to decide access is the defect. */
const LEGACY_AUTHORITY_PATTERNS = [
  /\badminUserIds\b/,
  /collection\(['"`]teamAssignments['"`]\)/,
];

/**
 * Writes that merely maintain the field as membership metadata, and reads that are not
 * authorization decisions. `adminUserIds` is allowed to exist — it just cannot decide.
 */
const NON_AUTHORITY_PATTERNS = [
  /adminUserIds:\s*(\[\]|FieldValue\.arrayUnion|FieldValue\.arrayRemove|z\.array)/,
  /targetCollection:\s*['"`]teamAssignments['"`]/,
  /^\s*\*/,           // doc comment
  /^\s*\/\//,         // line comment
];

type Budget = { file: string; reads: number; owedCapability: string; note?: string };

/**
 * The remaining legacy authorization sites, as of 2026-08-08.
 *
 * `owedCapability` is the canonical capability each site should check instead. It is
 * recorded here rather than guessed at fix time, because picking the wrong capability is
 * how a cutover turns into either a lockout or a privilege escalation.
 */
const KNOWN_LEGACY_AUTHORITY: Budget[] = [
  { file: 'src/app/api/payments/intents/route.ts', reads: 2, owedCapability: 'team.profile.manage / league.profile.manage', note: 'recipient-side check, branches on recipientType' },
  { file: 'src/app/api/result-submissions/[matchId]/correction/route.ts', reads: 5, owedCapability: 'league.result.resolve' },
  { file: 'src/app/api/athletes/route.ts', reads: 1, owedCapability: 'team.athlete.create' },
  { file: 'src/app/api/admin/actions/route.ts', reads: 4, owedCapability: 'league.profile.manage', note: 'split this route by domain first — see the Build 32 P1' },
  { file: 'src/app/api/support-needs/[supportNeedId]/completion/route.ts', reads: 2, owedCapability: 'league.profile.manage' },
  { file: 'src/app/api/matches/[matchId]/attendance-token/route.ts', reads: 2, owedCapability: 'league.profile.manage' },
  { file: 'src/app/api/challenges/[challengeId]/transition/route.ts', reads: 4, owedCapability: 'league.profile.manage + team.profile.manage' },
  { file: 'src/app/api/fantasy/admin/route.ts', reads: 1, owedCapability: 'league.profile.manage' },
  { file: 'src/app/api/support-needs/[supportNeedId]/review/route.ts', reads: 4, owedCapability: 'league.profile.manage + team.profile.manage' },
  // Not authorization: these maintain the legacy record so an operator can still revoke a
  // pre-migration teamAssignment. They are counted because the field should eventually go,
  // not because they decide anything.
  { file: 'src/app/api/access/route.ts', reads: 2, owedCapability: 'none — legacy data maintenance' },
  // Reads the field only to record a divergence observation; it cannot widen the decision.
  { file: 'src/server/platform/commands/securePlatformCommand.ts', reads: 2, owedCapability: 'none — observation only' },
];

const SCAN_ROOTS = ['src/app/api', 'src/server'];

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) files.push(full);
  }
  return files;
}

function countLegacyReads(source: string): number {
  let count = 0;
  for (const line of source.split('\n')) {
    if (NON_AUTHORITY_PATTERNS.some((p) => p.test(line))) continue;
    if (LEGACY_AUTHORITY_PATTERNS.some((p) => p.test(line))) count += 1;
  }
  return count;
}

export async function runLegacyAuthorityGuard(argv = process.argv.slice(2)) {
  const update = argv.includes('--update');
  const budgets = new Map(KNOWN_LEGACY_AUTHORITY.map((b) => [b.file, b]));

  const files: string[] = [];
  for (const root of SCAN_ROOTS) files.push(...await walk(root));

  const actual = new Map<string, number>();
  for (const file of files) {
    const count = countLegacyReads(await readFile(file, 'utf8'));
    if (count > 0) actual.set(file.split(path.sep).join('/'), count);
  }

  const violations: string[] = [];
  const regressions: string[] = [];

  for (const [file, count] of [...actual].sort()) {
    const budget = budgets.get(file);
    if (!budget) {
      regressions.push(`NEW legacy authorization in ${file} (${count} site(s)). Use accessIndex — see src/server/access/capabilities.ts.`);
    } else if (count > budget.reads) {
      regressions.push(`${file} grew from ${budget.reads} to ${count} legacy site(s).`);
    } else if (count < budget.reads) {
      violations.push(`${file} is down to ${count} (budget says ${budget.reads}) — lower the budget in scripts/access/legacy-authority-guard.ts.`);
    }
  }
  for (const file of budgets.keys()) {
    if (!actual.has(file)) violations.push(`${file} has no legacy sites left — remove its budget entry.`);
  }

  const remaining = [...actual.values()].reduce((a, b) => a + b, 0);
  console.log('Legacy authorization guard');
  console.log(`Files scanned: ${files.length}`);
  console.log(`Legacy authorization lines remaining: ${remaining} across ${actual.size} file(s)`);
  console.log('');

  if (update) {
    console.log('Corrected budget:');
    for (const [file, count] of [...actual].sort()) {
      const owed = budgets.get(file)?.owedCapability ?? 'TODO: choose the canonical capability';
      console.log(`  { file: '${file}', reads: ${count}, owedCapability: '${owed}' },`);
    }
    return { remaining, regressions, violations };
  }

  for (const message of regressions) console.log(`  BLOCK  ${message}`);
  for (const message of violations) console.log(`  STALE  ${message}`);

  if (regressions.length) {
    console.log('');
    console.log(`${regressions.length} new legacy authorization site(s). The Admin SDK bypasses Firestore Rules,`);
    console.log('so a decision made from adminUserIds is not reviewable by the canonical authority.');
    process.exitCode = 1;
  } else if (violations.length) {
    console.log('');
    console.log('Budget is stale. It is meant to shrink in the same commit as the fix.');
    process.exitCode = 1;
  } else {
    console.log('No new legacy authorization. Budget matches.');
  }

  return { remaining, regressions, violations };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLegacyAuthorityGuard().catch((error) => {
    console.error(`Legacy authority guard failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
