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

  /**
   * The case a denylist of `production` could not see.
   *
   * `apphosting.yaml` IS the demo overlay, and it sets NEXT_PUBLIC_ENABLE_DEMO_LOGIN true.
   * A beta backend created without naming `apphosting.beta.yaml` inherits that, and beta is
   * not production — so the old gate would have shipped a click-to-become-anyone switch to
   * real beta users.
   */
  it.each(['beta', 'maintenance'])('keeps demo login disabled in %s however the flags arrive', async (environment) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_GOALPLACE_ENVIRONMENT', environment);
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEMO_LOGIN', 'true');
    vi.stubEnv('GOALPLACE_ALLOW_DEMO_LOGIN', 'true');

    await expect(loadDemoMode()).resolves.toMatchObject({
      isDemoModeEnabled: false,
    });
  });

  it('refuses an environment name it does not recognise', async () => {
    // Fail closed: a typo in an overlay is not a licence to hand out demo sessions.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_GOALPLACE_ENVIRONMENT', 'beta-2');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEMO_LOGIN', 'true');

    await expect(loadDemoMode()).resolves.toMatchObject({
      isDemoModeEnabled: false,
    });
  });

  it('still works for local development with nothing configured', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    await expect(loadDemoMode()).resolves.toMatchObject({
      isDemoModeEnabled: true,
    });
  });
});
