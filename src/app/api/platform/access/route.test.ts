import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { GET, POST } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: { collection: vi.fn() },
}));

function request(token = 'token') {
  return new Request('https://goalplace256.test/api/platform/access?limit=10', {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

type Row = { id: string; data: Record<string, unknown> };

function installFirestore(collections: Record<string, Row[]>) {
  vi.mocked(adminDb.collection).mockImplementation((name: string) => {
    const rows = collections[name] ?? [];
    const api = {
      where: vi.fn(() => api),
      orderBy: vi.fn(() => api),
      startAfter: vi.fn(() => api),
      limit: vi.fn(() => api),
      get: vi.fn(async () => ({
        docs: rows.map((row) => ({ id: row.id, data: () => row.data })),
      })),
      doc: vi.fn((id: string) => ({
        get: vi.fn(async () => {
          const found = rows.find((row) => row.id === id);
          return { exists: Boolean(found), data: () => found?.data };
        }),
      })),
    };
    return api as never;
  });
}

const PLATFORM_OPERATOR: Row = {
  id: 'admin_1',
  data: { role: 'platform_admin', accountClass: 'platform_operator', accountStatus: 'active' },
};

describe('platform access directory route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects an unauthenticated request before reading Firestore', async () => {
    const response = await GET(request(''));

    expect(response.status).toBe(401);
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('requires a dedicated Platform Operator account', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin_1', role: 'platform_admin' } as never);
    installFirestore({
      users: [{ id: 'admin_1', data: { role: 'platform_admin', accountClass: 'fan' } }],
    });

    const response = await GET(request());

    expect(response.status).toBe(403);
  });

  it('returns canonical assignments with their projection state', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin_1', role: 'platform_admin' } as never);
    installFirestore({
      users: [PLATFORM_OPERATOR],
      accessAssignments: [{
        id: 'assignment_1',
        data: {
          userId: 'user_1',
          roleKey: 'team_admin',
          scopeType: 'team',
          scopeId: 'team_1',
          permissionBundleId: 'full_team_admin',
          status: 'active',
          grantedByUserId: 'admin_1',
          validFrom: '2026-01-01T00:00:00.000Z',
        },
      }],
      accessIndex: [{
        id: 'team_team_1_user_1',
        data: { capabilities: ['team.roster.manage', 'team.result.submit'] },
      }],
    });

    const body = await (await GET(request())).json();

    expect(body.assignments).toHaveLength(1);
    expect(body.assignments[0]).toMatchObject({
      id: 'assignment_1',
      scopeType: 'team',
      status: 'active',
      projected: true,
      projectedCapabilities: ['team.roster.manage', 'team.result.submit'],
    });
  });

  it('flags an active assignment that has no projection', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin_1', role: 'platform_admin' } as never);
    installFirestore({
      users: [PLATFORM_OPERATOR],
      accessAssignments: [{
        id: 'assignment_1',
        data: {
          userId: 'user_1',
          roleKey: 'team_admin',
          scopeType: 'team',
          scopeId: 'team_1',
          status: 'active',
          validFrom: '2026-01-01T00:00:00.000Z',
        },
      }],
      accessIndex: [],
    });

    const body = await (await GET(request())).json();

    // Rules read the projection, not the assignment, so an unprojected assignment grants
    // nothing. The desk has to show that rather than imply the operator has access.
    expect(body.assignments[0].projected).toBe(false);
  });

  it('does not accept mutations on this endpoint', async () => {
    const response = await POST();

    expect(response.status).toBe(405);
  });
});
