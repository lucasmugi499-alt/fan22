import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadDemoMode() {
  vi.resetModules();
  return import('./demoMode');
}

describe('demo mode flag', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('enables demo login from the public browser build flag', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_GOALPLACE_ENVIRONMENT', 'demo');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEMO_LOGIN', 'true');

    await expect(loadDemoMode()).resolves.toMatchObject({
      isDemoModeEnabled: true,
    });
  });

  it('keeps demo login disabled in production even when the public flag is set', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_GOALPLACE_ENVIRONMENT', 'production');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEMO_LOGIN', 'true');

    await expect(loadDemoMode()).resolves.toMatchObject({
      isDemoModeEnabled: false,
    });
  });
});
