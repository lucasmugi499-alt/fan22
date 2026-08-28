import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { GET } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: { collection: vi.fn() },
}));

function request(token = 'token', query = '') {
  return new Request(`https://goalplace256.test/api/platform/palette?q=${encodeURIComponent(query)}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

function installFirestore(capabilities: string[]) {
  const store: Record<string, Record<string, unknown>> = {
    'users/admin_1': { role: 'platform_admin', accountClass: 'platform_operator', accountStatus: 'active' },
    'accessIndex/platform_global_admin_1': { capabilities },
  };
  vi.mocked(adminDb.collection).mockImplementation((name: string) => ({
    doc: (id: string) => ({
      get: vi.fn(async () => ({
        exists: Boolean(store[`${name}/${id}`]),
        data: () => store[`${name}/${id}`],
      })),
    }),
    where: vi.fn(() => ({
      limit: vi.fn(() => ({ get: vi.fn(async () => ({ docs: [] })) })),
    })),
  }) as never);
}

describe('authenticated Platform palette', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not read the private index for an unauthenticated caller', async () => {
    const response = await GET(request(''));

    expect(response.status).toBe(401);
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('returns five destinations and only commands backed by held capabilities', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin_1', role: 'platform_admin' } as never);
    installFirestore(['platform.audit.read', 'platform.network.manage']);

    const body = await (await GET(request())).json();
    const destinations = body.results.filter((item: { kind: string }) => item.kind === 'destination');
    const commands = body.results.filter((item: { kind: string }) => item.kind === 'command');

    expect(destinations.map((item: { title: string }) => item.title)).toEqual(['Desk', 'Network', 'Integrity', 'Money', 'Platform']);
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every((item: { commandId: string }) => item.commandId.startsWith('network.'))).toBe(true);
  });
});
