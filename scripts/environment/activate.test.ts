import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  activateEnvironment,
  environmentStatus,
  rollbackEnvironment,
  runActivationCli,
  type ActivationState,
} from './activate';

let tempRoots: string[] = [];

const controls = {
  GOALPLACE_ACTIVATION_IDENTITY: 'ops@example.com',
  GOALPLACE_BACKUP_CONFIRMED: 'true',
  GOALPLACE_HEALTHCHECK_PASSED: 'true',
  GOALPLACE_CACHE_PURGED: 'true',
  GOALPLACE_POST_SWITCH_SMOKE_PASSED: 'true',
} as NodeJS.ProcessEnv;

function yaml(values: Record<string, string>) {
  return [
    'env:',
    ...Object.entries(values).flatMap(([name, value]) => [
      `  - variable: ${name}`,
      `    value: ${JSON.stringify(value)}`,
      '    availability: [BUILD, RUNTIME]',
    ]),
  ].join('\n');
}

function envValues(environment: 'demo' | 'beta' | 'production', overrides: Record<string, string> = {}) {
  const projectId = `goalplace256-${environment}`;
  const demo = environment === 'demo';
  return {
    GOALPLACE_ENVIRONMENT: environment,
    NEXT_PUBLIC_GOALPLACE_ENVIRONMENT: environment,
    NEXT_PUBLIC_GOALPLACE_ENVIRONMENT_VERSION: `env-${environment}-test`,
    GOALPLACE_DATA_ORIGIN: environment === 'demo' ? 'synthetic_demo' : environment === 'beta' ? 'beta_test' : 'production',
    GOALPLACE_ALLOW_DEMO_LOGIN: demo ? 'true' : 'false',
    GOALPLACE_ALLOW_REAL_PAYMENTS: 'false',
    GOALPLACE_ENABLE_INVESTOR_TOOLS: demo ? 'true' : 'false',
    NEXT_PUBLIC_GOALPLACE_ENABLE_INVESTOR_TOOLS: demo ? 'true' : 'false',
    NEXT_PUBLIC_DATA_MODE: 'firebase',
    NEXT_PUBLIC_ENABLE_DEMO_LOGIN: demo ? 'true' : 'false',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
    GOALPLACE_ADMIN_PROJECT_ID: projectId,
    NEXT_PUBLIC_FIREBASE_DATABASE_ID: 'fg256',
    GOALPLACE_FIRESTORE_DATABASE_ID: 'fg256',
    ...(environment === 'beta' ? { GOALPLACE_PAYMENTS_MODE: 'sandbox' } : {}),
    ...overrides,
  };
}

function activeState(overrides: Partial<ActivationState> = {}) {
  return {
    activeEnvironment: 'production',
    previousEnvironment: null,
    environmentVersion: 'env-production-old',
    publicUrl: 'https://goalplace256.com',
    maintenance: false,
    updatedAt: '2026-07-30T00:00:00.000Z',
    updatedBy: 'fixture',
    lastActivationReport: null,
    ...overrides,
  } satisfies ActivationState;
}

function fixture(input: {
  active?: Partial<ActivationState>;
  betaProject?: string;
  productionProject?: string;
  betaValues?: Record<string, string>;
  productionValues?: Record<string, string>;
} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'goalplace-activate-'));
  tempRoots.push(root);
  mkdirSync(path.join(root, 'config'));

  const registry = {
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
        firebaseProjectId: input.betaProject ?? 'goalplace256-beta',
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
        firebaseProjectId: input.productionProject ?? 'goalplace256-production',
        firestoreDatabaseId: 'fg256',
        appHostingConfig: 'apphosting.production.yaml',
        expectedDataOrigin: 'production',
        requiresDemoLogin: false,
        requiresInvestorTools: false,
        paymentsMode: 'disabled',
        directOriginPolicy: 'gateway-only',
      },
    },
  };

  writeFileSync(path.join(root, 'config/environments.json'), `${JSON.stringify(registry, null, 2)}\n`);
  writeFileSync(path.join(root, 'config/active-environment.json'), `${JSON.stringify(activeState(input.active), null, 2)}\n`);
  writeFileSync(path.join(root, 'apphosting.demo.yaml'), `${yaml(envValues('demo'))}\n`);
  writeFileSync(path.join(root, 'apphosting.beta.yaml'), `${yaml(envValues('beta', {
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: registry.environments.beta.firebaseProjectId,
    GOALPLACE_ADMIN_PROJECT_ID: registry.environments.beta.firebaseProjectId,
    ...input.betaValues,
  }))}\n`);
  writeFileSync(path.join(root, 'apphosting.production.yaml'), `${yaml(envValues('production', {
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: registry.environments.production.firebaseProjectId,
    GOALPLACE_ADMIN_PROJECT_ID: registry.environments.production.firebaseProjectId,
    ...input.productionValues,
  }))}\n`);
  return root;
}

afterEach(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
  tempRoots = [];
});

describe('environment activation command', () => {
  it('reports current status without requiring protected control inputs', () => {
    const result = environmentStatus({ root: fixture() });

    expect(result.lines.join('\n')).toContain('Active environment : production');
    expect(result.lines.join('\n')).toContain('Environment version: env-production-old');
  });

  it('refuses activation without backup, healthcheck, cache purge, smoke test, and identity confirmations', () => {
    expect(() => activateEnvironment('demo', 'activate', {
      root: fixture(),
      env: {},
    })).toThrow(/Missing protected control input/);
  });

  it('activates demo through routing state only and writes an audit report', () => {
    const root = fixture();
    const result = activateEnvironment('demo', 'activate', {
      root,
      env: controls,
      now: () => new Date('2026-07-30T12:00:00.000Z'),
    });

    expect(result.state.activeEnvironment).toBe('demo');
    expect(result.state.previousEnvironment).toBe('production');
    expect(result.state.environmentVersion).toBe('env-demo-2026-07-30T12-00-00-000Z');
    expect(result.reportPath).toMatch(/^reports\/environment\/environment-activate-demo-/);
    expect(existsSync(path.join(root, result.reportPath ?? 'missing'))).toBe(true);

    const report = JSON.parse(readFileSync(path.join(root, result.reportPath ?? ''), 'utf8')) as {
      databaseMutation: string;
      backupConfirmed: boolean;
      healthcheckPassed: boolean;
      cachePurgeConfirmed: boolean;
      postSwitchSmokePassed: boolean;
    };
    expect(report).toMatchObject({
      databaseMutation: 'none',
      backupConfirmed: true,
      healthcheckPassed: true,
      cachePurgeConfirmed: true,
      postSwitchSmokePassed: true,
    });
  });

  it('refuses beta activation while beta App Hosting placeholders remain', () => {
    expect(() => activateEnvironment('beta', 'activate', {
      root: fixture({
        betaProject: 'goalplace256-beta',
        betaValues: { NEXT_PUBLIC_FIREBASE_API_KEY: 'REPLACE_WITH_BETA_WEB_API_KEY' },
      }),
      env: controls,
    })).toThrow(/REPLACE_WITH/);
  });

  it('requires the exact production confirmation phrase', () => {
    expect(() => activateEnvironment('production', 'activate', {
      root: fixture(),
      env: controls,
    })).toThrow(/GOALPLACE_PRODUCTION_CONFIRM/);

    expect(() => activateEnvironment('production', 'activate', {
      root: fixture(),
      env: {
        ...controls,
        GOALPLACE_PRODUCTION_CONFIRM: 'ACTIVATE GOALPLACE256 PRODUCTION',
      },
    })).not.toThrow();
  });

  it('rolls back to the recorded previous environment without mutating environment databases', () => {
    const root = fixture({
      active: {
        activeEnvironment: 'beta',
        previousEnvironment: 'demo',
        environmentVersion: 'env-beta-old',
      },
    });
    const result = rollbackEnvironment({
      root,
      env: controls,
      now: () => new Date('2026-07-30T12:10:00.000Z'),
    });

    expect(result.state.activeEnvironment).toBe('demo');
    expect(result.state.previousEnvironment).toBe('beta');
    const report = JSON.parse(readFileSync(path.join(root, result.reportPath ?? ''), 'utf8')) as {
      action: string;
      databaseMutation: string;
    };
    expect(report.action).toBe('rollback');
    expect(report.databaseMutation).toBe('none');
  });

  it('keeps the CLI parser compatible with npm script arguments', () => {
    const result = runActivationCli(['--action=maintenance'], {
      root: fixture(),
      env: controls,
      now: () => new Date('2026-07-30T12:20:00.000Z'),
    });

    expect(result.state.activeEnvironment).toBe('maintenance');
    expect(result.state.maintenance).toBe(true);
  });
});
