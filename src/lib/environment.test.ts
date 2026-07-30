import { describe, expect, it } from 'vitest';
import { assertSafeProductionEnvironment, goalPlaceEnvironment, publicEnvironment } from './environment';

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
      GOALPLACE_ADMIN_PROJECT_ID: 'studio-534174814-9df36',
    } as NodeJS.ProcessEnv)).toMatchObject({
      environment: 'demo',
      firebaseProjectId: 'studio-534174814-9df36',
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
});
