import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { GET } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
  },
  adminDb: {
    collection: vi.fn(),
  },
}));

function request(token = 'token') {
  return new Request('https://goalplace256.test/api/platform/command-centre', {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

function installFirestoreMock(records: Record<string, Array<Record<string, unknown>>>) {
  vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => {
    const collectionRecords = records[collectionName] ?? [];
    const collectionApi = {
      doc: (id: string) => ({
        get: vi.fn(async () => ({
          exists: Boolean(collectionRecords.find((item) => item.id === id)),
          data: () => collectionRecords.find((item) => item.id === id),
        })),
      }),
      orderBy: vi.fn(() => collectionApi),
      limit: vi.fn(() => collectionApi),
      count: vi.fn(() => ({
        get: vi.fn(async () => ({
          data: () => ({ count: collectionRecords.length }),
        })),
      })),
      get: vi.fn(async () => ({
        size: collectionRecords.length,
        docs: collectionRecords.map((item) => ({
          id: String(item.id),
          data: () => item,
        })),
      })),
    };
    return collectionApi as never;
  });
}

describe('platform command centre route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests before reading Firestore', async () => {
    const response = await GET(request(''));

    expect(response.status).toBe(401);
    expect(adminAuth.verifyIdToken).not.toHaveBeenCalled();
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('requires a dedicated platform operator account', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin_1', role: 'platform_admin' } as never);
    installFirestoreMock({
      users: [{ id: 'admin_1', role: 'platform_admin', accountClass: 'fan' }],
    });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'A dedicated Platform Operator account is required.' });
  });

  it('returns bounded aggregate and queue preview data for platform operators', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin_1', role: 'platform_admin' } as never);
    installFirestoreMock({
      users: [
        { id: 'admin_1', role: 'platform_admin', accountClass: 'platform_operator', accountStatus: 'active' },
        { id: 'user_1', role: 'fan', accountClass: 'fan', accountStatus: 'suspended' },
      ],
      leagues: [{ id: 'league_1', name: 'Kampala League', status: 'community' }],
      teams: [{ id: 'team_1', name: 'Kisenyi United', verificationStatus: 'verified' }],
      athletes: [{ id: 'athlete_1', name: 'Priscilla', verificationStatus: 'pending', teamName: 'Kisenyi United' }],
      matches: [{ id: 'match_1', homeTeamId: 'team_1', awayTeamId: 'team_2', verificationStatus: 'disputed', venue: 'Nakivubo' }],
      leagueAdminApplications: [{ id: 'app_1', leagueName: 'Masaka League', city: 'Masaka', status: 'submitted' }],
      reports: [{ id: 'report_1', type: 'reported_feed_post', status: 'open', severity: 'Critical', summary: 'Abuse report' }],
      finalizations: [{ id: 'final_1', matchId: 'match_1', status: 'failed', resultVersion: 1, source: 'mutual_confirmation' }],
      adminAuditEvents: [{ id: 'audit_1', actorUserId: 'admin_1', action: 'created', targetCollection: 'leagues', targetId: 'league_1' }],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.projectId).toBeDefined();
    expect(body.statusStrip).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Failed finalizations', value: 1 }),
      expect.objectContaining({ label: 'Security incidents', value: 1 }),
    ]));
    expect(body.workQueue).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'League application', title: 'Masaka League' }),
      expect.objectContaining({ type: 'Result dispute', priority: 'critical' }),
      expect.objectContaining({ type: 'Failed finalization', stage: 'failed' }),
    ]));
    expect(JSON.stringify(body)).not.toContain('tokenHash');
  });
});
