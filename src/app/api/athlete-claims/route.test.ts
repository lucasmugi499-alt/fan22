import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function ref(collectionName: string, id?: string) {
  return {
    collectionName,
    id: id ?? `${collectionName}_generated`,
    set: vi.fn(async () => undefined),
  };
}

function snapshot(data: Record<string, unknown> | undefined) {
  return {
    exists: Boolean(data),
    data: () => data,
  };
}

describe('athlete claim access projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => ({
      doc: (id?: string) => ref(collectionName, id),
    }) as never);
  });

  it('creates an athlete_self access assignment and index when a league verifies a claim', async () => {
    const transaction = {
      get: vi.fn(async (document: ReturnType<typeof ref>) => {
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
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'accessIndex',
      id: 'athlete_athlete_1_athlete_user_1',
    }), expect.objectContaining({
      userId: 'athlete_user_1',
      scopeType: 'athlete',
      scopeId: 'athlete_1',
      activeRoles: ['athlete_self'],
      capabilities: expect.arrayContaining(['athlete.profile.manage', 'athlete.challenge.propose']),
      assignmentIds: ['assignment_athlete_athlete_1_athlete_user_1'],
    }), { merge: true });
    expect(adminAuth.setCustomUserClaims).toHaveBeenCalledWith('athlete_user_1', expect.objectContaining({
      role: 'athlete',
    }));
  });
});
