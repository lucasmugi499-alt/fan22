import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

const ORIGINAL_ENV = { ...process.env };

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://origin.goalplace256.test${path}`, { headers });
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('GoalPlace256 proxy', () => {
  it('denies direct origin access when gateway protection is enabled', async () => {
    process.env.GOALPLACE_REQUIRE_GATEWAY_SECRET = 'true';
    process.env.GOALPLACE_EDGE_ORIGIN_SECRET = 'edge-secret';

    const response = proxy(request('/leagues'));

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe('Access denied.');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('allows gateway and staff-preview secrets through origin protection', () => {
    process.env.GOALPLACE_REQUIRE_GATEWAY_SECRET = 'true';
    process.env.GOALPLACE_EDGE_ORIGIN_SECRET = 'edge-secret';
    process.env.GOALPLACE_STAFF_PREVIEW_SECRET = 'staff-secret';

    expect(proxy(request('/leagues', { 'x-goalplace-origin-secret': 'edge-secret' })).status).toBe(200);
    expect(proxy(request('/leagues', { 'x-goalplace-staff-preview-secret': 'staff-secret' })).status).toBe(200);
  });

  it('serves maintenance responses without exposing application data', async () => {
    process.env.GOALPLACE_ENVIRONMENT = 'maintenance';

    const page = proxy(request('/leagues'));
    const api = proxy(request('/api/access'));
    const asset = proxy(request('/_next/static/chunk.js'));

    expect(page.status).toBe(200);
    expect(page.headers.get('x-middleware-rewrite')).toBe('https://origin.goalplace256.test/maintenance');
    expect(api.status).toBe(503);
    await expect(api.json()).resolves.toEqual({ error: 'GoalPlace256 is temporarily in maintenance.' });
    expect(api.headers.get('cache-control')).toBe('no-store');
    expect(asset.status).toBe(200);
    expect(asset.headers.get('x-middleware-rewrite')).toBeNull();
  });
});
