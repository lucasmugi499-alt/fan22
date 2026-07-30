import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertCleanProductionConfiguration } from './assert-clean';

let tempRoots: string[] = [];

const baseValues = {
  GOALPLACE_ENVIRONMENT: 'production',
  NEXT_PUBLIC_GOALPLACE_ENVIRONMENT: 'production',
  NEXT_PUBLIC_GOALPLACE_ENVIRONMENT_VERSION: 'env-production-2026-07-30-verified',
  GOALPLACE_DATA_ORIGIN: 'production',
  GOALPLACE_ALLOW_DEMO_LOGIN: 'false',
  GOALPLACE_ALLOW_SEEDING: 'false',
  GOALPLACE_ALLOW_REAL_PAYMENTS: 'false',
  GOALPLACE_ENABLE_INVESTOR_TOOLS: 'false',
  GOALPLACE_REQUIRE_APP_CHECK: 'true',
  GOALPLACE_SCHEDULER_AUTH_MODE: 'oidc',
  GOALPLACE_SCHEDULER_AUDIENCE: 'https://goalplace256.com/api/fantasy/lock-lineups',
  GOALPLACE_SCHEDULER_SERVICE_ACCOUNT_EMAILS: 'scheduler@goalplace256-prod.iam.gserviceaccount.com',
  NEXT_PUBLIC_GOALPLACE_ENABLE_INVESTOR_TOOLS: 'false',
  NEXT_PUBLIC_DATA_MODE: 'firebase',
  NEXT_PUBLIC_ENABLE_DEMO_LOGIN: 'false',
  NEXT_PUBLIC_FIREBASE_API_KEY: 'prod-api-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'goalplace256-prod.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'goalplace256-prod',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'goalplace256-prod.firebasestorage.app',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123456789',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:123456789:web:goalplace256',
  NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: 'prod-app-check-key',
  NEXT_PUBLIC_FIREBASE_DATABASE_ID: 'fg256',
  GOALPLACE_ADMIN_PROJECT_ID: 'goalplace256-prod',
  GOALPLACE_FIRESTORE_DATABASE_ID: 'fg256',
};

function appHostingYaml(values: Record<string, string>) {
  return [
    'env:',
    ...Object.entries(values).flatMap(([name, value]) => [
      `  - variable: ${name}`,
      `    value: ${JSON.stringify(value)}`,
      '    availability: [BUILD, RUNTIME]',
    ]),
  ].join('\n');
}

function registry(overrides: Record<string, unknown> = {}) {
  return {
    publicDomain: 'goalplace256.com',
    activationStateFile: 'config/active-environment.json',
    environments: {
      demo: {
        label: 'Investor Demo',
        firebaseProjectId: 'goalplace256-demo',
        firestoreDatabaseId: 'fg256',
        appHostingConfig: 'apphosting.demo.yaml',
        expectedDataOrigin: 'synthetic_demo',
        requiresDemoLogin: true,
        requiresInvestorTools: true,
        paymentsMode: 'disabled',
        directOriginPolicy: 'gateway-or-staff-preview',
      },
      beta: {
        label: 'Beta',
        firebaseProjectId: 'goalplace256-beta',
        firestoreDatabaseId: 'fg256',
        appHostingConfig: 'apphosting.beta.yaml',
        expectedDataOrigin: 'beta_test',
        requiresDemoLogin: false,
        requiresInvestorTools: false,
        paymentsMode: 'sandbox',
        directOriginPolicy: 'gateway-or-staff-preview',
      },
      production: {
        label: 'Production',
        firebaseProjectId: 'goalplace256-prod',
        firestoreDatabaseId: 'fg256',
        appHostingConfig: 'apphosting.production.yaml',
        expectedDataOrigin: 'production',
        requiresDemoLogin: false,
        requiresInvestorTools: false,
        paymentsMode: 'disabled',
        directOriginPolicy: 'gateway-only',
        ...overrides,
      },
    },
  };
}

function fixture(input: {
  values?: Record<string, string>;
  productionRegistry?: Record<string, unknown>;
} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'goalplace-prod-clean-'));
  tempRoots.push(root);
  mkdirSync(path.join(root, 'config'));
  writeFileSync(
    path.join(root, 'config/environments.json'),
    `${JSON.stringify(registry(input.productionRegistry), null, 2)}\n`,
  );
  writeFileSync(
    path.join(root, 'apphosting.production.yaml'),
    `${appHostingYaml({ ...baseValues, ...input.values })}\n`,
  );
  return root;
}

afterEach(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
  tempRoots = [];
});

describe('production clean-start assertion', () => {
  it('accepts isolated production config with a real environment version', () => {
    expect(() => assertCleanProductionConfiguration(fixture())).not.toThrow();
  });

  it('rejects production App Hosting placeholders', () => {
    expect(() => assertCleanProductionConfiguration(fixture({
      values: { NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'REPLACE_WITH_CLEAN_PRODUCTION_PROJECT' },
    }))).toThrow(/REPLACE_WITH/);
  });

  it('rejects an unset production environment version', () => {
    expect(() => assertCleanProductionConfiguration(fixture({
      values: { NEXT_PUBLIC_GOALPLACE_ENVIRONMENT_VERSION: 'env-production-unset' },
    }))).toThrow(/environment version/);
  });

  it('rejects a production registry pointing at the demo project', () => {
    expect(() => assertCleanProductionConfiguration(fixture({
      productionRegistry: { firebaseProjectId: 'goalplace256-demo' },
      values: {
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'goalplace256-demo',
        GOALPLACE_ADMIN_PROJECT_ID: 'goalplace256-demo',
      },
    }))).toThrow(/matches the demo project/);
  });

  it('rejects production storage that references the beta project', () => {
    expect(() => assertCleanProductionConfiguration(fixture({
      values: { NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'goalplace256-beta.firebasestorage.app' },
    }))).toThrow(/references the beta project/);
  });

  it('rejects unsafe production registry controls', () => {
    expect(() => assertCleanProductionConfiguration(fixture({
      productionRegistry: {
        expectedDataOrigin: 'synthetic_demo',
        requiresInvestorTools: true,
        directOriginPolicy: 'gateway-or-staff-preview',
      },
    }))).toThrow(/data origin must be production/);
  });
});
