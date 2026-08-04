import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { GET } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: { collection: vi.fn() },
}));

function request(token = 'token') {
  return new Request('https://goalplace256.test/api/platform/system-health', {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

function install(accountClass = 'platform_operator') {
  vi.mocked(adminDb.collection).mockImplementation((name: string) => {
    const api = {
      where: vi.fn(() => api),
      limit: vi.fn(() => api),
      count: vi.fn(() => ({ get: vi.fn(async () => ({ data: () => ({ count: 3 }) })) })),
      get: vi.fn(async () => ({ size: 3, docs: [] })),
      doc: () => ({
        get: vi.fn(async () => ({
          exists: name === 'users',
          data: () => ({ role: 'platform_admin', accountClass, accountStatus: 'active' }),
        })),
      }),
    };
    return api as never;
  });
}

describe('system health read model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin_1', role: 'platform_admin' } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('requires a dedicated Platform Operator account', async () => {
    install('fan');

    expect((await GET(request())).status).toBe(403);
  });

  it('reports App Check as required when the server enforces it', async () => {
    install();
    vi.stubEnv('GOALPLACE_REQUIRE_APP_CHECK', 'true');

    const body = await (await GET(request())).json();

    // The client component read this server-only variable directly, so it was always
    // undefined in the browser and always displayed "optional" — failing toward
    // "looks fine" in exactly the environments that enforce it.
    expect(body.safeguards.appCheckRequired).toBe(true);
  });

  it('reports App Check as not required when the server does not enforce it', async () => {
    install();
    vi.stubEnv('GOALPLACE_REQUIRE_APP_CHECK', 'false');

    const body = await (await GET(request())).json();

    expect(body.safeguards.appCheckRequired).toBe(false);
  });

  it.each([
    ['compare', false],
    ['legacy', false],
    ['assignments', true],
  ])('reports access mode %s as canonical=%s', async (mode, canonical) => {
    install();
    vi.stubEnv('GOALPLACE_ACCESS_ENGINE_MODE', mode);

    const body = await (await GET(request())).json();

    // compare and legacy both answer from the legacy projection; only assignments means
    // canonical authority is actually governing.
    expect(body.safeguards.accessEngineMode).toBe(mode);
    expect(body.safeguards.accessAuthorityIsCanonical).toBe(canonical);
  });

  it('surfaces the backlogs an operator has to act on', async () => {
    install();

    const body = await (await GET(request())).json();

    expect(body.backlogs).toMatchObject({
      failedFinalizations: 3,
      pendingMediaModeration: 3,
      accessAuthorityDivergences: 3,
    });
  });

  it('asserts nothing that was not measured', async () => {
    install();

    const body = await (await GET(request())).json();

    // The old panel displayed a hardcoded "No secrets exposed" badge. Nothing here
    // claims a control that was not checked.
    expect(JSON.stringify(body)).not.toContain('No secrets exposed');
  });
});
