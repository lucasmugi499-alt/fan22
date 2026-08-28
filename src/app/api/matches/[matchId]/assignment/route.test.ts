import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { allowingRateLimitTransaction } from '@/test/rateLimitMock';
import { POST } from './route';

/**
 * The Field Manager assignment contract.
 *
 * This is the League Admin's central matchday act and the one that mints real match
 * credentials, so the questions worth proving are not "does the component render" but: who is
 * allowed to call it, what does it write, and what comes back. The browser proves the sheet
 * opens and validates; this proves the endpoint behind it.
 */
vi.mock('@/lib/firebase/admin', () => ({
  adminAppCheck: { verifyToken: vi.fn() },
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: { collection: vi.fn(), runTransaction: vi.fn(), batch: vi.fn() },
}));

const KICKOFF = '2026-09-12T15:00:00.000Z';

type Written = { path: string; data: Record<string, unknown> };

function request(body: Record<string, unknown>) {
  return new Request('https://goalplace256.test/api/matches/match_1/assignment', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function installFirestore({
  neutralityRequired = false,
  capabilities = ['league.field_manager.manage'],
}: { neutralityRequired?: boolean; capabilities?: string[] } = {}) {
  const writes: Written[] = [];
  const store: Record<string, Record<string, unknown>> = {
    'users/league_1_admin': {
      role: 'league_admin',
      accountClass: 'organization_operator',
      accountStatus: 'active',
    },
    'accessIndex/league_league_1_league_1_admin': { capabilities },
    'matches/match_1': {
      leagueId: 'league_1',
      seasonId: 'season_1',
      homeTeamId: 'team_home',
      awayTeamId: 'team_away',
      scheduledAt: KICKOFF,
    },
    'seasons/season_1': { neutralFieldManagerRequired: neutralityRequired },
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
          get: vi.fn(async () => ({
            id: id ?? '',
            exists: path in store,
            data: () => store[path],
          })),
        };
      }),
    };
    return query as never;
  });

  vi.mocked(adminDb.batch).mockImplementation(() => ({
    set: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
      writes.push({ path: ref.path, data });
    }),
    update: vi.fn(),
    commit: vi.fn(async () => undefined),
  }) as never);

  return writes;
}

describe('field manager assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The route rate-limits through a transaction; without this every case is a 429.
    vi.mocked(adminDb.runTransaction).mockImplementation(allowingRateLimitTransaction() as never);
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'league_1_admin',
      role: 'league_admin',
      accountClass: 'organization_operator',
    } as never);
  });

  it('refuses an unauthenticated caller before touching any collection', async () => {
    installFirestore();
    const response = await POST(
      new Request('https://goalplace256.test/api/matches/match_1/assignment', {
        method: 'POST',
        body: JSON.stringify({ displayName: 'Joseph K.', phone: '+256700123456' }),
      }),
      { params: Promise.resolve({ matchId: 'match_1' }) },
    );
    expect(response.status).toBe(401);
    expect(adminAuth.verifyIdToken).not.toHaveBeenCalled();
  });

  it('refuses a league admin who does not hold the capability for this league', async () => {
    installFirestore({ capabilities: ['league.fixture.manage'] });
    const response = await POST(
      request({ displayName: 'Joseph K.', phone: '+256700123456' }),
      { params: Promise.resolve({ matchId: 'match_1' }) },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Only this league can assign a Field Manager.',
    });
  });

  it('assigns, and returns credentials that were never stored in the clear', async () => {
    const writes = installFirestore();
    const response = await POST(
      request({ displayName: 'Joseph Kayemba', phone: '+256700123456' }),
      { params: Promise.resolve({ matchId: 'match_1' }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toMatchObject({ ok: true, affiliationRecorded: false });
    expect(typeof body.accessLink).toBe('string');
    expect(body.accessLink.startsWith('/m/')).toBe(true);
    expect(typeof body.pin).toBe('string');

    // The access window opens two hours before kickoff and closes five hours after.
    expect(body.accessStartsAt).toBe('2026-09-12T13:00:00.000Z');
    expect(body.accessExpiresAt).toBe('2026-09-12T20:00:00.000Z');

    const session = writes.find((write) => write.path.startsWith('matchAccessSessions/'));
    expect(session).toBeDefined();
    // Hashes only. A stored plaintext PIN would make a database dump a set of live credentials.
    expect(session!.data).toHaveProperty('bootstrapTokenHash');
    expect(session!.data).toHaveProperty('pinHash');
    expect(JSON.stringify(session!.data)).not.toContain(body.pin);
    expect(JSON.stringify(session!.data)).not.toContain(body.accessLink.replace('/m/', ''));

    const assignment = writes.find((write) => write.path.startsWith('fieldManagerAssignments/'));
    expect(assignment!.data).toMatchObject({
      matchId: 'match_1',
      leagueId: 'league_1',
      status: 'assigned',
      assignedByUserId: 'league_1_admin',
    });
  });

  it('records a declared affiliation and opens a non-blocking exception rather than refusing', async () => {
    const writes = installFirestore();
    const response = await POST(
      request({
        displayName: 'Joseph Kayemba',
        phone: '+256700123456',
        declaredAffiliations: ['team_home'],
      }),
      { params: Promise.resolve({ matchId: 'match_1' }) },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).affiliationRecorded).toBe(true);

    const exception = writes.find((write) => write.path.startsWith('matchOperationalExceptions/'));
    expect(exception!.data).toMatchObject({ code: 'affiliated_observer', blocking: false });
  });

  it('refuses an involved observer only where the competition demands neutrality', async () => {
    installFirestore({ neutralityRequired: true });
    const response = await POST(
      request({
        displayName: 'Joseph Kayemba',
        phone: '+256700123456',
        declaredAffiliations: ['team_away'],
      }),
      { params: Promise.resolve({ matchId: 'match_1' }) },
    );
    expect(response.status).toBe(409);
    expect((await response.json()).conflictingTeamIds).toEqual(['team_away']);
  });

  it('needs a name and a phone number', async () => {
    installFirestore();
    const response = await POST(
      request({ displayName: 'J', phone: '1' }),
      { params: Promise.resolve({ matchId: 'match_1' }) },
    );
    expect(response.status).toBe(400);
  });
});
