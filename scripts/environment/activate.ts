import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assertSafeProductionEnvironment, type GoalPlaceEnvironment } from '../../src/lib/environment';

type SwitchableEnvironment = 'demo' | 'beta' | 'production';
type ActiveEnvironment = SwitchableEnvironment | 'maintenance';

type EnvironmentRegistry = {
  publicDomain: string;
  activationStateFile: string;
  environments: Record<SwitchableEnvironment, {
    label: string;
    firebaseProjectId: string;
    firestoreDatabaseId: string;
    appHostingConfig: string;
    expectedDataOrigin: string;
    requiresDemoLogin: boolean;
    requiresInvestorTools: boolean;
    paymentsMode: 'disabled' | 'sandbox';
    directOriginPolicy: string;
  }>;
};

type ActivationState = {
  activeEnvironment: ActiveEnvironment;
  previousEnvironment: ActiveEnvironment | null;
  environmentVersion: string;
  publicUrl: string;
  maintenance: boolean;
  updatedAt: string;
  updatedBy: string;
  lastActivationReport: string | null;
};

const ROOT = process.cwd();
const REGISTRY_FILE = path.join(ROOT, 'config/environments.json');
const ACTIVE_FILE = path.join(ROOT, 'config/active-environment.json');
const REPORT_DIR = path.join(ROOT, 'reports/environment');

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

function writeJson(file: string, value: unknown) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function arg(name: string) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}

function hasPlaceholders(file: string) {
  return readFileSync(file, 'utf8').includes('REPLACE_WITH_');
}

function appHostingValues(file: string) {
  const text = readFileSync(file, 'utf8');
  const values = new Map<string, string>();
  const blocks = text.matchAll(/-\s+variable:\s+([A-Z0-9_]+)([\s\S]*?)(?=\n\s*-\s+variable:|\n\S|$)/g);
  for (const block of blocks) {
    const value = block[2].match(/\n\s+value:\s+"?([^"\n]+)"?/);
    if (value) values.set(block[1], value[1]);
  }
  return values;
}

function expectSetting(values: Map<string, string>, name: string, expected: string, problems: string[]) {
  const actual = values.get(name);
  if (actual !== expected) problems.push(`${name} expected ${expected}, got ${actual ?? 'missing'}`);
}

function requireControlInputs(target: ActiveEnvironment) {
  const missing: string[] = [];
  if (!process.env.GOALPLACE_ACTIVATION_IDENTITY) missing.push('GOALPLACE_ACTIVATION_IDENTITY');
  if (process.env.GOALPLACE_BACKUP_CONFIRMED !== 'true') missing.push('GOALPLACE_BACKUP_CONFIRMED=true');
  if (process.env.GOALPLACE_HEALTHCHECK_PASSED !== 'true') missing.push('GOALPLACE_HEALTHCHECK_PASSED=true');
  if (process.env.GOALPLACE_CACHE_PURGED !== 'true') missing.push('GOALPLACE_CACHE_PURGED=true');
  if (process.env.GOALPLACE_POST_SWITCH_SMOKE_PASSED !== 'true') missing.push('GOALPLACE_POST_SWITCH_SMOKE_PASSED=true');

  if (target === 'production' && process.env.GOALPLACE_PRODUCTION_CONFIRM !== 'ACTIVATE GOALPLACE256 PRODUCTION') {
    missing.push('GOALPLACE_PRODUCTION_CONFIRM="ACTIVATE GOALPLACE256 PRODUCTION"');
  }

  if (missing.length) {
    throw new Error(`Activation refused. Missing protected control input(s): ${missing.join(', ')}.`);
  }
}

function validateTarget(registry: EnvironmentRegistry, target: SwitchableEnvironment) {
  const config = registry.environments[target];
  const appHostingFile = path.join(ROOT, config.appHostingConfig);
  if (!existsSync(appHostingFile)) throw new Error(`${config.appHostingConfig} is missing.`);
  if (target !== 'demo' && hasPlaceholders(appHostingFile)) {
    throw new Error(`${config.appHostingConfig} still contains REPLACE_WITH_* placeholders.`);
  }
  if (config.firebaseProjectId.startsWith('REPLACE_WITH_')) {
    throw new Error(`${target} Firebase project is not configured.`);
  }

  const values = appHostingValues(appHostingFile);
  const problems: string[] = [];
  expectSetting(values, 'GOALPLACE_ENVIRONMENT', target, problems);
  expectSetting(values, 'NEXT_PUBLIC_GOALPLACE_ENVIRONMENT', target, problems);
  expectSetting(values, 'GOALPLACE_DATA_ORIGIN', config.expectedDataOrigin, problems);
  expectSetting(values, 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', config.firebaseProjectId, problems);
  expectSetting(values, 'GOALPLACE_ADMIN_PROJECT_ID', config.firebaseProjectId, problems);
  expectSetting(values, 'GOALPLACE_ALLOW_REAL_PAYMENTS', 'false', problems);

  if (config.requiresDemoLogin) {
    expectSetting(values, 'NEXT_PUBLIC_ENABLE_DEMO_LOGIN', 'true', problems);
    expectSetting(values, 'GOALPLACE_ALLOW_DEMO_LOGIN', 'true', problems);
  } else {
    expectSetting(values, 'NEXT_PUBLIC_ENABLE_DEMO_LOGIN', 'false', problems);
    expectSetting(values, 'GOALPLACE_ALLOW_DEMO_LOGIN', 'false', problems);
  }

  if (config.requiresInvestorTools) {
    expectSetting(values, 'GOALPLACE_ENABLE_INVESTOR_TOOLS', 'true', problems);
    expectSetting(values, 'NEXT_PUBLIC_GOALPLACE_ENABLE_INVESTOR_TOOLS', 'true', problems);
  } else {
    expectSetting(values, 'GOALPLACE_ENABLE_INVESTOR_TOOLS', 'false', problems);
    expectSetting(values, 'NEXT_PUBLIC_GOALPLACE_ENABLE_INVESTOR_TOOLS', 'false', problems);
  }

  if (config.paymentsMode === 'sandbox') expectSetting(values, 'GOALPLACE_PAYMENTS_MODE', 'sandbox', problems);
  if (config.paymentsMode === 'disabled' && values.get('GOALPLACE_PAYMENTS_MODE') === 'sandbox' && target === 'production') {
    problems.push('production cannot activate with sandbox payments');
  }

  if (problems.length) {
    throw new Error(`${target} App Hosting config failed activation assertions:\n${problems.join('\n')}`);
  }

  if (target === 'production') {
    assertSafeProductionEnvironment({
      NODE_ENV: 'production',
      GOALPLACE_ENVIRONMENT: 'production',
      NEXT_PUBLIC_GOALPLACE_ENVIRONMENT: 'production',
      GOALPLACE_DATA_ORIGIN: 'production',
      NEXT_PUBLIC_DATA_MODE: 'firebase',
      GOALPLACE_ALLOW_DEMO_LOGIN: 'false',
      NEXT_PUBLIC_ENABLE_DEMO_LOGIN: 'false',
      GOALPLACE_ALLOW_SEEDING: 'false',
      GOALPLACE_ALLOW_REAL_PAYMENTS: 'false',
      GOALPLACE_ENABLE_INVESTOR_TOOLS: 'false',
      NEXT_PUBLIC_GOALPLACE_ENABLE_INVESTOR_TOOLS: 'false',
    } as NodeJS.ProcessEnv);
  }
}

function reportId(target: ActiveEnvironment, action: string, now: string) {
  const digest = createHash('sha256')
    .update(`${target}:${action}:${now}:${process.env.GOALPLACE_ACTIVATION_IDENTITY ?? 'unknown'}`)
    .digest('hex')
    .slice(0, 12);
  return `environment-${action}-${target}-${now.replace(/[:.]/g, '-')}-${digest}.json`;
}

function writeReport(input: {
  action: string;
  target: ActiveEnvironment;
  previous: ActiveEnvironment | null;
  next: ActivationState;
  registry: EnvironmentRegistry;
}) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, reportId(input.target, input.action, input.next.updatedAt));
  writeJson(file, {
    action: input.action,
    target: input.target,
    previous: input.previous,
    publicDomain: input.registry.publicDomain,
    publicUrl: input.next.publicUrl,
    environmentVersion: input.next.environmentVersion,
    deploymentIdentity: process.env.GOALPLACE_ACTIVATION_IDENTITY,
    backupConfirmed: process.env.GOALPLACE_BACKUP_CONFIRMED === 'true',
    healthcheckPassed: process.env.GOALPLACE_HEALTHCHECK_PASSED === 'true',
    cachePurgeConfirmed: process.env.GOALPLACE_CACHE_PURGED === 'true',
    postSwitchSmokePassed: process.env.GOALPLACE_POST_SWITCH_SMOKE_PASSED === 'true',
    databaseMutation: 'none',
    createdAt: input.next.updatedAt,
  });
  return path.relative(ROOT, file);
}

function nextState(
  state: ActivationState,
  target: ActiveEnvironment,
  action: string,
  registry: EnvironmentRegistry,
): ActivationState {
  const now = new Date().toISOString();
  const previous = state.activeEnvironment === target ? state.previousEnvironment : state.activeEnvironment;
  const provisional: ActivationState = {
    activeEnvironment: target,
    previousEnvironment: previous,
    environmentVersion: `env-${target}-${now.replace(/[:.]/g, '-')}`,
    publicUrl: process.env.GOALPLACE_PUBLIC_URL ?? `https://${registry.publicDomain}`,
    maintenance: target === 'maintenance',
    updatedAt: now,
    updatedBy: process.env.GOALPLACE_ACTIVATION_IDENTITY ?? 'unknown',
    lastActivationReport: null,
  };
  provisional.lastActivationReport = writeReport({
    action,
    target,
    previous,
    next: provisional,
    registry,
  });
  return provisional;
}

function activate(target: ActiveEnvironment, action = 'activate') {
  const registry = readJson<EnvironmentRegistry>(REGISTRY_FILE);
  const state = readJson<ActivationState>(ACTIVE_FILE);

  if (target !== 'maintenance') validateTarget(registry, target);
  requireControlInputs(target);

  const next = nextState(state, target, action, registry);
  writeJson(ACTIVE_FILE, next);
  console.log(`Active environment: ${next.activeEnvironment}`);
  console.log(`Previous environment: ${next.previousEnvironment ?? 'none'}`);
  console.log(`Environment version: ${next.environmentVersion}`);
  console.log(`Audit report: ${next.lastActivationReport}`);
  console.log('Database mutation: none');
}

function status() {
  const state = readJson<ActivationState>(ACTIVE_FILE);
  console.log(`Active environment : ${state.activeEnvironment}`);
  console.log(`Previous environment: ${state.previousEnvironment ?? 'none'}`);
  console.log(`Environment version: ${state.environmentVersion}`);
  console.log(`Public URL         : ${state.publicUrl}`);
  console.log(`Maintenance        : ${state.maintenance ? 'yes' : 'no'}`);
  console.log(`Updated at         : ${state.updatedAt}`);
  console.log(`Updated by         : ${state.updatedBy}`);
  console.log(`Last report        : ${state.lastActivationReport ?? 'none'}`);
}

function rollback() {
  const state = readJson<ActivationState>(ACTIVE_FILE);
  if (!state.previousEnvironment) throw new Error('Rollback refused. No previous environment is recorded.');
  activate(state.previousEnvironment, 'rollback');
}

const action = arg('action') ?? process.argv[2] ?? 'status';
const target = arg('environment') as GoalPlaceEnvironment | undefined;

try {
  if (action === 'status') status();
  else if (action === 'rollback') rollback();
  else if (action === 'maintenance') activate('maintenance', 'maintenance');
  else if (action === 'activate' && target && ['demo', 'beta', 'production'].includes(target)) {
    activate(target as SwitchableEnvironment);
  } else {
    throw new Error('Usage: tsx scripts/environment/activate.ts --action=status|activate|maintenance|rollback --environment=demo|beta|production');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
