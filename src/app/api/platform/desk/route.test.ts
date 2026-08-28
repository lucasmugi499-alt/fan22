import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { GET } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: { collection: vi.fn() },
}));

type Row = { id: string; data: Record<string, unknown> };

function request(token = 'token', suffix = '') {
  return new Request(`https://goalplace256.test/api/platform/desk?limit=1${suffix}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

function installFirestore(collections: Record<string, Row[]>) {
  vi.mocked(adminDb.collection).mockImplementation((name: string) => {
    const rows = collections[name] ?? [];
    const query = {
      where: vi.fn(() => query),
      get: vi.fn(async () => ({ docs: rows.map((row) => ({ id: row.id, data: () => row.data })) })),
      doc: (id: string) => ({
        get: vi.fn(async () => {
          const row = rows.find((item) => item.id === id);
          return { exists: Boolean(row), data: () => row?.data };
        }),
      }),
    };
    return query as never;
  });
}

describe('Platform Desk route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated access before reading a case source', async () => {
    const response = await GET(request(''));

    expect(response.status).toBe(401);
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('paginates the consequence-ordered unified case queue', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin_1', role: 'platform_admin' } as never);
    installFirestore({
      users: [{ id: 'admin_1', data: { role: 'platform_admin', accountClass: 'platform_operator', accountStatus: 'active' } }],
      accessIndex: [{ id: 'platform_global_admin_1', data: { capabilities: ['platform.audit.read'] } }],
      leagueAdminApplications: [{ id: 'application_1', data: { leagueName: 'Kampala Juniors', status: 'pending', submittedAt: '2026-08-01T00:00:00.000Z' } }],
      matchOperationalExceptions: [{ id: 'exception_1', data: { matchId: 'match_1', code: 'unreported_match', status: 'open', blocking: true, createdAt: '2026-08-26T00:00:00.000Z' } }],
    });

    const firstResponse = await GET(request());
    const first = await firstResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(first.items[0]).toMatchObject({ kind: 'operational_exception', consequence: 'critical' });
    expect(first.nextCursor).toBeTruthy();

    const second = await (await GET(request('token', `&cursor=${encodeURIComponent(first.nextCursor)}`))).json();
    expect(second.items[0]).toMatchObject({ kind: 'application' });
  });
});
