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
    '  - variable: RESEND_API_KEY',
    '    secret: resendApiKey',
    '    availability: [RUNTIME]',
    // A valid fixture declares both halves of the scheduler credential. The environment these
    // stand in for is a WORKING one, so an omission here would be a fixture that quietly
    // disagrees with what the assertions call correct.
    '  - variable: GOALPLACE_FANTASY_SCORING_SECRET',
    '    secret: goalplaceFantasyScoringSecret',
    '    availability: [RUNTIME]',
    '  - variable: GOALPLACE_RECONCILIATION_SECRET',
    '    secret: GOALPLACE_RECONCILIATION_SECRET',
    '    availability: [RUNTIME]',
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
    GOALPLACE_APP_BASE_URL: `https://${demo ? 'demo' : environment}.goalplace256.com`,
    GOALPLACE_EMAIL_FROM: 'GoalPlace256 <team@goalplace256.com>',
    GOALPLACE_ACCESS_ENGINE_MODE: demo ? 'compare' : 'assignments',
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

  it.each(['compare', 'legacy'])(
    'refuses production preparation when the access engine mode is %s',
    (mode) => {
      const root = fixture();
      writeFileSync(path.join(root, 'apphosting.production.yaml'), `${yaml(envValues('production', {
        GOALPLACE_ACCESS_ENGINE_MODE: mode,
      }))}\n`);

      // Both modes return the legacy projection, so production would authorize from
      // arrays that canonical assignments no longer govern.
      expect(() => activateEnvironment('production', 'activate', {
        root,
        env: { ...controls, GOALPLACE_PRODUCTION_CONFIRM: 'ACTIVATE GOALPLACE256 PRODUCTION' },
      })).toThrow(/access engine mode/);
    },
  );

  /**
   * Enforcement and its site key are one setting in two halves. The server rejects any mutation
   * without an App Check token; the CLIENT only mints one when the site key is present, because
   * `client.ts` initializes App Check inside that condition. Enforce without the key and every
   * mutation answers 401, for everyone, with the environment otherwise looking correct.
   *
   * Beta is the first environment to enforce it, so this is where that mistake first becomes
   * possible and it would land on pilot users.
   */
  it('refuses App Check enforcement with no site key behind it', () => {
    const root = fixture();
    writeFileSync(path.join(root, 'apphosting.beta.yaml'), `${yaml(envValues('beta', {
      GOALPLACE_REQUIRE_APP_CHECK: 'true',
      NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: '',
    }))}\n`);

    expect(() => activateEnvironment('beta', 'activate', { root, env: controls }))
      .toThrow(/APP_CHECK_SITE_KEY/);
  });

  it('refuses App Check enforcement whose site key is still a placeholder', () => {
    const root = fixture();
    writeFileSync(path.join(root, 'apphosting.beta.yaml'), `${yaml(envValues('beta', {
      GOALPLACE_REQUIRE_APP_CHECK: 'true',
      NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: 'REPLACE_WITH_BETA_APP_CHECK_SITE_KEY',
    }))}\n`);

    // Refused by the file-wide placeholder gate before the pairing assertion is reached, which
    // is the stronger of the two guarantees. Asserted on the outcome rather than on which gate
    // caught it, because a test that pinned the message would break the day the order changed.
    expect(() => activateEnvironment('beta', 'activate', { root, env: controls })).toThrow();
  });

  it('allows App Check enforcement once a real site key is set', () => {
    const root = fixture();
    writeFileSync(path.join(root, 'apphosting.beta.yaml'), `${yaml(envValues('beta', {
      GOALPLACE_REQUIRE_APP_CHECK: 'true',
      NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: '6Lc_a_real_looking_site_key',
    }))}\n`);

    expect(() => activateEnvironment('beta', 'activate', { root, env: controls })).not.toThrow();
  });

  /**
   * `safeSecretEquals` returns false when the expected value is undefined, so a route whose
   * credential was never declared answers 401 forever and looks exactly like somebody probing
   * it with a wrong secret. `GOALPLACE_RECONCILIATION_SECRET` was in that state: declared on
   * the calling side in `functions/src/index.ts` and on no overlay, so `reconcilePaymentIntents`
   * answered 503 every ten minutes on demo and did no work.
   */
  it('refuses a shared-secret scheduler with no receiving credential', () => {
    const root = fixture();
    // `yaml()` adds both halves, so this fixture is written without the helper's secret block.
    writeFileSync(path.join(root, 'apphosting.demo.yaml'), [
      yaml(envValues('demo', { GOALPLACE_SCHEDULER_AUTH_MODE: 'shared_secret' }))
        .split('\n')
        .filter((line, index, lines) =>
          !line.includes('GOALPLACE_RECONCILIATION_SECRET')
          && !(lines[index - 1] ?? '').includes('GOALPLACE_RECONCILIATION_SECRET')
          && !(lines[index - 2] ?? '').includes('GOALPLACE_RECONCILIATION_SECRET'))
        .join('\n'),
      '',
    ].join('\n'));

    expect(() => activateEnvironment('demo', 'activate', { root, env: controls }))
      .toThrow(/GOALPLACE_RECONCILIATION_SECRET/);
  });

  it('refuses an OIDC scheduler whose allowlist was never filled', () => {
    const root = fixture();
    writeFileSync(path.join(root, 'apphosting.beta.yaml'), `${yaml(envValues('beta', {
      GOALPLACE_SCHEDULER_AUTH_MODE: 'oidc',
      // Empty rather than a placeholder: a placeholder is caught by the file-wide gate first,
      // and what this test is for is the case where somebody removed the marker to get past it.
      GOALPLACE_SCHEDULER_AUDIENCE: '',
      GOALPLACE_SCHEDULER_SERVICE_ACCOUNT_EMAILS: 'sa@example.test',
      NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: '6Lc_a_real_looking_site_key',
      GOALPLACE_REQUIRE_APP_CHECK: 'true',
    }))}\n`);

    // An empty allowlist makes verifySchedulerOidc reject everything, which is the same
    // permanent-401 shape as a missing secret.
    expect(() => activateEnvironment('beta', 'activate', { root, env: controls }))
      .toThrow(/SCHEDULER_AUDIENCE/);
  });

  it('refuses activation when transactional email is not backed by a Secret Manager key', () => {
    const root = fixture();
    writeFileSync(path.join(root, 'apphosting.demo.yaml'), `${yaml(envValues('demo', {
      RESEND_API_KEY: 're_plaintext_key',
    }))}\n`);

    expect(() => activateEnvironment('demo', 'activate', {
      root,
      env: controls,
    })).toThrow(/Secret Manager/);
  });

  it('refuses activation when email sender settings are missing', () => {
    const root = fixture();
    writeFileSync(path.join(root, 'apphosting.demo.yaml'), `${yaml(envValues('demo', {
      GOALPLACE_EMAIL_FROM: '',
    }))}\n`);

    expect(() => activateEnvironment('demo', 'activate', {
      root,
      env: controls,
    })).toThrow(/GOALPLACE_EMAIL_FROM/);
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
