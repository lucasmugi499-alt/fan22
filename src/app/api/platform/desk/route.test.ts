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
    // `limit` and `count` mirror the real query the desk builds: documents are capped and the
    // true queue size comes from an aggregation beside them.
    const snapshot = (taken: Row[]) => ({
      docs: taken.map((row) => ({ id: row.id, data: () => row.data })),
      size: taken.length,
    });
    const query = {
      where: vi.fn(() => query),
      limit: vi.fn((n: number) => ({ get: vi.fn(async () => snapshot(rows.slice(0, n))) })),
      count: vi.fn(() => ({ get: vi.fn(async () => ({ data: () => ({ count: rows.length }) })) })),
      get: vi.fn(async () => snapshot(rows)),
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

  it('caps what it reads without understating what is waiting', async () => {
    /*
     * The failure this guards. The desk read every matching document in eight collections
     * and paginated in memory — on the history filter, every verified athlete on the
     * platform, to render thirty rows. Capping the read is only safe if the queue size
     * still comes from somewhere exact, or the desk quietly tells an operator there are
     * thirty decisions waiting when there are thousands.
     */
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin_1', role: 'platform_admin' } as never);
    const manyAthletes = Array.from({ length: 640 }, (_, index) => ({
      id: `athlete_${index}`,
      data: { legalName: `Athlete ${index}`, verificationStatus: 'pending', createdAt: '2026-08-01T00:00:00.000Z' },
    }));
    installFirestore({
      users: [{ id: 'admin_1', data: { role: 'platform_admin', accountClass: 'platform_operator', accountStatus: 'active' } }],
      accessIndex: [{ id: 'platform_global_admin_1', data: { capabilities: ['platform.audit.read'] } }],
      athletes: manyAthletes,
    });

    const body = await (await GET(request())).json();

    // Bounded work: the cap, not the collection.
    expect(body.counts.athlete_verification).toBe(200);
    // Honest queue: the aggregation, not the cap.
    expect(body.sourceTotals.athletes).toBe(640);
    expect(body.truncated).toBe(true);
  });
});
