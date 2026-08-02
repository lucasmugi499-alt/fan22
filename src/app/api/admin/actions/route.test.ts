import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { sendTeamInvitationEmail } from '@/server/email/teamInvitation';
import { POST } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
  },
  adminDb: {
    collection: vi.fn(),
    runTransaction: vi.fn(),
  },
}));

vi.mock('@/server/email/teamInvitation', () => ({
  sendTeamInvitationEmail: vi.fn(),
}));

function request(body: string, token = 'token') {
  return new Request('https://goalplace256.test/api/admin/actions', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body,
  });
}

function snapshot(id: string, data: Record<string, unknown> | undefined) {
  return {
    id,
    exists: Boolean(data),
    data: () => data,
  };
}

function installFirestoreMock(records: Record<string, Record<string, unknown>>) {
  vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => ({
    doc: (id = `${collectionName}_generated`) => ({
      collectionName,
      id,
      get: vi.fn(async () => snapshot(id, records[`${collectionName}/${id}`])),
      set: vi.fn(async () => undefined),
    }),
  }) as never);
}

const teamPayload = {
  id: 'team_1',
  name: 'Kampala Testers',
  sport: 'football',
  leagueId: 'league_1',
  city: 'Kampala',
  country: 'Uganda',
  description: 'A new test team.',
  plan: 'free',
  verified: false,
  adminUserIds: [],
  totalSupport: 0,
  supportersCount: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  leaguePoints: 0,
};

describe('trusted admin actions route hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests before parsing or touching Firestore', async () => {
    const response = await POST(request('{', ''));

    expect(response.status).toBe(401);
    expect(adminAuth.verifyIdToken).not.toHaveBeenCalled();
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON before touching Firestore', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'league_admin_1', role: 'league_admin' });

    const response = await POST(request('{'));

    expect(response.status).toBe(400);
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('rejects oversized JSON before touching Firestore', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'league_admin_1', role: 'league_admin' });

    const response = await POST(request(JSON.stringify({
      action: 'create_team_invitation',
      teamId: 'team_1',
      leagueId: 'league_1',
      seasonId: 'season_1',
      invitedEmail: `${'a'.repeat(65 * 1024)}@example.com`,
    })));

    expect(response.status).toBe(413);
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('requires League Admin access before creating an invitation', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'fan_1', role: 'fan' });

    const response = await POST(request(JSON.stringify({
      action: 'create_team_invitation',
      teamId: 'team_1',
      leagueId: 'league_1',
      seasonId: 'season_1',
      invitedEmail: 'team-admin@example.com',
    })));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'League Admin access required.' });
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('allows scoped League Admins to create teams for their league', async () => {
    const transaction = {
      get: vi.fn(async () => snapshot('team_1', undefined)),
      set: vi.fn(),
      update: vi.fn(),
    };
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'league_admin_1', role: 'league_admin' });
    vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction) as never);
    installFirestoreMock({
      'leagues/league_1': { id: 'league_1', adminUserIds: [] },
      'accessIndex/league_league_1_league_admin_1': {
        userId: 'league_admin_1',
        scopeType: 'league',
        scopeId: 'league_1',
        capabilities: ['league.team.create'],
      },
    });

    const response = await POST(request(JSON.stringify({
      action: 'create_teams',
      teams: [teamPayload],
    })));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: 'team_1', count: 1 });
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({ id: 'team_1' }), expect.objectContaining({
      id: 'team_1',
      leagueId: 'league_1',
      adminUserIds: [],
    }));
  });

  it('rejects League Admin team creation when scoped access belongs elsewhere', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'league_admin_1', role: 'league_admin' });
    installFirestoreMock({
      'leagues/league_1': { id: 'league_1', adminUserIds: [] },
      'accessIndex/league_league_2_league_admin_1': {
        userId: 'league_admin_1',
        scopeType: 'league',
        scopeId: 'league_2',
        capabilities: ['league.team.create'],
      },
    });

    const response = await POST(request(JSON.stringify({
      action: 'create_teams',
      teams: [teamPayload],
    })));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'You do not manage league league_1.' });
    expect(adminDb.runTransaction).not.toHaveBeenCalled();
  });

  it('allows scoped League Admins to invite a Team Admin for their league', async () => {
    const transaction = {
      get: vi.fn(async () => snapshot('invite_1', undefined)),
      set: vi.fn(),
    };
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'league_admin_1',
      role: 'league_admin',
      email: 'league@example.com',
      name: 'League Admin',
    });
    vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction) as never);
    vi.mocked(sendTeamInvitationEmail).mockResolvedValue({ status: 'sent', id: 'email_1' });
    installFirestoreMock({
      'leagues/league_1': { id: 'league_1', name: 'Kampala League', adminUserIds: [] },
      'teams/team_1': { id: 'team_1', name: 'Kampala Testers', leagueId: 'league_1' },
      'seasons/season_1': { id: 'season_1', name: '2027 Season' },
      'accessIndex/league_league_1_league_admin_1': {
        userId: 'league_admin_1',
        scopeType: 'league',
        scopeId: 'league_1',
        capabilities: ['league.team_admin.invite'],
      },
    });

    const response = await POST(request(JSON.stringify({
      action: 'create_team_invitation',
      teamId: 'team_1',
      leagueId: 'league_1',
      seasonId: 'season_1',
      invitedEmail: 'teamadmin@example.com',
    })));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      emailDelivery: 'sent',
      emailMessageId: 'email_1',
    });
    expect(body.actionUrl).toContain('/invitations/access/invite_');
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'invitations',
    }), expect.objectContaining({
      type: 'team_admin',
      roleKey: 'team_admin',
      scopeType: 'team',
      scopeId: 'team_1',
      permissionBundleId: 'full_team_admin',
      invitedByUserId: 'league_admin_1',
      invitedEmail: 'teamadmin@example.com',
    }));
    expect(sendTeamInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'teamadmin@example.com',
      teamName: 'Kampala Testers',
      leagueName: 'Kampala League',
      seasonName: '2027 Season',
    }));
  });

  it('records audited team moderation through the trusted admin route', async () => {
    const transaction = {
      get: vi.fn(async (ref: { collectionName: string; id: string }) => snapshot(ref.id, {
        id: 'team_1',
        name: 'Kampala Testers',
      })),
      set: vi.fn(),
      update: vi.fn(),
    };
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'platform_1', role: 'platform_admin' });
    vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction) as never);
    installFirestoreMock({});

    const response = await POST(request(JSON.stringify({
      action: 'update_team_profile',
      teamId: 'team_1',
      verificationStatus: 'rejected',
      verified: false,
      plan: 'free',
    })));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: 'team_1' });
    expect(transaction.update).toHaveBeenCalledWith(expect.objectContaining({ collectionName: 'teams', id: 'team_1' }), expect.objectContaining({
      verificationStatus: 'rejected',
      verified: false,
      plan: 'free',
    }));
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({ collectionName: 'adminAuditEvents' }), expect.objectContaining({
      actorUserId: 'platform_1',
      action: 'blocked',
      targetCollection: 'teams',
      targetId: 'team_1',
    }));
  });

  it('rejects team moderation from non-platform admins', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'league_admin_1', role: 'league_admin' });

    const response = await POST(request(JSON.stringify({
      action: 'update_team_profile',
      teamId: 'team_1',
      verificationStatus: 'verified',
    })));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Platform Admin access required.' });
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('records audited account lifecycle changes through the trusted admin route', async () => {
    const transaction = {
      get: vi.fn(async (ref: { collectionName: string; id: string }) => snapshot(ref.id, {
        id: 'user_1',
        role: 'fan',
      })),
      set: vi.fn(),
      update: vi.fn(),
    };
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'platform_1', role: 'platform_admin' });
    vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction) as never);
    installFirestoreMock({});

    const response = await POST(request(JSON.stringify({
      action: 'update_user_account',
      userId: 'user_1',
      accountStatus: 'suspended',
    })));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: 'user_1' });
    expect(transaction.update).toHaveBeenCalledWith(expect.objectContaining({ collectionName: 'users', id: 'user_1' }), expect.objectContaining({
      accountStatus: 'suspended',
      status: 'suspended',
    }));
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({ collectionName: 'adminAuditEvents' }), expect.objectContaining({
      actorUserId: 'platform_1',
      action: 'suspended',
      targetCollection: 'users',
      targetId: 'user_1',
    }));
  });

  it('rejects access assignment lifecycle changes from non-platform admins', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'league_admin_1', role: 'league_admin' });

    const response = await POST(request(JSON.stringify({
      action: 'transition_access_assignment',
      assignmentId: 'assignment_1',
      status: 'suspended',
    })));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Platform Admin access required.' });
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('rebuilds scoped access projections when an assignment is suspended', async () => {
    const assignmentA = {
      id: 'assignment_a',
      userId: 'operator_1',
      roleKey: 'team_admin',
      scopeType: 'team',
      scopeId: 'team_1',
      permissionBundleId: 'full_team_admin',
      status: 'active',
      grantedByUserId: 'league_admin_1',
      validFrom: '2026-07-30T00:00:00.000Z',
      createdAt: '2026-07-30T00:00:00.000Z',
      updatedAt: '2026-07-30T00:00:00.000Z',
    };
    const assignmentB = {
      ...assignmentA,
      id: 'assignment_b',
      roleKey: 'result_reporter',
      permissionBundleId: 'results_only',
    };
    const scopedQuery = { kind: 'scopedAssignments' };
    const collectionMock = (collectionName: string) => ({
      doc: vi.fn((id = `${collectionName}_generated`) => ({
        collectionName,
        id,
        get: vi.fn(async () => snapshot(id, undefined)),
      })),
      where: vi.fn(() => ({
        where: vi.fn(() => ({
          where: vi.fn(() => scopedQuery),
        })),
      })),
    });
    const transaction = {
      get: vi.fn(async (ref: { id?: string; kind?: string }) => {
        if (ref.kind === 'scopedAssignments') {
          return {
            docs: [
              { id: 'assignment_a', data: () => assignmentA },
              { id: 'assignment_b', data: () => assignmentB },
            ],
          };
        }
        return snapshot(ref.id ?? 'assignment_a', assignmentA);
      }),
      set: vi.fn(),
      update: vi.fn(),
    };

    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'platform_1', role: 'platform_admin' });
    vi.mocked(adminDb.collection).mockImplementation(collectionMock as never);
    vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction) as never);

    const response = await POST(request(JSON.stringify({
      action: 'transition_access_assignment',
      assignmentId: 'assignment_a',
      status: 'suspended',
      note: 'Season role ended.',
    })));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      id: 'assignment_a',
      status: 'suspended',
    });
    expect(transaction.update).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'accessAssignments',
      id: 'assignment_a',
    }), expect.objectContaining({
      status: 'suspended',
    }));
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'accessIndex',
      id: 'team_team_1_operator_1',
    }), expect.objectContaining({
      userId: 'operator_1',
      scopeType: 'team',
      scopeId: 'team_1',
      activeRoles: ['result_reporter'],
      assignmentIds: ['assignment_b'],
      capabilities: expect.arrayContaining(['team.result.submit']),
    }), { merge: false });
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'adminAuditEvents',
    }), expect.objectContaining({
      actorUserId: 'platform_1',
      action: 'suspended',
      targetCollection: 'accessAssignments',
      targetId: 'assignment_a',
    }));
  });
});
