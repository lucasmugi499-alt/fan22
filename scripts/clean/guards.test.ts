import { describe, expect, it } from 'vitest';
import {
  CONFIRM_PHRASES,
  GuardError,
  STAGING_PLACEHOLDER,
  buildProjectMap,
  parseArgs,
  validate,
} from './guards';

/**
 * These tests are the safety net for a destructive script that runs in an environment whose
 * ambient credentials point at production. Each case corresponds to a specific way someone
 * could delete the wrong data.
 */

const PROD = 'manifest-quasar-479416-s7';
const STAGING = 'goalplace256-staging';

const projectMap = buildProjectMap({ prod: PROD, staging: STAGING });

function baseArgs(overrides: Record<string, unknown> = {}) {
  return { project: STAGING, database: 'fg256', env: 'staging', ...overrides };
}

describe('parseArgs', () => {
  it('reads --flag value pairs', () => {
    expect(parseArgs(['--project', 'p1', '--database', 'fg256'])).toMatchObject({
      project: 'p1',
      database: 'fg256',
    });
  });

  it('reads --flag=value pairs', () => {
    expect(parseArgs(['--project=p1', '--env=staging'])).toMatchObject({
      project: 'p1',
      env: 'staging',
    });
  });

  it('reads a comma-separated preserve list', () => {
    expect(parseArgs(['--preserve', 'uid1,uid2 , uid3']).preserve).toEqual(['uid1', 'uid2', 'uid3']);
  });

  it('treats a bare --dry-run as true', () => {
    expect(parseArgs(['--dry-run']).dryRun).toBe(true);
  });
});

describe('buildProjectMap', () => {
  it('maps prod and staging aliases to environments', () => {
    expect(projectMap).toEqual({ [PROD]: 'production', [STAGING]: 'staging' });
  });

  it('ignores the unconfigured staging placeholder so it cannot be targeted', () => {
    const map = buildProjectMap({ prod: PROD, staging: STAGING_PLACEHOLDER });
    expect(map[STAGING_PLACEHOLDER]).toBeUndefined();
    expect(Object.keys(map)).toEqual([PROD]);
  });
});

describe('validate refuses unsafe invocations', () => {
  it('refuses a missing --project', () => {
    expect(() => validate({ database: 'fg256', env: 'staging' }, projectMap, { requireConfirm: false }))
      .toThrow(/--project is required/);
  });

  it('refuses a missing --database', () => {
    expect(() => validate({ project: STAGING, env: 'staging' }, projectMap, { requireConfirm: false }))
      .toThrow(/--database is required/);
  });

  it('refuses a missing --env', () => {
    expect(() => validate({ project: STAGING, database: 'fg256' }, projectMap, { requireConfirm: false }))
      .toThrow(/--env is required/);
  });

  it('refuses an unknown project even when every other flag is valid', () => {
    expect(() =>
      validate(baseArgs({ project: 'some-typo-project' }), projectMap, { requireConfirm: false })
    ).toThrow(/not a known alias/);
  });

  it('refuses when --env disagrees with the alias map', () => {
    // The critical case: pointing a "staging" command at the production project.
    expect(() =>
      validate(baseArgs({ project: PROD, env: 'staging' }), projectMap, { requireConfirm: false })
    ).toThrow(/maps ".*" to production, but --env says staging/);
  });

  it('refuses when loaded credentials belong to a different project', () => {
    expect(() =>
      validate(baseArgs(), projectMap, { requireConfirm: false, credentialProjectId: PROD })
    ).toThrow(/Credential mismatch/);
  });
});

describe('validate enforces confirmation phrases', () => {
  it('refuses execution without a confirmation phrase', () => {
    expect(() => validate(baseArgs(), projectMap, { requireConfirm: true })).toThrow(
      /RESET-GOALPLACE-STAGING/
    );
  });

  it('refuses the production phrase used against staging', () => {
    expect(() =>
      validate(baseArgs({ confirm: CONFIRM_PHRASES.production }), projectMap, { requireConfirm: true })
    ).toThrow(GuardError);
  });

  it('refuses the staging phrase used against production', () => {
    expect(() =>
      validate(
        { project: PROD, database: 'fg256', env: 'production', confirm: CONFIRM_PHRASES.staging },
        projectMap,
        { requireConfirm: true }
      )
    ).toThrow(GuardError);
  });

  it('accepts staging with its own phrase', () => {
    const plan = validate(baseArgs({ confirm: CONFIRM_PHRASES.staging }), projectMap, {
      requireConfirm: true,
    });
    expect(plan).toMatchObject({ projectId: STAGING, databaseId: 'fg256', environment: 'staging' });
  });

  it('accepts production only with the production phrase', () => {
    const plan = validate(
      { project: PROD, database: 'fg256', env: 'production', confirm: CONFIRM_PHRASES.production },
      projectMap,
      { requireConfirm: true }
    );
    expect(plan.environment).toBe('production');
  });

  it('uses distinct phrases per environment', () => {
    expect(CONFIRM_PHRASES.production).not.toBe(CONFIRM_PHRASES.staging);
  });
});

describe('preview mode', () => {
  it('needs no confirmation phrase because it performs no writes', () => {
    const plan = validate(baseArgs(), projectMap, { requireConfirm: false });
    expect(plan.environment).toBe('staging');
  });

  it('carries the preserve list through to the plan', () => {
    const plan = validate(baseArgs({ preserve: ['owner-uid'] }), projectMap, { requireConfirm: false });
    expect(plan.preserveUids).toEqual(['owner-uid']);
  });
});

/**
 * `demo` became a first-class environment and this check did not follow.
 *
 * It was added to `Environment`, to `CONFIRM_PHRASES` and to `buildProjectMap`, but `validate`
 * still hardcoded `staging` or `production` — so the demo project could be MAPPED and never
 * NAMED. `npm run backup:firestore` against demo was refused outright, which is how a
 * three-week-old backup happens: the safe operation was the one that did not work.
 */
describe('every environment with a confirmation phrase is nameable', () => {
  const demoMap = { 'manifest-quasar-479416-s7': 'demo' as const };

  it('accepts --env demo', () => {
    expect(
      validate(
        { project: 'manifest-quasar-479416-s7', database: 'fg256', env: 'demo' },
        demoMap,
        { requireConfirm: false },
      ).environment,
    ).toBe('demo');
  });

  it('still refuses an environment that has no confirmation phrase', () => {
    // The derivation is the guard: an environment cannot be accepted here without a phrase,
    // and a destructive command against one with no phrase is what the phrases prevent.
    expect(() =>
      validate(
        { project: 'manifest-quasar-479416-s7', database: 'fg256', env: 'sandbox' },
        demoMap,
        { requireConfirm: false },
      ),
    ).toThrow(/--env must be one of/);
  });

  it('requires the demo confirmation phrase for a destructive run', () => {
    expect(() =>
      validate(
        { project: 'manifest-quasar-479416-s7', database: 'fg256', env: 'demo' },
        demoMap,
        { requireConfirm: true },
      ),
    ).toThrow(/RESET-GOALPLACE-DEMO/);
  });

  it('still refuses --env demo pointed at a project the alias map calls production', () => {
    expect(() =>
      validate(
        { project: 'other-project', database: 'fg256', env: 'demo' },
        { 'other-project': 'production' as const },
        { requireConfirm: false },
      ),
    ).toThrow(/maps "other-project" to production, but --env says demo/);
  });
});
