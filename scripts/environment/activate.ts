import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeProductionEnvironment, type GoalPlaceEnvironment } from '../../src/lib/environment';

export type SwitchableEnvironment = 'demo' | 'beta' | 'production';
export type ActiveEnvironment = SwitchableEnvironment | 'maintenance';
export type EnvironmentAction = 'status' | 'activate' | 'maintenance' | 'rollback';

export type EnvironmentRegistry = {
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

export type ActivationState = {
  activeEnvironment: ActiveEnvironment;
  previousEnvironment: ActiveEnvironment | null;
  environmentVersion: string;
  publicUrl: string;
  maintenance: boolean;
  updatedAt: string;
  updatedBy: string;
  lastActivationReport: string | null;
};

export type ActivationOptions = {
  root?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
};

export type ActivationResult = {
  state: ActivationState;
  reportPath: string | null;
  lines: string[];
};

const DEFAULT_ROOT = process.cwd();

function paths(root: string) {
  return {
    registryFile: path.join(root, 'config/environments.json'),
    activeFile: path.join(root, 'config/active-environment.json'),
    reportDir: path.join(root, 'reports/environment'),
  };
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function arg(argv: string[], name: string) {
  const prefix = `--${name}=`;
  const value = argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}

function hasPlaceholders(file: string) {
  return readFileSync(file, 'utf8').includes('REPLACE_WITH_');
}

function appHostingValues(file: string) {
  const text = readFileSync(file, 'utf8');
  const values = new Map<string, string>();
  const secrets = new Map<string, string>();
  const blocks = text.matchAll(/-\s+variable:\s+([A-Z0-9_]+)([\s\S]*?)(?=\n\s*-\s+variable:|\n\S|$)/g);
  for (const block of blocks) {
    const value = block[2].match(/\n\s+value:\s+"?([^"\n]+)"?/);
    const secret = block[2].match(/\n\s+secret:\s+"?([^"\n]+)"?/);
    if (value) values.set(block[1], value[1]);
    if (secret) secrets.set(block[1], secret[1]);
  }
  return { values, secrets };
}

function expectSetting(values: Map<string, string>, name: string, expected: string, problems: string[]) {
  const actual = values.get(name);
  if (actual !== expected) problems.push(`${name} expected ${expected}, got ${actual ?? 'missing'}`);
}

function expectRequiredSetting(values: Map<string, string>, name: string, problems: string[]) {
  const actual = values.get(name);
  if (!actual || actual.startsWith('REPLACE_WITH_')) problems.push(`${name} is not configured`);
}

function expectSecret(secrets: Map<string, string>, values: Map<string, string>, name: string, expectedSecret: string, problems: string[]) {
  if (values.has(name)) {
    problems.push(`${name} must use a Secret Manager reference, not a plaintext value`);
    return;
  }
  const actual = secrets.get(name);
  if (actual !== expectedSecret) problems.push(`${name} expected secret ${expectedSecret}, got ${actual ?? 'missing'}`);
}

function requireControlInputs(target: ActiveEnvironment, env: NodeJS.ProcessEnv) {
  const missing: string[] = [];
  if (!env.GOALPLACE_ACTIVATION_IDENTITY) missing.push('GOALPLACE_ACTIVATION_IDENTITY');
  if (env.GOALPLACE_BACKUP_CONFIRMED !== 'true') missing.push('GOALPLACE_BACKUP_CONFIRMED=true');
  if (env.GOALPLACE_HEALTHCHECK_PASSED !== 'true') missing.push('GOALPLACE_HEALTHCHECK_PASSED=true');
  if (env.GOALPLACE_CACHE_PURGED !== 'true') missing.push('GOALPLACE_CACHE_PURGED=true');
  if (env.GOALPLACE_POST_SWITCH_SMOKE_PASSED !== 'true') missing.push('GOALPLACE_POST_SWITCH_SMOKE_PASSED=true');

  if (target === 'production' && env.GOALPLACE_PRODUCTION_CONFIRM !== 'ACTIVATE GOALPLACE256 PRODUCTION') {
    missing.push('GOALPLACE_PRODUCTION_CONFIRM="ACTIVATE GOALPLACE256 PRODUCTION"');
  }

  if (missing.length) {
    throw new Error(`Activation refused. Missing protected control input(s): ${missing.join(', ')}.`);
  }
}

function validateTarget(
  root: string,
  registry: EnvironmentRegistry,
  target: SwitchableEnvironment,
) {
  const config = registry.environments[target];
  if (!config) throw new Error(`${target} environment is not registered.`);

  const appHostingFile = path.join(root, config.appHostingConfig);
  if (!existsSync(appHostingFile)) throw new Error(`${config.appHostingConfig} is missing.`);
  if (target !== 'demo' && hasPlaceholders(appHostingFile)) {
    throw new Error(`${config.appHostingConfig} still contains REPLACE_WITH_* placeholders.`);
  }
  if (config.firebaseProjectId.startsWith('REPLACE_WITH_')) {
    throw new Error(`${target} Firebase project is not configured.`);
  }

  const { values, secrets } = appHostingValues(appHostingFile);
  const problems: string[] = [];
  expectSetting(values, 'GOALPLACE_ENVIRONMENT', target, problems);
  expectSetting(values, 'NEXT_PUBLIC_GOALPLACE_ENVIRONMENT', target, problems);
  expectSetting(values, 'GOALPLACE_DATA_ORIGIN', config.expectedDataOrigin, problems);
  expectSetting(values, 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', config.firebaseProjectId, problems);
  expectSetting(values, 'GOALPLACE_ADMIN_PROJECT_ID', config.firebaseProjectId, problems);
  expectSetting(values, 'GOALPLACE_ALLOW_REAL_PAYMENTS', 'false', problems);
  expectRequiredSetting(values, 'GOALPLACE_APP_BASE_URL', problems);
  expectRequiredSetting(values, 'GOALPLACE_EMAIL_FROM', problems);
  expectSecret(secrets, values, 'RESEND_API_KEY', 'resendApiKey', problems);

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

  if (problems.length) {
    throw new Error(`${target} App Hosting config failed activation assertions:\n${problems.join('\n')}`);
  }
}

function reportId(target: ActiveEnvironment, action: string, now: string, env: NodeJS.ProcessEnv) {
  const digest = createHash('sha256')
    .update(`${target}:${action}:${now}:${env.GOALPLACE_ACTIVATION_IDENTITY ?? 'unknown'}`)
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
  root: string;
  env: NodeJS.ProcessEnv;
}) {
  const reportDir = paths(input.root).reportDir;
  mkdirSync(reportDir, { recursive: true });
  const file = path.join(reportDir, reportId(input.target, input.action, input.next.updatedAt, input.env));
  writeJson(file, {
    action: input.action,
    target: input.target,
    previous: input.previous,
    publicDomain: input.registry.publicDomain,
    publicUrl: input.next.publicUrl,
    environmentVersion: input.next.environmentVersion,
    deploymentIdentity: input.env.GOALPLACE_ACTIVATION_IDENTITY,
    backupConfirmed: input.env.GOALPLACE_BACKUP_CONFIRMED === 'true',
    healthcheckPassed: input.env.GOALPLACE_HEALTHCHECK_PASSED === 'true',
    cachePurgeConfirmed: input.env.GOALPLACE_CACHE_PURGED === 'true',
    postSwitchSmokePassed: input.env.GOALPLACE_POST_SWITCH_SMOKE_PASSED === 'true',
    databaseMutation: 'none',
    createdAt: input.next.updatedAt,
  });
  return path.relative(input.root, file);
}

function nextState(input: {
  state: ActivationState;
  target: ActiveEnvironment;
  action: string;
  registry: EnvironmentRegistry;
  root: string;
  env: NodeJS.ProcessEnv;
  now: Date;
}): ActivationState {
  const timestamp = input.now.toISOString();
  const previous = input.state.activeEnvironment === input.target
    ? input.state.previousEnvironment
    : input.state.activeEnvironment;
  const provisional: ActivationState = {
    activeEnvironment: input.target,
    previousEnvironment: previous,
    environmentVersion: `env-${input.target}-${timestamp.replace(/[:.]/g, '-')}`,
    publicUrl: input.env.GOALPLACE_PUBLIC_URL ?? `https://${input.registry.publicDomain}`,
    maintenance: input.target === 'maintenance',
    updatedAt: timestamp,
    updatedBy: input.env.GOALPLACE_ACTIVATION_IDENTITY ?? 'unknown',
    lastActivationReport: null,
  };
  provisional.lastActivationReport = writeReport({
    action: input.action,
    target: input.target,
    previous,
    next: provisional,
    registry: input.registry,
    root: input.root,
    env: input.env,
  });
  return provisional;
}

export function activateEnvironment(
  target: ActiveEnvironment,
  action = 'activate',
  options: ActivationOptions = {},
): ActivationResult {
  const root = options.root ?? DEFAULT_ROOT;
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const { registryFile, activeFile } = paths(root);
  const registry = readJson<EnvironmentRegistry>(registryFile);
  const state = readJson<ActivationState>(activeFile);

  if (target !== 'maintenance') validateTarget(root, registry, target);
  requireControlInputs(target, env);

  const next = nextState({
    state,
    target,
    action,
    registry,
    root,
    env,
    now: now(),
  });
  writeJson(activeFile, next);

  return {
    state: next,
    reportPath: next.lastActivationReport,
    lines: [
      `Active environment: ${next.activeEnvironment}`,
      `Previous environment: ${next.previousEnvironment ?? 'none'}`,
      `Environment version: ${next.environmentVersion}`,
      `Audit report: ${next.lastActivationReport}`,
      'Database mutation: none',
    ],
  };
}

export function environmentStatus(options: ActivationOptions = {}): ActivationResult {
  const root = options.root ?? DEFAULT_ROOT;
  const state = readJson<ActivationState>(paths(root).activeFile);
  return {
    state,
    reportPath: state.lastActivationReport,
    lines: [
      `Active environment : ${state.activeEnvironment}`,
      `Previous environment: ${state.previousEnvironment ?? 'none'}`,
      `Environment version: ${state.environmentVersion}`,
      `Public URL         : ${state.publicUrl}`,
      `Maintenance        : ${state.maintenance ? 'yes' : 'no'}`,
      `Updated at         : ${state.updatedAt}`,
      `Updated by         : ${state.updatedBy}`,
      `Last report        : ${state.lastActivationReport ?? 'none'}`,
    ],
  };
}

export function rollbackEnvironment(options: ActivationOptions = {}) {
  const root = options.root ?? DEFAULT_ROOT;
  const state = readJson<ActivationState>(paths(root).activeFile);
  if (!state.previousEnvironment) throw new Error('Rollback refused. No previous environment is recorded.');
  return activateEnvironment(state.previousEnvironment, 'rollback', options);
}

export function runActivationCli(argv = process.argv.slice(2), options: ActivationOptions = {}) {
  const action = (arg(argv, 'action') ?? argv[0] ?? 'status') as EnvironmentAction;
  const target = arg(argv, 'environment') as GoalPlaceEnvironment | undefined;

  if (action === 'status') return environmentStatus(options);
  if (action === 'rollback') return rollbackEnvironment(options);
  if (action === 'maintenance') return activateEnvironment('maintenance', 'maintenance', options);
  if (action === 'activate' && target && ['demo', 'beta', 'production'].includes(target)) {
    return activateEnvironment(target as SwitchableEnvironment, 'activate', options);
  }
  throw new Error('Usage: tsx scripts/environment/activate.ts --action=status|activate|maintenance|rollback --environment=demo|beta|production');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const result = runActivationCli();
    for (const line of result.lines) console.log(line);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
