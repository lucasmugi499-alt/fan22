import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PLACEHOLDER_PREFIX, registeredProjectId } from '../lib/deployTarget';
import { resolveProjectId } from '../lib/firestoreTarget';

const ROOT = process.cwd();
const MANIFEST_FILE = path.join(ROOT, 'data/demo/seed-manifest.json');
const REPORT_DIR = path.join(ROOT, 'reports/demo-data');

type Manifest = {
  seedVersion: string;
  counts: Record<string, number>;
  content: {
    databasePath: string;
    databaseSha256: string;
  };
  scenarioPacks: string[];
};

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

function sha256(file: string) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function action() {
  const prefix = '--action=';
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? process.argv[2] ?? 'validate';
}

function validate() {
  const manifest = readJson<Manifest>(MANIFEST_FILE);
  const databaseFile = path.join(ROOT, manifest.content.databasePath);
  if (!existsSync(databaseFile)) throw new Error(`${manifest.content.databasePath} is missing.`);

  const actualHash = sha256(databaseFile);
  if (actualHash !== manifest.content.databaseSha256) {
    throw new Error(`Demo database checksum mismatch. Expected ${manifest.content.databaseSha256}, got ${actualHash}.`);
  }

  const database = readJson<Record<string, unknown>>(databaseFile);
  const mismatches: string[] = [];
  for (const [collection, expected] of Object.entries(manifest.counts)) {
    const value = database[collection];
    const actual = Array.isArray(value) ? value.length : 0;
    if (actual !== expected) mismatches.push(`${collection}: expected ${expected}, got ${actual}`);
  }

  for (const scenarioId of manifest.scenarioPacks) {
    const scenarioFile = path.join(ROOT, `data/demo/scenarios/${scenarioId}.json`);
    if (!existsSync(scenarioFile)) mismatches.push(`scenario missing: ${scenarioId}`);
  }

  if (mismatches.length) throw new Error(`Demo validation failed:\n${mismatches.join('\n')}`);
  console.log(`Demo seed ${manifest.seedVersion} validation passed.`);
}

function requireResetControls(environment: 'demo' | 'beta') {
  const missing: string[] = [];
  if (!process.env.GOALPLACE_ACTIVATION_IDENTITY) missing.push('GOALPLACE_ACTIVATION_IDENTITY');
  if (process.env.GOALPLACE_BACKUP_CONFIRMED !== 'true') missing.push('GOALPLACE_BACKUP_CONFIRMED=true');
  if (process.env.GOALPLACE_RESET_CONFIRM !== `RESET GOALPLACE256 ${environment.toUpperCase()}`) {
    missing.push(`GOALPLACE_RESET_CONFIRM="RESET GOALPLACE256 ${environment.toUpperCase()}"`);
  }
  if (missing.length) throw new Error(`Reset refused. Missing protected control input(s): ${missing.join(', ')}.`);
}

/**
 * The environment named on the command line must be the one the ambient shell is pointed at.
 *
 * The confirmation phrase above already carries the environment name, so a demo reset cannot
 * be confirmed with a beta phrase. What it could not catch is the opposite direction: the
 * right phrase typed in a shell whose `GOALPLACE_ENVIRONMENT` or Firebase project variables
 * were inherited from a previous session and point somewhere else. The operator types
 * `RESET GOALPLACE256 DEMO`, means demo, and the process is looking at beta.
 *
 * All three environments also share the database id `fg256`, so a wrong project resolves to
 * a database that exists under the expected name instead of failing loudly. That is the same
 * property that made the production deploy script's demo project id survivable-looking, and
 * it is why this refuses on disagreement rather than warning.
 */
function requireMatchingTarget(environment: 'demo' | 'beta') {
  const declared = process.env.GOALPLACE_ENVIRONMENT;
  if (declared && declared !== environment) {
    throw new Error(
      `Reset refused. --action names '${environment}' but GOALPLACE_ENVIRONMENT is '${declared}'. `
      + 'Unset it or run in a shell configured for the environment you mean.',
    );
  }

  const resolvedProject = resolveProjectId();
  if (!resolvedProject) return; // Nothing ambient to disagree with.

  let expected: string | undefined;
  try {
    expected = registeredProjectId(environment, ROOT);
  } catch {
    throw new Error('Reset refused. config/environments.json could not be read.');
  }

  if (!expected) {
    throw new Error(
      `Reset refused. '${environment}' is still a ${PLACEHOLDER_PREFIX} placeholder in `
      + 'config/environments.json, so the target cannot be verified.',
    );
  }

  if (resolvedProject !== expected) {
    throw new Error(
      `Reset refused. '${environment}' is registered to project '${expected}', but this shell `
      + `resolves to '${resolvedProject}'. Every environment uses database 'fg256', so a wrong `
      + 'project would have found a real database under the expected name.',
    );
  }
}

function writeReport(name: string, body: Record<string, unknown>) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(REPORT_DIR, `${name}-${stamp}.json`);
  writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
  console.log(path.relative(ROOT, file));
}

function exportManifest() {
  validate();
  const manifest = readJson<Manifest>(MANIFEST_FILE);
  writeReport('demo-export', {
    action: 'demo-export',
    seedVersion: manifest.seedVersion,
    databasePath: manifest.content.databasePath,
    databaseSha256: manifest.content.databaseSha256,
    exportedAt: new Date().toISOString(),
    databaseMutation: 'none',
  });
}

function protectedLifecycle(environment: 'demo' | 'beta', lifecycleAction: 'reset' | 'seed') {
  validate();
  requireMatchingTarget(environment);
  requireResetControls(environment);
  writeReport(`${environment}-${lifecycleAction}-request`, {
    action: lifecycleAction,
    environment,
    requestedBy: process.env.GOALPLACE_ACTIVATION_IDENTITY,
    backupConfirmed: true,
    seedVersion: readJson<Manifest>(MANIFEST_FILE).seedVersion,
    databaseMutation: 'not executed by this guard script',
    nextStep:
      environment === 'beta'
        ? 'Run scripts/seed-investor-demo.ts with the beta project, --reset, --create-auth and --execute.'
        : 'Run the approved demo reset workflow against the demo project after entering maintenance mode.',
  });
}

try {
  switch (action()) {
    case 'validate':
      validate();
      break;
    case 'export':
      exportManifest();
      break;
    case 'demo-reset':
      protectedLifecycle('demo', 'reset');
      break;
    case 'beta-seed':
      protectedLifecycle('beta', 'seed');
      break;
    case 'beta-reset':
      protectedLifecycle('beta', 'reset');
      break;
    default:
      throw new Error('Usage: tsx scripts/demo/data-lifecycle.ts --action=validate|export|demo-reset|beta-seed|beta-reset');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
