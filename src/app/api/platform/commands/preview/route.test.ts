import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { POST } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAppCheck: { verifyToken: vi.fn() },
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: { collection: vi.fn(), runTransaction: vi.fn() },
}));

function request(body: Record<string, unknown>, token = 'token') {
  return new Request('https://goalplace256.test/api/platform/commands/preview', {
    method: 'POST',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function installFirestore(capabilities: string[]) {
  const store: Record<string, Record<string, unknown>> = {
    'users/admin_1': {
      role: 'platform_admin',
      accountClass: 'platform_operator',
      accountStatus: 'active',
    },
    'accessIndex/platform_global_admin_1': { capabilities },
    'leagues/league_1': {
      name: 'Kampala Community League',
      lifecycleStatus: 'active',
      updatedAt: '2026-08-27T12:00:00.000Z',
    },
  };

  vi.mocked(adminDb.collection).mockImplementation((name: string) => ({
    doc: (id: string) => ({
      get: vi.fn(async () => ({
        id,
        exists: Boolean(store[`${name}/${id}`]),
        data: () => store[`${name}/${id}`],
      })),
    }),
  }) as never);
  vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (transaction: unknown) => unknown) => callback({
    get: vi.fn(async () => ({ data: () => undefined })),
    set: vi.fn(),
  }) as never);
}

describe('platform command preview route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a server-computed preview only to an operator holding the command capability', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'admin_1',
      role: 'platform_admin',
      accountClass: 'platform_operator',
    } as never);
    installFirestore(['platform.network.manage']);

    const response = await POST(request({
      commandId: 'network.league.suspend',
      targetId: 'league_1',
      inputs: { id: 'league_1' },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.preview).toMatchObject({
      commandId: 'network.league.suspend',
      targetId: 'league_1',
      targetLabel: 'Kampala Community League',
      tier: 'consequential',
      available: true,
    });
    expect(body.preview.stateFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('refuses a command preview when the operator lacks its exact capability', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'admin_1',
      role: 'platform_admin',
      accountClass: 'platform_operator',
    } as never);
    installFirestore(['platform.audit.read']);

    const response = await POST(request({
      commandId: 'network.league.suspend',
      targetId: 'league_1',
      inputs: { id: 'league_1' },
    }));

    expect(response.status).toBe(403);
    expect(vi.mocked(adminDb.collection).mock.calls.some(([name]) => name === 'leagues')).toBe(false);
  });
});
