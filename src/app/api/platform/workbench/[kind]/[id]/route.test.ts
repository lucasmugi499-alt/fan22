import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { GET } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: { collection: vi.fn() },
}));

type Row = { id: string; data: Record<string, unknown> };

function installFirestore(collections: Record<string, Row[]>) {
  vi.mocked(adminDb.collection).mockImplementation((name: string) => {
    const rows = collections[name] ?? [];
    const query = {
      where: vi.fn(() => query),
      limit: vi.fn(() => query),
      get: vi.fn(async () => ({ docs: rows.map((row) => ({ id: row.id, data: () => row.data })) })),
      doc: (id: string) => ({
        get: vi.fn(async () => {
          const found = rows.find((row) => row.id === id);
          return { id, exists: Boolean(found), data: () => found?.data };
        }),
      }),
    };
    return query as never;
  });
}

function request(path: string, token = 'token') {
  return new Request(`https://goalplace256.test${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

describe('Platform workbench route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated reads before loading the entity', async () => {
    const response = await GET(request('/api/platform/workbench/athlete/athlete_1?tab=payee', ''), {
      params: Promise.resolve({ kind: 'athlete', id: 'athlete_1' }),
    });

    expect(response.status).toBe(401);
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('returns a redacted, paginated athlete payee view to an authorized operator', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin_1', role: 'platform_admin' } as never);
    installFirestore({
      users: [{ id: 'admin_1', data: { role: 'platform_admin', accountClass: 'platform_operator', accountStatus: 'active' } }],
      accessIndex: [{ id: 'platform_global_admin_1', data: { capabilities: ['platform.audit.read'] } }],
      athletes: [{ id: 'athlete_1', data: { legalName: 'Amina Kato', status: 'pending', teamId: 'team_1' } }],
      athletePayees: [{ id: 'payee_1', data: { athleteId: 'athlete_1', status: 'submitted', accountNumber: '256700000000', payoutDetails: { phone: '256700000000' } } }],
    });

    const response = await GET(request('/api/platform/workbench/athlete/athlete_1?tab=payee&limit=20'), {
      params: Promise.resolve({ kind: 'athlete', id: 'athlete_1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.view.entity.title).toBe('Amina Kato');
    expect(body.view.records[0]).toMatchObject({ status: 'submitted' });
    expect(JSON.stringify(body)).not.toContain('256700000000');
  });
});
