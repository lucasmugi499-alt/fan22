import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { POST } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
    getUser: vi.fn(),
    setCustomUserClaims: vi.fn(),
  },
  adminDb: {
    collection: vi.fn(),
    runTransaction: vi.fn(),
  },
}));

function request(body: unknown, token = 'token') {
  return new Request('https://goalplace256.test/api/athlete-claims', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify(body),
  });
}

/**
 * Canonical capability grants the route reads outside the transaction.
 * Keyed by accessIndex document id.
 */
let accessIndex: Record<string, { capabilities: string[] }> = {};

function ref(collectionName: string, id?: string) {
  const documentId = id ?? `${collectionName}_generated`;
  return {
    collectionName,
    id: documentId,
    set: vi.fn(async () => undefined),
    get: vi.fn(async () => ({
      exists: collectionName === 'accessIndex' ? Boolean(accessIndex[documentId]) : false,
      data: () => (collectionName === 'accessIndex' ? accessIndex[documentId] : undefined),
    })),
  };
}

function snapshot(data: Record<string, unknown> | undefined) {
  return {
    exists: Boolean(data),
    data: () => data,
  };
}

function querySnapshot(empty: boolean) {
  return { empty };
}

/** A chainable stand-in for the projector's scoped assignment query. */
function query(collectionName: string, docs: Array<{ id: string; data: Record<string, unknown> }> = []) {
  const api = {
    isQuery: true as const,
    collectionName,
    where: vi.fn(() => api),
    docs,
  };
  return api;
}

describe('athlete claim access projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessIndex = {
      // The league admin's canonical grant. Authority no longer comes from adminUserIds.
      league_league_1_league_admin_1: { capabilities: ['league.roster.verify'] },
    };
    vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => ({
      doc: (id?: string) => ref(collectionName, id),
      where: vi.fn(() => query(collectionName)),
    }) as never);
  });

  it('creates an athlete_self access assignment and index when a league verifies a claim', async () => {
    const transaction = {
      get: vi.fn(async (target: ReturnType<typeof ref> & { isQuery?: boolean; docs?: unknown[] }) => {
        // The projector reads the scoped assignment query; no assignment exists yet.
        if (target.isQuery) {
          return { docs: (target.docs ?? []).map((doc) => doc) };
        }
        const document = target;
        // The shared mutation wrapper's rate limiter runs in the same transaction.
        if (document.collectionName === 'apiRateLimits') return snapshot(undefined);
        if (document.collectionName === 'athleteClaims') {
          return snapshot({
            athleteId: 'athlete_1',
            teamId: 'team_1',
            leagueId: 'league_1',
            requesterUserId: 'athlete_user_1',
            status: 'league_pending',
          });
        }
        if (document.collectionName === 'teams') return snapshot({ adminUserIds: ['team_admin_1'] });
        if (document.collectionName === 'leagues') return snapshot({ adminUserIds: ['league_admin_1'] });
        if (document.collectionName === 'athletes') return snapshot({});
        return snapshot(undefined);
      }),
      update: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction) as never);
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'league_admin_1',
      role: 'league_admin',
      email_verified: true,
    });
    vi.mocked(adminAuth.getUser).mockResolvedValue({
      uid: 'athlete_user_1',
      customClaims: { role: 'fan' },
    } as never);

    const response = await POST(request({ action: 'league_verify', claimId: 'claim_1' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: 'claim_1',
      status: 'linked',
      requesterUserId: 'athlete_user_1',
    });
    expect(transaction.update).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'athletes',
      id: 'athlete_1',
    }), expect.objectContaining({
      userId: 'athlete_user_1',
    }));
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'accessAssignments',
      id: 'assignment_athlete_athlete_1_athlete_user_1',
    }), expect.objectContaining({
      id: 'assignment_athlete_athlete_1_athlete_user_1',
      userId: 'athlete_user_1',
      roleKey: 'athlete_self',
      scopeType: 'athlete',
      scopeId: 'athlete_1',
      permissionBundleId: 'athlete_self',
      status: 'active',
      grantedByUserId: 'league_admin_1',
      applicationId: 'claim_1',
    }));
    // The projection is written whole. A partial merge is what previously allowed
    // capabilities from a removed assignment to survive in the same scope.
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'accessIndex',
      id: 'athlete_athlete_1_athlete_user_1',
    }), expect.objectContaining({
      userId: 'athlete_user_1',
      scopeType: 'athlete',
      scopeId: 'athlete_1',
      activeRoles: ['athlete_self'],
      // A verified claim gives the athlete their payee portal and the ability to propose —
      // not authority over their own public sporting record, which the team owns.
      capabilities: expect.arrayContaining(['athlete.payee.submit', 'athlete.challenge.propose']),
      assignmentIds: ['assignment_athlete_athlete_1_athlete_user_1'],
    }), { merge: false });
    // Stated as an absence too: the removed capabilities must not reappear by way of a
    // bundle edit that looks harmless.
    const projectedIndex = transaction.set.mock.calls
      .map((call: unknown[]) => call[1] as { capabilities?: string[] })
      .find((value) => Array.isArray(value?.capabilities));
    expect(projectedIndex?.capabilities).not.toContain('athlete.profile.manage');
    expect(projectedIndex?.capabilities).not.toContain('athlete.media.manage');
    expect(adminAuth.setCustomUserClaims).toHaveBeenCalledWith('athlete_user_1', expect.objectContaining({
      role: 'athlete',
    }));
  });

  it('requires the invited athlete email and token before opening league verification', async () => {
    const token = 'invitation-token-that-is-long-enough';
    const transaction = {
      get: vi.fn(async (target: unknown) => {
        if (typeof target === 'object' && target && 'collectionName' in target) {
          const document = target as ReturnType<typeof ref>;
          if (document.collectionName === 'apiRateLimits') return snapshot(undefined);
          if (document.collectionName === 'athletes') {
            return snapshot({
              id: 'athlete_1',
              teamId: 'team_1',
              leagueId: 'league_1',
              invitedEmail: 'athlete@example.com',
              invitationTokenHash: createHash('sha256').update(token).digest('hex'),
              invitationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
            });
          }
        }
        return querySnapshot(true);
      }),
      create: vi.fn(),
      update: vi.fn(),
      set: vi.fn(),
    };
    vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => ({
      doc: (id?: string) => ref(collectionName, id),
      where: vi.fn().mockReturnThis(),
    }) as never);
    vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction) as never);
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'athlete_user_1',
      role: 'fan',
      email: 'athlete@example.com',
      email_verified: true,
    });

    const response = await POST(request({
      action: 'request',
      athleteId: 'athlete_1',
      invitationToken: token,
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'league_pending',
    });
    expect(transaction.create).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'athleteClaims',
    }), expect.objectContaining({
      athleteId: 'athlete_1',
      requesterUserId: 'athlete_user_1',
      status: 'league_pending',
      teamReviewedByUserId: 'team_invitation',
    }));
  });
});
