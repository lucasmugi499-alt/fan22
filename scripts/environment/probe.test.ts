import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeOrigin } from './probe';

function respondWith(routes: Record<string, { status?: number; body: unknown } | null>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(routes).find((path) => url.endsWith(path));
    const route = key ? routes[key] : null;
    if (!route) throw new Error('network');
    return {
      ok: (route.status ?? 200) < 400,
      status: route.status ?? 200,
      json: async () => route.body,
    };
  }));
}

const HEALTHY = {
  '/api/environment': {
    body: {
      environment: 'demo',
      environmentVersion: 'v1',
      firebaseProjectId: 'demo-project',
      servedBy: 'fan22--demo.hosted.app',
      gatewayRequired: false,
    },
  },
  '/api/health': { body: { status: 'ok', checks: { firestore: 'ok' } } },
};

describe('origin probe', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports ok when the origin matches expectations and is healthy', async () => {
    respondWith(HEALTHY);

    const result = await probeOrigin('https://demo.example', {
      expectEnvironment: 'demo',
      expectProject: 'demo-project',
    });

    expect(result.status).toBe('ok');
    expect(result.problems).toEqual([]);
    expect(result.servedBy).toBe('fan22--demo.hosted.app');
  });

  it('fails when the origin serves a different environment than expected', async () => {
    respondWith(HEALTHY);

    const result = await probeOrigin('https://demo.example', { expectEnvironment: 'production' });

    // The failure this catches: a deploy or a gateway switch that reported success
    // while pointing at the wrong origin.
    expect(result.status).toBe('degraded');
    expect(result.problems[0]).toContain('Expected environment production');
  });

  it('fails when the origin serves a different Firebase project', async () => {
    respondWith(HEALTHY);

    const result = await probeOrigin('https://demo.example', { expectProject: 'production-project' });

    expect(result.problems[0]).toContain('Expected project production-project');
  });

  it('fails when a dependency is unavailable even though the app responds', async () => {
    respondWith({
      ...HEALTHY,
      '/api/health': { status: 503, body: { status: 'degraded', checks: { firestore: 'unavailable' } } },
    });

    // An app that serves HTML while its database is unreachable is not healthy.
    const result = await probeOrigin('https://demo.example', {});

    expect(result.status).toBe('degraded');
    expect(result.checks).toMatchObject({ firestore: 'unavailable' });
  });

  it('reports an origin that predates the health endpoint as degraded, not ok', async () => {
    respondWith({ '/api/environment': HEALTHY['/api/environment'], '/api/health': null });

    const result = await probeOrigin('https://demo.example', {});

    // A deployed build older than the probe must not be reported as healthy just
    // because the endpoint it lacks returned nothing.
    expect(result.status).toBe('degraded');
  });

  it('reports unreachable when the origin does not answer at all', async () => {
    respondWith({});

    const result = await probeOrigin('https://demo.example', {});

    expect(result.reachable).toBe(false);
    expect(result.status).toBe('unreachable');
  });

  it('tolerates a trailing slash on the supplied url', async () => {
    respondWith(HEALTHY);

    const result = await probeOrigin('https://demo.example/', {});

    expect(result.url).toBe('https://demo.example');
  });
});
