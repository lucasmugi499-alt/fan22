import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { allowingRateLimitTransaction } from '@/test/rateLimitMock';
import { POST } from './route';

/**
 * Recording that a fixture will not be played.
 *
 * The questions worth proving are the ones that make this safe to exist at all: it touches
 * exactly one field, it refuses every match that carries a record, and it leaves the reason
 * where the clubs and the audit trail can read it. A cancel that could reach a completed
 * match would be a second door to the official record.
 */
vi.mock('@/lib/firebase/admin', () => ({
  adminAppCheck: { verifyToken: vi.fn() },
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: { collection: vi.fn(), runTransaction: vi.fn(), batch: vi.fn() },
}));

const KICKOFF = '2026-06-06T15:00:00.000Z';

type Written = { path: string; data: Record<string, unknown> };

function request(body: Record<string, unknown> = { reason: 'Opponent did not turn up.' }) {
  return new Request('https://goalplace256.test/api/matches/match_1/cancel', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ matchId: 'match_1' });

function installFirestore({
  status = 'scheduled',
  capabilities = ['league.fixture.manage'],
}: { status?: string; capabilities?: string[] } = {}) {
  const writes: Written[] = [];
  const updates: Written[] = [];
  const store: Record<string, Record<string, unknown>> = {
    'users/league_1_admin': {
      role: 'league_admin',
      accountClass: 'organization_operator',
      accountStatus: 'active',
    },
    'accessIndex/league_league_1_league_1_admin': { capabilities },
    'matches/match_1': { leagueId: 'league_1', seasonId: 'season_1', status, scheduledAt: KICKOFF },
  };

  vi.mocked(adminDb.collection).mockImplementation((name: string) => {
    const query = {
      where: vi.fn(() => query),
      limit: vi.fn(() => query),
      get: vi.fn(async () => ({ docs: [], empty: true, size: 0 })),
      doc: vi.fn((id?: string) => {
        const path = `${name}/${id ?? `${name}_generated`}`;
        return {
          id: id ?? `${name}_generated`,
          path,
          get: vi.fn(async () => ({ id: id ?? '', exists: path in store, data: () => store[path] })),
        };
      }),
    };
    return query as never;
  });

  vi.mocked(adminDb.batch).mockImplementation(() => ({
    set: vi.fn((ref: { path: string }, data: Record<string, unknown>) => { writes.push({ path: ref.path, data }); }),
    update: vi.fn((ref: { path: string }, data: Record<string, unknown>) => { updates.push({ path: ref.path, data }); }),
    commit: vi.fn(async () => undefined),
  }) as never);

  return { writes, updates };
}

describe('recording a fixture as not played', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminDb.runTransaction).mockImplementation(allowingRateLimitTransaction() as never);
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'league_1_admin',
      role: 'league_admin',
      accountClass: 'organization_operator',
    } as never);
  });

  it('cancels a scheduled fixture, touching only its status', async () => {
    const { updates } = installFirestore();

    const response = await POST(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, status: 'cancelled' });
    // One field. A cancel that could also write a score is the thing this guards against.
    expect(updates).toHaveLength(1);
    expect(updates[0].path).toBe('matches/match_1');
    expect(Object.keys(updates[0].data).sort()).toEqual(['status', 'updatedAt']);
    expect(updates[0].data.status).toBe('cancelled');
  });

  it('writes the reason into the history and the audit trail', async () => {
    const { writes } = installFirestore();

    await POST(request({ reason: 'Venue lost and no date could be agreed.' }), { params });

    const change = writes.find((write) => write.path.startsWith('matchScheduleChanges/'));
    expect(change?.data).toMatchObject({
      matchId: 'match_1',
      kind: 'cancelled',
      fromScheduledAt: KICKOFF,
      toScheduledAt: null,
      reason: 'Venue lost and no date could be agreed.',
      changedByUserId: 'league_1_admin',
    });
    const audit = writes.find((write) => write.path.startsWith('adminAuditEvents/'));
    expect(audit?.data).toMatchObject({
      action: 'league.fixture.cancelled',
      actorUserId: 'league_1_admin',
      targetId: 'match_1',
    });
  });

  it.each(['completed', 'live', 'cancelled'])('refuses a %s match, which carries a record', async (status) => {
    const { updates } = installFirestore({ status });

    const response = await POST(request(), { params });

    expect(response.status).toBe(409);
    expect(updates).toHaveLength(0);
  });

  it('requires a reason the clubs can be told', async () => {
    installFirestore();

    const response = await POST(request({ reason: 'no' }), { params });

    expect(response.status).toBe(400);
  });

  it('refuses a league operator without league.fixture.manage', async () => {
    const { updates } = installFirestore({ capabilities: ['league.notice.publish'] });

    const response = await POST(request(), { params });

    expect(response.status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it('refuses a fan account outright', async () => {
    const { updates } = installFirestore();
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'fan_1', role: 'fan', accountClass: 'fan',
    } as never);

    const response = await POST(request(), { params });

    expect(response.status).toBe(403);
    expect(updates).toHaveLength(0);
  });
});
