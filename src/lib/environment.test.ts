import { describe, expect, it } from 'vitest';
import {
  assertConfigMatchesProject,
  assertExplicitAccessEngineMode,
  assertSafeProductionEnvironment,
  goalPlaceEnvironment,
  publicEnvironment,
} from './environment';

const safeProduction = {
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
  GOALPLACE_ACCESS_ENGINE_MODE: 'assignments',
} as NodeJS.ProcessEnv;

describe('environment guard', () => {
  it('treats development as local unless explicitly configured', () => {
    expect(goalPlaceEnvironment({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe('local');
  });

  it('does not infer production from a local Next build alone', () => {
    expect(goalPlaceEnvironment({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe('local');
  });

  it('allows a clean production configuration', () => {
    expect(() => assertSafeProductionEnvironment(safeProduction)).not.toThrow();
  });

  /**
   * The sentinel is still supported, and is no longer the default.
   *
   * `apphosting.yaml` briefly declared `unconfigured` so an un-overlaid backend would fail to
   * build. That broke the demo backend, which is itself un-overlaid — see the project-match
   * block at the bottom of this file for what replaced it. The value remains recognised, so a
   * backend that genuinely wants to refuse rather than inherit can still declare it.
   */
  it('refuses to build an environment that named no overlay', () => {
    expect(() => assertSafeProductionEnvironment({
      NODE_ENV: 'production',
      GOALPLACE_ENVIRONMENT: 'unconfigured',
    } as NodeJS.ProcessEnv)).toThrow(/no environment overlay selected/);
  });

  it('names the overlays a backend can choose, so the error is actionable', () => {
    expect(() => assertSafeProductionEnvironment({
      GOALPLACE_ENVIRONMENT: 'unconfigured',
    } as NodeJS.ProcessEnv)).toThrow(/apphosting\.beta\.yaml/);
  });

  it('still treats an unset environment as local, so dev and the suites need no configuration', () => {
    // `unconfigured` has to be distinct from absent. If omission also tripped the gate,
    // `next dev` and every test run would need an environment variable to start.
    expect(goalPlaceEnvironment({} as NodeJS.ProcessEnv)).toBe('local');
    expect(() => assertSafeProductionEnvironment({} as NodeJS.ProcessEnv)).not.toThrow();
  });

  it('recognises the sentinel as its own environment rather than falling back to local', () => {
    expect(goalPlaceEnvironment({
      GOALPLACE_ENVIRONMENT: 'unconfigured',
    } as NodeJS.ProcessEnv)).toBe('unconfigured');
  });

  it('reports App Hosting runtime Firebase values when public build vars are unavailable', () => {
    expect(publicEnvironment({
      GOALPLACE_ENVIRONMENT: 'demo',
      GOALPLACE_ADMIN_PROJECT_ID: 'manifest-quasar-479416-s7',
    } as NodeJS.ProcessEnv)).toMatchObject({
      environment: 'demo',
      firebaseProjectId: 'manifest-quasar-479416-s7',
      dataMode: 'firebase',
    });
  });

  it.each([
    ['demo login', { NEXT_PUBLIC_ENABLE_DEMO_LOGIN: 'true' }],
    ['seeding', { GOALPLACE_ALLOW_SEEDING: 'true' }],
    ['investor tools', { GOALPLACE_ENABLE_INVESTOR_TOOLS: 'true' }],
    ['mock fallback', { NEXT_PUBLIC_DATA_MODE: 'mock' }],
    ['synthetic data', { GOALPLACE_DATA_ORIGIN: 'synthetic_demo' }],
    ['sandbox payments', { GOALPLACE_PAYMENTS_MODE: 'sandbox' }],
    ['beta banner', { NEXT_PUBLIC_GOALPLACE_ENVIRONMENT: 'beta' }],
  ])('rejects production with %s enabled', (_label, override) => {
    expect(() => assertSafeProductionEnvironment({ ...safeProduction, ...override })).toThrow(
      /Unsafe GoalPlace256 production configuration/,
    );
  });

  it.each([
    ['unset', undefined],
    ['legacy', 'legacy'],
    ['compare', 'compare'],
  ])('rejects production when the access engine mode is %s', (_label, mode) => {
    const env = { ...safeProduction } as NodeJS.ProcessEnv;
    if (mode) env.GOALPLACE_ACCESS_ENGINE_MODE = mode;
    else delete env.GOALPLACE_ACCESS_ENGINE_MODE;

    // legacy and compare both return the legacy projection, so production would run on
    // authority that canonical assignments do not govern.
    expect(() => assertSafeProductionEnvironment(env)).toThrow(/access engine mode/);
  });
});

describe('access engine mode configuration', () => {
  it('allows local to fall through without explicit configuration', () => {
    expect(() => assertExplicitAccessEngineMode({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it('requires demo to pin the mode rather than rely on the code default', () => {
    expect(() => assertExplicitAccessEngineMode({
      NODE_ENV: 'production',
      GOALPLACE_ENVIRONMENT: 'demo',
    } as NodeJS.ProcessEnv)).toThrow(/must set GOALPLACE_ACCESS_ENGINE_MODE explicitly/);
  });

  it('accepts compare for demo during the migration', () => {
    expect(() => assertExplicitAccessEngineMode({
      NODE_ENV: 'production',
      GOALPLACE_ENVIRONMENT: 'demo',
      GOALPLACE_ACCESS_ENGINE_MODE: 'compare',
    } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it.each(['beta', 'production'])('requires assignments in %s', (environment) => {
    expect(() => assertExplicitAccessEngineMode({
      NODE_ENV: 'production',
      GOALPLACE_ENVIRONMENT: environment,
      GOALPLACE_ACCESS_ENGINE_MODE: 'compare',
    } as NodeJS.ProcessEnv)).toThrow(/requires GOALPLACE_ACCESS_ENGINE_MODE=assignments/);
  });

  it('rejects an unrecognised mode', () => {
    expect(() => assertExplicitAccessEngineMode({
      NODE_ENV: 'production',
      GOALPLACE_ENVIRONMENT: 'demo',
      GOALPLACE_ACCESS_ENGINE_MODE: 'canonical',
    } as NodeJS.ProcessEnv)).toThrow(/not a supported access engine mode/);
  });
});

/**
 * The check that actually closes GP-08.
 *
 * The first attempt made the un-overlaid `apphosting.yaml` declare `unconfigured` and fail the
 * build. The demo rollout on 2026-08-29 disproved it in about four minutes: the live demo
 * backend is itself un-overlaid, so the sentinel failed the one backend legitimately relying
 * on the default. "Names no overlay" is not the same thing as "is misconfigured".
 *
 * What is dangerous is narrower: a build whose configuration names a DIFFERENT project than
 * the one it is running against. That is the beta-backend-inherits-demo case exactly, and it
 * is checkable without assuming anything about how the config was selected.
 */
describe('the configuration must belong to the project being built', () => {
  it('allows a build whose config names the project it is running against', () => {
    expect(() => assertConfigMatchesProject({
      GOALPLACE_ADMIN_PROJECT_ID: 'manifest-quasar-479416-s7',
      GCLOUD_PROJECT: 'manifest-quasar-479416-s7',
    } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it('refuses a beta backend that inherited the demo configuration', () => {
    // GP-08, verbatim: no mistake in the beta config, only a forgotten flag at
    // backend-creation time, so the backend reads apphosting.yaml and comes up as demo.
    expect(() => assertConfigMatchesProject({
      GOALPLACE_ADMIN_PROJECT_ID: 'manifest-quasar-479416-s7',
      GCLOUD_PROJECT: 'goalplace-beta',
    } as NodeJS.ProcessEnv)).toThrow(/running against project 'goalplace-beta'/);
  });

  it('names both projects, so the error says which way round the mistake is', () => {
    expect(() => assertConfigMatchesProject({
      GOALPLACE_ADMIN_PROJECT_ID: 'manifest-quasar-479416-s7',
      GCLOUD_PROJECT: 'goalplace-prod',
    } as NodeJS.ProcessEnv)).toThrow(/manifest-quasar-479416-s7/);
  });

  it('falls back to the public project id when the admin one is build-time absent', () => {
    // GOALPLACE_ADMIN_PROJECT_ID is declared RUNTIME-only in every overlay, so at BUILD time
    // the public variable is the one available. Without this fallback the check would be
    // inert during exactly the build it exists to guard.
    expect(() => assertConfigMatchesProject({
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'manifest-quasar-479416-s7',
      GCLOUD_PROJECT: 'goalplace-beta',
    } as NodeJS.ProcessEnv)).toThrow(/goalplace-beta/);
  });

  it('skips when there is no ambient project to compare against', () => {
    // next dev, a local next build, and CI have no GCLOUD_PROJECT. Failing closed on its
    // absence would break every build not running on Google infrastructure.
    expect(() => assertConfigMatchesProject({
      GOALPLACE_ADMIN_PROJECT_ID: 'manifest-quasar-479416-s7',
    } as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => assertConfigMatchesProject({} as NodeJS.ProcessEnv)).not.toThrow();
  });

  it('leaves an unfilled placeholder to the readiness gate', () => {
    // environment:prepare:beta owns REPLACE_WITH_ markers and reports them all together.
    // Throwing here would report one at a time, from a check about something else.
    expect(() => assertConfigMatchesProject({
      GOALPLACE_ADMIN_PROJECT_ID: 'REPLACE_WITH_BETA_PROJECT_ID',
      GCLOUD_PROJECT: 'goalplace-beta',
    } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it('runs as part of the build gate, not only on demand', () => {
    // assertSafeProductionEnvironment is what next.config.ts calls.
    expect(() => assertSafeProductionEnvironment({
      GOALPLACE_ENVIRONMENT: 'demo',
      GOALPLACE_ADMIN_PROJECT_ID: 'manifest-quasar-479416-s7',
      GCLOUD_PROJECT: 'goalplace-beta',
    } as NodeJS.ProcessEnv)).toThrow(/configuration in force names/);
  });
});
