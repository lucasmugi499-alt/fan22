import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { POST } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAppCheck: { verifyToken: vi.fn() },
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: { collection: vi.fn(), runTransaction: vi.fn() },
}));

type StoredRow = Record<string, unknown>;

function request() {
  return new Request('https://goalplace256.test/api/exceptions/case_1/ratify', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'accept_proposal', note: 'Evidence reviewed.' }),
  });
}

function installFirestore({ conflicted = true }: { conflicted?: boolean } = {}) {
  const store: Record<string, StoredRow> = {
    'users/platform_1': {
      role: 'platform_admin',
      accountClass: 'platform_operator',
      accountStatus: 'active',
    },
    'accessIndex/platform_global_platform_1': {
      capabilities: ['platform.admin.manage', 'platform.trust.decide'],
    },
    'matchOperationalExceptions/case_1': {
      matchId: 'match_1',
      leagueId: 'league_1',
      status: 'open',
      proposedResolution: 'Accept the two-source result.',
    },
    'matches/match_1': { homeTeamId: 'team_1', awayTeamId: 'team_2' },
  };

  vi.mocked(adminDb.collection).mockImplementation((name: string) => {
    const query = {
      where: vi.fn(() => query),
      get: vi.fn(async () => ({
        docs: name === 'teamAffiliations' && conflicted
          ? [{
              id: 'affiliation_1',
              data: () => ({
                userId: 'platform_1',
                teamId: 'team_1',
                relationship: 'coach',
                basis: 'declared',
                status: 'active',
                effectiveFrom: '2026-01-01T00:00:00.000Z',
              }),
            }]
          : [],
      })),
      doc: vi.fn((id: string) => ({
        path: `${name}/${id}`,
        get: vi.fn(async () => ({
          id,
          exists: Boolean(store[`${name}/${id}`]),
          data: () => store[`${name}/${id}`],
        })),
        update: vi.fn(async (value: StoredRow) => {
          store[`${name}/${id}`] = { ...(store[`${name}/${id}`] ?? {}), ...value };
        }),
      })),
      add: vi.fn(async () => ({ id: 'audit_1' })),
    };
    return query as never;
  });

  vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (transaction: unknown) => unknown) => callback({
    get: vi.fn(async () => ({ data: () => undefined })),
    set: vi.fn(),
  }) as never);

  return store;
}

describe('exception ratification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'platform_1',
      role: 'platform_admin',
      accountClass: 'platform_operator',
    } as never);
  });

  it('refuses a conflicted Platform operator before resolving the case', async () => {
    const store = installFirestore();

    const response = await POST(request(), {
      params: Promise.resolve({ exceptionId: 'case_1' }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      conflictWithMatch: true,
      error: expect.stringMatching(/involved|conflict/i),
    });
    expect(store['matchOperationalExceptions/case_1']).toMatchObject({ status: 'open' });
  });

  it('lets an unconflicted authorized operator ratify a proposed resolution', async () => {
    const store = installFirestore({ conflicted: false });

    const response = await POST(request(), {
      params: Promise.resolve({ exceptionId: 'case_1' }),
    });

    expect(response.status).toBe(200);
    expect(store['matchOperationalExceptions/case_1']).toMatchObject({
      status: 'resolved',
      ratifiedByUserId: 'platform_1',
      resolution: 'Accept the two-source result.',
    });
  });
});
