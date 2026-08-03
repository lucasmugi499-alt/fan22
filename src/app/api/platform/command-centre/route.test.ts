import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { GET } from './route';
import { expectNoDomainCollectionAccess } from '@/test/firestoreAssertions';

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

    // `where` narrows the record set so filtered aggregate counts (official matches,
    // disputed results) are exercised rather than silently returning the whole
    // collection — the sampling bug this route previously shipped.
    const queryApi = (matching: Array<Record<string, unknown>>) => {
      const api = {
        doc: (id: string) => ({
          get: vi.fn(async () => ({
            exists: Boolean(matching.find((item) => item.id === id)),
            data: () => matching.find((item) => item.id === id),
          })),
        }),
        where: vi.fn((field: string, _operator: string, value: unknown) =>
          queryApi(matching.filter((item) => item[field] === value))),
        orderBy: vi.fn(() => api),
        limit: vi.fn(() => api),
        count: vi.fn(() => ({
          get: vi.fn(async () => ({
            data: () => ({ count: matching.length }),
          })),
        })),
        get: vi.fn(async () => ({
          size: matching.length,
          docs: matching.map((item) => ({
            id: String(item.id),
            data: () => item,
          })),
        })),
      };
      return api;
    };

    return queryApi(collectionRecords) as never;
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
    expectNoDomainCollectionAccess(vi.mocked(adminDb.collection));
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
      matches: [
        { id: 'match_1', homeTeamId: 'team_1', awayTeamId: 'team_2', verificationStatus: 'disputed', venue: 'Nakivubo' },
        // Played but unverified: must never be counted as official.
        { id: 'match_2', homeTeamId: 'team_1', awayTeamId: 'team_2', status: 'completed', verificationStatus: 'pending', venue: 'Nakivubo' },
        { id: 'match_3', homeTeamId: 'team_1', awayTeamId: 'team_2', status: 'completed', verificationStatus: 'verified', venue: 'Nakivubo' },
      ],
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

  it('counts only played-and-verified matches as official', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin_1', role: 'platform_admin' } as never);
    installFirestoreMock({
      users: [{ id: 'admin_1', role: 'platform_admin', accountClass: 'platform_operator', accountStatus: 'active' }],
      athletes: [
        { id: 'athlete_1', name: 'Priscilla', teamId: 'team_1' },
        { id: 'athlete_2', name: 'Ruth' },
      ],
      matches: [
        { id: 'match_1', status: 'completed', verificationStatus: 'verified' },
        { id: 'match_2', status: 'completed', verificationStatus: 'pending' },
        { id: 'match_3', status: 'scheduled', verificationStatus: 'pending' },
        { id: 'match_4', status: 'completed', verificationStatus: 'disputed' },
      ],
    });

    const body = await (await GET(request())).json();
    const health = Object.fromEntries(
      (body.networkHealth as Array<{ label: string; value: unknown }>).map((item) => [item.label, item.value]),
    );

    // One of four matches qualifies. The previous implementation fell back to the total
    // match count whenever the official count was zero, reporting every match as official.
    expect(health['Official matches']).toBe(1);
    expect(health['Verified-result rate']).toBe('25%');
    expect(health['Results disputed']).toBe(1);
    // Roster linkage is not sport-data completeness and must not be labelled as such.
    expect(health['Roster-linkage rate']).toBe('50%');
    expect(health).not.toHaveProperty('Data-completeness rate');
  });

  it('reports zero official matches rather than the total when none are verified', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin_1', role: 'platform_admin' } as never);
    installFirestoreMock({
      users: [{ id: 'admin_1', role: 'platform_admin', accountClass: 'platform_operator', accountStatus: 'active' }],
      matches: [
        { id: 'match_1', status: 'completed', verificationStatus: 'pending' },
        { id: 'match_2', status: 'completed', verificationStatus: 'pending' },
      ],
    });

    const body = await (await GET(request())).json();
    const health = Object.fromEntries(
      (body.networkHealth as Array<{ label: string; value: unknown }>).map((item) => [item.label, item.value]),
    );

    expect(health['Official matches']).toBe(0);
    expect(health['Verified-result rate']).toBe('0%');
  });
});
