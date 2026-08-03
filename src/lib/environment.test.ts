import { describe, expect, it } from 'vitest';
import {
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
