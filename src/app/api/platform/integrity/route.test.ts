import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { GET } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: { collection: vi.fn() },
}));

function installFirestore() {
  const data: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {
    users: [{ id: 'admin_1', data: { role: 'platform_admin', accountClass: 'platform_operator', accountStatus: 'active' } }],
    accessIndex: [{ id: 'platform_global_admin_1', data: { capabilities: ['platform.audit.read'] } }],
    matches: [{ id: 'match_1', data: { status: 'live', homeTeamId: 'home', awayTeamId: 'away', leagueId: 'league_1' } }],
    matchClockStates: [{ id: 'match_1', data: { matchId: 'match_1', state: 'running', period: '1', sessionGeneration: 1, updatedAt: '2026-08-27T12:00:00.000Z' } }],
    fieldManagerAssignments: [{ id: 'assignment_1', data: { matchId: 'match_1', fieldManagerId: 'user:field_1', status: 'in_progress' } }],
    matchAccessSessions: [{ id: 'session_1', data: { matchId: 'match_1', assignmentId: 'assignment_1', sessionGeneration: 1, sessionTokenHash: 'secret' } }],
  };
  vi.mocked(adminDb.collection).mockImplementation((name: string) => {
    const rows = data[name] ?? [];
    const query = {
      where: vi.fn(() => query), limit: vi.fn(() => query),
      get: vi.fn(async () => ({ docs: rows.map((row) => ({ id: row.id, data: () => row.data })) })),
      doc: (id: string) => ({ get: vi.fn(async () => {
        const row = rows.find((item) => item.id === id);
        return { id, exists: Boolean(row), data: () => row?.data };
      }) }),
    };
    return query as never;
  });
}

describe('Platform integrity read route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns attributed live observations without session secrets or invented online state', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin_1', role: 'platform_admin' } as never);
    installFirestore();

    const response = await GET(new Request('https://goalplace256.test/api/platform/integrity?view=live', { headers: { authorization: 'Bearer token' } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cards[0]).toMatchObject({ id: 'match_1', operatorLabel: 'user:field_1', currentGeneration: 1 });
    expect(body.cards[0]).not.toHaveProperty('online');
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});
