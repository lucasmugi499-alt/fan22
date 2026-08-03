import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeProductionEnvironment } from '../../src/lib/environment';

const ROOT = process.cwd();

type SwitchableEnvironment = 'demo' | 'beta' | 'production';

type EnvironmentRegistry = {
  environments: Record<SwitchableEnvironment, {
    firebaseProjectId: string;
    appHostingConfig: string;
    expectedDataOrigin: string;
    requiresDemoLogin: boolean;
    requiresInvestorTools: boolean;
    paymentsMode: string;
    directOriginPolicy: string;
  }>;
};

function appHostingValues(text: string) {
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

function expectValue(values: Map<string, string>, name: string, expected: string, problems: string[]) {
  const actual = values.get(name);
  if (actual !== expected) problems.push(`${name} expected ${expected}, got ${actual ?? 'missing'}`);
}

function assertNoPlaceholder(value: string | undefined, label: string, problems: string[]) {
  if (!value || value.startsWith('REPLACE_WITH_')) problems.push(`${label} is not configured`);
}

function assertSecretReference(
  values: Map<string, string>,
  secrets: Map<string, string>,
  variable: string,
  expectedSecret: string,
  problems: string[],
) {
  if (values.has(variable)) {
    problems.push(`${variable} must use a Secret Manager reference, not a plaintext value`);
    return;
  }
  const actual = secrets.get(variable);
  if (actual !== expectedSecret) {
    problems.push(`${variable} expected secret ${expectedSecret}, got ${actual ?? 'missing'}`);
  }
}

function readActiveEnvironment(root: string) {
  const activeFile = path.join(root, 'config/active-environment.json');
  if (!existsSync(activeFile)) return null;
  return JSON.parse(readFileSync(activeFile, 'utf8')) as {
    activeEnvironment?: string;
  };
}

function readRegistry(root: string) {
  const registryFile = path.join(root, 'config/environments.json');
  if (!existsSync(registryFile)) throw new Error('config/environments.json is missing.');
  return JSON.parse(readFileSync(registryFile, 'utf8')) as EnvironmentRegistry;
}

export function assertCleanProductionConfiguration(root = ROOT) {
  const registry = readRegistry(root);
  const production = registry.environments.production;
  const demo = registry.environments.demo;
  const beta = registry.environments.beta;
  const problems: string[] = [];

  if (!production) problems.push('production environment registry entry is missing');
  if (!demo) problems.push('demo environment registry entry is missing');
  if (!beta) problems.push('beta environment registry entry is missing');
  if (problems.length) throw new Error(`Production environment registry is incomplete: ${problems.join('; ')}.`);

  assertNoPlaceholder(production.firebaseProjectId, 'production Firebase project', problems);
  if (production.firebaseProjectId === demo.firebaseProjectId) {
    problems.push('production Firebase project matches the demo project');
  }
  if (
    beta.firebaseProjectId &&
    !beta.firebaseProjectId.startsWith('REPLACE_WITH_') &&
    production.firebaseProjectId === beta.firebaseProjectId
  ) {
    problems.push('production Firebase project matches the beta project');
  }
  if (production.expectedDataOrigin !== 'production') problems.push('production registry data origin must be production');
  if (production.requiresDemoLogin) problems.push('production registry requires demo login');
  if (production.requiresInvestorTools) problems.push('production registry enables investor tools');
  if (production.paymentsMode !== 'disabled') problems.push('production registry payments mode must remain disabled');
  if (production.directOriginPolicy !== 'gateway-only') problems.push('production direct origin policy must be gateway-only');

  const productionConfigPath = path.join(root, production.appHostingConfig);
  if (!existsSync(productionConfigPath)) problems.push(`${production.appHostingConfig} is missing`);
  if (problems.length) throw new Error(`Production clean-start assertion failed: ${problems.join('; ')}.`);

  const productionConfig = readFileSync(productionConfigPath, 'utf8');
  if (productionConfig.includes('REPLACE_WITH_')) {
    throw new Error('Production App Hosting config still contains REPLACE_WITH_* placeholders.');
  }

  const { values, secrets } = appHostingValues(productionConfig);
  expectValue(values, 'GOALPLACE_ENVIRONMENT', 'production', problems);
  expectValue(values, 'NEXT_PUBLIC_GOALPLACE_ENVIRONMENT', 'production', problems);
  expectValue(values, 'GOALPLACE_DATA_ORIGIN', 'production', problems);
  expectValue(values, 'NEXT_PUBLIC_DATA_MODE', 'firebase', problems);
  expectValue(values, 'GOALPLACE_ALLOW_DEMO_LOGIN', 'false', problems);
  expectValue(values, 'NEXT_PUBLIC_ENABLE_DEMO_LOGIN', 'false', problems);
  expectValue(values, 'GOALPLACE_ALLOW_SEEDING', 'false', problems);
  expectValue(values, 'GOALPLACE_ALLOW_REAL_PAYMENTS', 'false', problems);
  expectValue(values, 'GOALPLACE_ENABLE_INVESTOR_TOOLS', 'false', problems);
  expectValue(values, 'NEXT_PUBLIC_GOALPLACE_ENABLE_INVESTOR_TOOLS', 'false', problems);
  expectValue(values, 'GOALPLACE_REQUIRE_APP_CHECK', 'true', problems);
  expectValue(values, 'GOALPLACE_SCHEDULER_AUTH_MODE', 'oidc', problems);
  // Production must authorize from canonical assignments. Both 'legacy' and 'compare'
  // return the legacy projection, and an unset value falls through to 'compare'.
  expectValue(values, 'GOALPLACE_ACCESS_ENGINE_MODE', 'assignments', problems);
  assertNoPlaceholder(values.get('GOALPLACE_APP_BASE_URL'), 'production public application URL', problems);
  assertNoPlaceholder(values.get('GOALPLACE_EMAIL_FROM'), 'production email sender', problems);
  assertSecretReference(values, secrets, 'RESEND_API_KEY', 'resendApiKey', problems);

  const environmentVersion = values.get('NEXT_PUBLIC_GOALPLACE_ENVIRONMENT_VERSION');
  if (!environmentVersion || environmentVersion === 'env-production-unset') {
    problems.push('production environment version must be explicitly set for the activation');
  }

  const webProjectId = values.get('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  const adminProjectId = values.get('GOALPLACE_ADMIN_PROJECT_ID');
  assertNoPlaceholder(webProjectId, 'production web Firebase project', problems);
  assertNoPlaceholder(adminProjectId, 'production admin Firebase project', problems);
  expectValue(values, 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', production.firebaseProjectId, problems);
  expectValue(values, 'GOALPLACE_ADMIN_PROJECT_ID', production.firebaseProjectId, problems);

  const storageBucket = values.get('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');
  assertNoPlaceholder(storageBucket, 'production Storage bucket', problems);
  if (storageBucket?.includes(demo.firebaseProjectId)) problems.push('production Storage bucket references the demo project');
  if (
    beta.firebaseProjectId &&
    !beta.firebaseProjectId.startsWith('REPLACE_WITH_') &&
    storageBucket?.includes(beta.firebaseProjectId)
  ) {
    problems.push('production Storage bucket references the beta project');
  }

  for (const variable of [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID',
    'NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY',
    'GOALPLACE_SCHEDULER_AUDIENCE',
    'GOALPLACE_SCHEDULER_SERVICE_ACCOUNT_EMAILS',
  ]) {
    assertNoPlaceholder(values.get(variable), variable, problems);
  }

  if (problems.length) {
    throw new Error(`Production clean-start assertion failed:\n${problems.join('\n')}`);
  }
}

function readActiveEnvironmentForDefaultRoot() {
  return readActiveEnvironment(ROOT);
}

function main() {
  assertSafeProductionEnvironment({
    ...process.env,
    NODE_ENV: 'production',
    GOALPLACE_ENVIRONMENT: process.env.GOALPLACE_ENVIRONMENT ?? 'production',
    NEXT_PUBLIC_GOALPLACE_ENVIRONMENT: process.env.NEXT_PUBLIC_GOALPLACE_ENVIRONMENT ?? 'production',
    GOALPLACE_DATA_ORIGIN: process.env.GOALPLACE_DATA_ORIGIN ?? 'production',
    NEXT_PUBLIC_DATA_MODE: process.env.NEXT_PUBLIC_DATA_MODE ?? 'firebase',
  });

  assertCleanProductionConfiguration();

  const active = readActiveEnvironmentForDefaultRoot();
  if (active?.activeEnvironment && active.activeEnvironment !== 'production') {
    console.warn(`Gateway state is ${active.activeEnvironment}; this guard only validates production configuration.`);
  }

  console.log('Production clean-start assertion passed.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
