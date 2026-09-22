import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { POST } from './route';

/**
 * A league settling a V1 result claim.
 *
 * This route exists because the same decision used to be a Firestore transaction run in the
 * League Admin's browser, permitted by a rule, with no command, no reason and no audit
 * event — a second door to the official record. So what has to be proven here is not that
 * the happy path writes, but that the door is narrow: the right league, a real reason, a
 * plausible score, a legal transition, and never a score on the match itself.
 */
vi.mock('@/lib/firebase/admin', () => ({
  adminAppCheck: { verifyToken: vi.fn() },
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: { collection: vi.fn(), runTransaction: vi.fn(), batch: vi.fn() },
}));

type Written = { path: string; data: Record<string, unknown> };

function request(body: Record<string, unknown>) {
  return new Request('https://goalplace256.test/api/result-submissions/match_1/adjudicate', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ matchId: 'match_1' });
const REASON = 'Referee sheet confirms the score; the dispute was a migration artefact.';

function installFirestore({
  claimStatus = 'disputed',
  capabilities = ['league.result.resolve'],
  sport = 'football',
}: { claimStatus?: string; capabilities?: string[]; sport?: string } = {}) {
  const writes: Written[] = [];
  const updates: Written[] = [];
  const store: Record<string, Record<string, unknown>> = {
    'users/league_1_admin': {
      role: 'league_admin',
      accountClass: 'organization_operator',
      accountStatus: 'active',
    },
    'accessIndex/league_league_1_league_1_admin': { capabilities },
    'leagues/league_1': { name: 'Kampala Metro' },
    'matches/match_1': { leagueId: 'league_1', sport, status: 'completed' },
    'resultSubmissions/match_1': {
      matchId: 'match_1',
      leagueId: 'league_1',
      status: claimStatus,
      submittedByTeamId: 'team_home',
      opponentTeamId: 'team_away',
      homeScore: 4,
      awayScore: 0,
    },
  };

  const makeDoc = (name: string, id?: string) => {
    const path = `${name}/${id ?? `${name}_generated`}`;
    return {
      id: id ?? `${name}_generated`,
      path,
      get: vi.fn(async () => ({ id: id ?? '', exists: path in store, data: () => store[path] })),
      collection: (sub: string) => ({ doc: (subId?: string) => makeDoc(`${path}/${sub}`, subId) }),
    };
  };

  vi.mocked(adminDb.collection).mockImplementation((name: string) => {
    const query = {
      where: vi.fn(() => query),
      limit: vi.fn(() => query),
      get: vi.fn(async () => ({ docs: [], empty: true, size: 0 })),
      doc: vi.fn((id?: string) => makeDoc(name, id)),
    };
    return query as never;
  });

  // One transaction mock serves both the rate limiter and the handler's own transaction.
  vi.mocked(adminDb.runTransaction).mockImplementation((async (callback: (tx: unknown) => unknown) => callback({
    get: vi.fn(async (ref: { path?: string }) => (ref?.path
      ? { exists: ref.path in store, data: () => store[ref.path!], id: ref.path.split('/').pop() }
      : { exists: false, data: () => undefined })),
    set: vi.fn((ref: { path: string }, data: Record<string, unknown>) => { writes.push({ path: ref.path, data }); }),
    update: vi.fn((ref: { path: string }, data: Record<string, unknown>) => { updates.push({ path: ref.path, data }); }),
  })) as never);

  return { writes, updates };
}

describe('league adjudication of a V1 claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'league_1_admin',
      role: 'league_admin',
      accountClass: 'organization_operator',
    } as never);
  });

  it('upholds a disputed claim, writing the decision, its event and its audit entry', async () => {
    const { writes, updates } = installFirestore();

    const response = await POST(request({ decision: 'uphold', reason: REASON }), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, status: 'confirmed', resolution: 'league_upheld' });

    const claim = updates.find((update) => update.path === 'resultSubmissions/match_1');
    expect(claim?.data).toMatchObject({
      status: 'confirmed',
      resolution: 'league_upheld',
      resolvedByUserId: 'league_1_admin',
      finalDecisionNote: REASON,
    });
    // The claimed score is never touched by a decision about it.
    expect(claim?.data).not.toHaveProperty('homeScore');
    // And nothing is written to the match: the finalizer is the only writer of the record.
    expect([...writes, ...updates].some((write) => write.path.startsWith('matches/'))).toBe(false);

    expect(writes.some((write) => write.path.includes('/events/'))).toBe(true);
    expect(writes.find((write) => write.path.startsWith('adminAuditEvents/'))?.data)
      .toMatchObject({ action: 'league.result.adjudicated', targetId: 'match_1' });
  });

  it('records a correction into the corrected fields, never over the claim', async () => {
    const { updates } = installFirestore();

    const response = await POST(
      request({ decision: 'correct', correctedScore: { home: 2, away: 1 }, reason: REASON }),
      { params },
    );

    expect(response.status).toBe(200);
    const claim = updates.find((update) => update.path === 'resultSubmissions/match_1');
    expect(claim?.data).toMatchObject({
      resolution: 'league_corrected',
      correctedHomeScore: 2,
      correctedAwayScore: 1,
    });
    expect(claim?.data).not.toHaveProperty('homeScore');
  });

  it('refuses a correction with no score', async () => {
    const { updates } = installFirestore();

    const response = await POST(request({ decision: 'correct', reason: REASON }), { params });

    expect(response.status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it('refuses a score the sport cannot produce', async () => {
    const { updates } = installFirestore();

    const response = await POST(
      request({ decision: 'correct', correctedScore: { home: 44, away: 0 }, reason: REASON }),
      { params },
    );

    expect(response.status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it('refuses a decision with no reason, because the reason is the audit', async () => {
    const { updates } = installFirestore();

    const response = await POST(request({ decision: 'uphold', reason: 'no' }), { params });

    expect(response.status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it('refuses a claim that is already settled', async () => {
    const { updates } = installFirestore({ claimStatus: 'rejected' });

    const response = await POST(request({ decision: 'uphold', reason: REASON }), { params });

    expect(response.status).toBe(409);
    expect(updates).toHaveLength(0);
  });

  it('refuses a league operator without league.result.resolve', async () => {
    const { updates } = installFirestore({ capabilities: ['league.notice.publish'] });

    const response = await POST(request({ decision: 'uphold', reason: REASON }), { params });

    expect(response.status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it('refuses a fan account outright', async () => {
    const { updates } = installFirestore();
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'fan_1', role: 'fan', accountClass: 'fan',
    } as never);

    const response = await POST(request({ decision: 'uphold', reason: REASON }), { params });

    expect(response.status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it('refuses when the claim does not exist', async () => {
    installFirestore();
    const missing = new Request('https://goalplace256.test/api/result-submissions/nope/adjudicate', {
      method: 'POST',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'uphold', reason: REASON }),
    });

    const response = await POST(missing, { params: Promise.resolve({ matchId: 'nope' }) });

    expect(response.status).toBe(404);
  });
});
