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
  // NOT authorization. `isLinkedRecipient` is a conflict-of-interest control: a true
  // result DENIES the payment, because you may not support a recipient you control.
  // Deleting the legacy read here would widen who can route money to an account they run.
  // The canonical assignment was added alongside it rather than substituted for it, so the
  // deny is a union and neither source can grant anything.
  { file: 'src/app/api/payments/intents/route.ts', reads: 1, owedCapability: 'none — self-dealing deny, must not be removed' },
  // Remaining lines are schema fields and record initialisers (adminUserIds: [] on
  // creation, z.array in the request schema), not authorization decisions.
  { file: 'src/app/api/admin/actions/route.ts', reads: 1, owedCapability: 'none — schema and record initialisation' },
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

/**
 * Every platform command must name the capability it requires.
 *
 * `securePlatformCommand` skips the capability check when a command declares none, so an
 * omitted `requiredCapability` is not a stricter default — it is no check at all. Eight of
 * the most powerful commands on the platform shipped that way, including organization
 * creation, account lifecycle and trust-case decisions.
 */
function findUngatedPlatformCommands(source: string): string[] {
  const ungated: string[] = [];
  // Each call opens with `securePlatformCommand({`; the declaration block ends at the
  // handler. Checking the block rather than the whole file keeps one command's capability
  // from covering for its neighbour's.
  const marker = 'securePlatformCommand({';
  let index = source.indexOf(marker);
  while (index !== -1) {
    const block = source.slice(index, source.indexOf('handler:', index) + 1);
    const command = /command:\s*'([^']+)'/.exec(block)?.[1];
    if (command && !/requiredCapability:\s*'/.test(block)) ungated.push(command);
    index = source.indexOf(marker, index + marker.length);
  }
  return ungated;
}


/**
 * A role is not a capability.
 *
 * `requireRole(...)` is a legitimate coarse filter — it DENIES anyone outside a role set
 * before any work happens. What this counts is the opposite shape: a role comparison used
 * to GRANT, short-circuiting a capability check or standing in for one entirely.
 *
 * This budget exists because "the role bypasses are fixed" was claimed once after closing
 * only the four sites an audit happened to name. The pattern outlived the list. A number
 * that has to shrink is harder to overstate than a checklist.
 */
const ROLE_GRANT_PATTERNS = [
  // Quote-agnostic on purpose. The first version of this matched only single quotes, so a
  // double-quoted grant passed the guard silently — a detector with a blind spot is worse
  // than none, because it certifies what it cannot see.
  /role\s*===\s*['"`](platform_admin|super_admin)['"`]/,
  /\[['"`]platform_admin['"`],\s*['"`]super_admin['"`]\]\.includes/,
  /includes\(String\(actor\.role/,
];

/** Coarse role FILTERS deny rather than grant, and are not what this counts. */
const NOT_A_ROLE_GRANT = [
  /requireRole\(/,
  /^\s*\*/,
  /^\s*\/\//,
  // Selecting which account class is required is not an authorization decision.
  /requiredAccountClass/,
];

type RoleBudget = { file: string; grants: number; owedCapability: string };

const KNOWN_ROLE_GRANTS: RoleBudget[] = [
  { file: 'src/app/api/matches/[matchId]/evidence/route.ts', grants: 1, owedCapability: 'platform.admin.manage' },
  { file: 'src/app/api/athlete-claims/route.ts', grants: 1, owedCapability: 'platform.admin.manage' },
  { file: 'src/app/api/payments/intents/[paymentIntentId]/status/route.ts', grants: 1, owedCapability: 'platform.audit.read' },
  { file: 'src/app/api/result-submissions/[matchId]/correction/route.ts', grants: 1, owedCapability: 'platform.admin.manage (correction REQUEST path; approval already converted)' },
  { file: 'src/app/api/support-needs/[supportNeedId]/review/route.ts', grants: 1, owedCapability: 'platform.admin.manage' },
  { file: 'src/app/api/fantasy/admin/route.ts', grants: 1, owedCapability: 'platform.admin.manage' },
  // Chooses which account class is demanded, then authorizes by capability either way.
  { file: 'src/server/platform/commands/securePlatformCommand.ts', grants: 1, owedCapability: 'none — selects required account class, not authority' },
];

function countRoleGrants(source: string): number {
  let count = 0;
  for (const line of source.split('\n')) {
    if (NOT_A_ROLE_GRANT.some((pattern) => pattern.test(line))) continue;
    if (ROLE_GRANT_PATTERNS.some((pattern) => pattern.test(line))) count += 1;
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

  // Ungated platform commands are a hard failure with no budget: unlike the legacy reads
  // below, there is no migration in progress here and no reason to add one.
  const ungated: string[] = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (!source.includes('securePlatformCommand({')) continue;
    for (const command of findUngatedPlatformCommands(source)) {
      ungated.push(`${file.split(path.sep).join('/')} -> ${command}`);
    }
  }

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

  // Role-grant budget, measured the same way.
  const roleBudgets = new Map(KNOWN_ROLE_GRANTS.map((entry) => [entry.file, entry]));
  const roleActual = new Map<string, number>();
  for (const file of files) {
    const normalized = file.split(path.sep).join('/');
    // security.ts DEFINES requireRole; its implementation line is the coarse filter itself,
    // not a grant that uses one.
    if (normalized === 'src/server/api/security.ts') continue;
    const count = countRoleGrants(await readFile(file, 'utf8'));
    if (count > 0) roleActual.set(normalized, count);
  }
  for (const [file, count] of [...roleActual].sort()) {
    const budget = roleBudgets.get(file);
    if (!budget) regressions.push(`NEW role-as-capability grant in ${file} (${count}). Authorize with a capability — see src/server/access/capabilities.ts.`);
    else if (count > budget.grants) regressions.push(`${file} grew from ${budget.grants} to ${count} role grant(s).`);
    else if (count < budget.grants) violations.push(`${file} is down to ${count} role grant(s) (budget ${budget.grants}) — lower it.`);
  }
  for (const file of roleBudgets.keys()) {
    if (!roleActual.has(file)) violations.push(`${file} has no role grants left — remove its budget entry.`);
  }
  const roleRemaining = [...roleActual.values()].reduce((a, b) => a + b, 0);

  const remaining = [...actual.values()].reduce((a, b) => a + b, 0);
  console.log('Legacy authorization guard');
  console.log(`Files scanned: ${files.length}`);
  console.log(`Legacy authorization lines remaining: ${remaining} across ${actual.size} file(s)`);
  console.log(`Ungated platform commands: ${ungated.length}`);
  console.log(`Role-as-capability grants: ${roleRemaining} across ${roleActual.size} file(s)`);
  console.log('');

  if (update) {
    console.log('Corrected budget:');
    for (const [file, count] of [...actual].sort()) {
      const owed = budgets.get(file)?.owedCapability ?? 'TODO: choose the canonical capability';
      console.log(`  { file: '${file}', reads: ${count}, owedCapability: '${owed}' },`);
    }
    return { remaining, regressions, violations };
  }

  for (const command of ungated) {
    console.log(`  BLOCK  platform command declares no requiredCapability: ${command}`);
  }
  for (const message of regressions) console.log(`  BLOCK  ${message}`);
  for (const message of violations) console.log(`  STALE  ${message}`);

  if (ungated.length) {
    console.log('');
    console.log(`${ungated.length} platform command(s) declare no requiredCapability.`);
    console.log('securePlatformCommand skips the check entirely when none is named, so this');
    console.log('is not a stricter default — it is no capability check at all.');
    process.exitCode = 1;
  } else if (regressions.length) {
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
