import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

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
