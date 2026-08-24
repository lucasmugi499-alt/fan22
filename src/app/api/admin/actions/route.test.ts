import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { sendTeamInvitationEmail } from '@/server/email/teamInvitation';
import { POST } from './route';
import { expectNoDomainCollectionAccess, expectNoDomainTransaction } from '@/test/firestoreAssertions';

/** Batch writes back the access projector, which suspension now rebuilds. */
const batchWrites: { op: string; id: string }[] = [];

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
    revokeRefreshTokens: vi.fn(),
    updateUser: vi.fn(),
  },
  adminDb: {
    collection: vi.fn(),
    runTransaction: vi.fn(),
    batch: () => ({
      set: (ref: { id?: string }) => { batchWrites.push({ op: 'set', id: ref?.id ?? '' }); },
      delete: (ref: { id?: string }) => { batchWrites.push({ op: 'delete', id: ref?.id ?? '' }); },
      commit: async () => undefined,
    }),
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
  const allRecords: Record<string, Record<string, unknown>> = {
    'users/platform_1': {
      id: 'platform_1',
      uid: 'platform_1',
      role: 'platform_admin',
      accountClass: 'platform_operator',
      accountStatus: 'active',
      status: 'active',
    },
    // The platform commands are capability-gated, and holding the platform_admin role no
    // longer implies any capability. A provisioned operator fixture has to carry the same
    // grants a real account carries, or these tests would only ever prove the 403 path.
    'accessIndex/platform_global_platform_1': {
      userId: 'platform_1',
      scopeType: 'platform',
      scopeId: 'global',
      capabilities: [
        'platform.admin.manage',
        'platform.audit.read',
        'platform.organization.create',
        'platform.organizations.identity.manage',
        'platform.verification.team.manage',
        'platform.accounts.lifecycle',
        'platform.application.review',
        'platform.access.revoke',
        'platform.access.manage',
        'platform.trust.decide',
      ],
    },
    ...records,
  };
  vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => {
    // `where(...).get()` backs the suspension path, which now suspends a user's canonical
    // assignments before rebuilding their projections. Records are matched from the same
    // fixture map so a test can seed assignments and see them suspended.
    const query = (clauses: [string, unknown][] = []) => ({
      where: (field: string, _op: string, value: unknown) => query([...clauses, [field, value]]),
      get: vi.fn(async () => {
        const docs = Object.entries(allRecords)
          .filter(([key]) => key.startsWith(`${collectionName}/`))
          .map(([key, data]) => ({ id: key.split('/')[1], data: () => data, ref: { update: vi.fn(async () => undefined) } }))
          .filter((entry) => clauses.every(([field, value]) => (entry.data() as Record<string, unknown>)?.[field] === value));
        return { docs, size: docs.length, empty: docs.length === 0 };
      }),
    });
    return {
      doc: (id = `${collectionName}_generated`) => ({
        collectionName,
        id,
        get: vi.fn(async () => snapshot(id, allRecords[`${collectionName}/${id}`])),
        set: vi.fn(async () => undefined),
        update: vi.fn(async () => undefined),
      }),
      where: (field: string, op: string, value: unknown) => query().where(field, op, value),
      add: vi.fn(async () => ({ id: `${collectionName}_added` })),
    } as never;
  });
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
    expectNoDomainCollectionAccess(vi.mocked(adminDb.collection));
  });

  it('rejects invalid JSON before touching Firestore', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'league_admin_1', role: 'league_admin' });

    const response = await POST(request('{'));

    expect(response.status).toBe(400);
    expectNoDomainCollectionAccess(vi.mocked(adminDb.collection));
  });

  it('rejects oversized JSON before touching Firestore', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'league_admin_1', role: 'league_admin' });

    const response = await POST(request(JSON.stringify({
      action: 'create_team_invitation',
      teamId: 'team_1',
      leagueId: 'league_1',
      seasonId: 'season_1',
      invitedEmail: `${'a'.repeat(513 * 1024)}@example.com`,
    })));

    expect(response.status).toBe(413);
    expectNoDomainCollectionAccess(vi.mocked(adminDb.collection));
  });

  /**
   * ADR-004, Stage B. The action is refused before authorization is even considered, because
   * there is no longer anything on the other side of it to authorize. A 410 rather than a
   * 403 so a caller can tell "this is gone" from "you may not".
   */
  it('refuses to create a Team Admin invitation at all', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'league_admin_1', role: 'league_admin' });

    const response = await POST(request(JSON.stringify({
      action: 'create_team_invitation',
      teamId: 'team_1',
      leagueId: 'league_1',
      seasonId: 'season_1',
      invitedEmail: 'team-admin@example.com',
    })));

    expect(response.status).toBe(410);
    expect((await response.json()).error).toContain('League Operations');
    expectNoDomainCollectionAccess(vi.mocked(adminDb.collection));
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
    expectNoDomainTransaction(vi.mocked(adminDb.runTransaction));
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
      note: 'Fraudulent team evidence.',
    })));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, id: 'team_1', requestId: expect.any(String) });
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
    expectNoDomainCollectionAccess(vi.mocked(adminDb.collection));
  });

  it('strips a suspended account of its authority, not just its status flag', async () => {
    /**
     * The C2 defect: suspension updated the user record and revoked refresh tokens, and
     * stopped there. Every accessIndex projection stayed exactly as it was, so Firestore
     * Rules and every capability check went on granting the suspended operator's
     * capabilities from a projection nobody had told about the suspension.
     *
     * The console said "suspended" while the principal still held operational authority.
     */
    const transaction = {
      get: vi.fn(async (ref: { collectionName: string; id: string }) => snapshot(ref.id, { id: 'user_1', role: 'team_admin' })),
      set: vi.fn(),
      update: vi.fn(),
    };
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'platform_1', role: 'platform_admin' });
    vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction) as never);
    batchWrites.length = 0;
    installFirestoreMock({
      'accessAssignments/assignment_live': {
        id: 'assignment_live',
        userId: 'user_1',
        status: 'active',
        scopeType: 'team',
        scopeId: 'team_a',
        roleKey: 'team_admin',
      },
    });

    const response = await POST(request(JSON.stringify({
      action: 'update_user_account',
      userId: 'user_1',
      accountStatus: 'suspended',
      note: 'Credential compromise reported by the club.',
    })));

    expect(response.status).toBe(200);
    // Refresh tokens revoked — necessary, and on its own never sufficient.
    expect(adminAuth.revokeRefreshTokens).toHaveBeenCalledWith('user_1');
    // The projector ran, which is what actually removes the standing grant.
    expect(batchWrites.length).toBeGreaterThan(0);
    // And the suspension of authority is itself auditable.
    expect(vi.mocked(adminDb.collection).mock.calls.map((call) => String(call[0])))
      .toContain('accessAssignments');
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
      note: 'Reported shared login risk.',
    })));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, id: 'user_1', requestId: expect.any(String) });
    expect(transaction.update).toHaveBeenCalledWith(expect.objectContaining({ collectionName: 'users', id: 'user_1' }), expect.objectContaining({
      accountStatus: 'suspended',
      status: 'suspended',
      accessVersion: expect.anything(),
    }));
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({ collectionName: 'adminAuditEvents' }), expect.objectContaining({
      actorUserId: 'platform_1',
      action: 'suspended',
      targetCollection: 'users',
      targetId: 'user_1',
      note: 'Reported shared login risk.',
    }));
    expect(adminAuth.revokeRefreshTokens).toHaveBeenCalledWith('user_1');
    expect(adminAuth.updateUser).not.toHaveBeenCalled();
  });

  it('requires a reason before account lifecycle changes', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'platform_1', role: 'platform_admin' });
    installFirestoreMock({});

    const response = await POST(request(JSON.stringify({
      action: 'update_user_account',
      userId: 'user_1',
      accountStatus: 'suspended',
    })));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'A clear audit reason is required for this Platform Admin command.' });
    expectNoDomainTransaction(vi.mocked(adminDb.runTransaction));
  });

  it('requires a dedicated Platform Operator account for platform commands', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'platform_1', role: 'platform_admin' });
    installFirestoreMock({
      'users/platform_1': {
        id: 'platform_1',
        role: 'platform_admin',
        accountClass: 'fan',
        accountStatus: 'active',
      },
    });

    const response = await POST(request(JSON.stringify({
      action: 'update_user_account',
      userId: 'user_1',
      accountStatus: 'suspended',
      note: 'Reported shared login risk.',
    })));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'A dedicated Platform Operator account is required.' });
    expectNoDomainTransaction(vi.mocked(adminDb.runTransaction));
  });

  it('lets a scoped Organization Operator create a season through the trusted command', async () => {
    const transaction = {
      get: vi.fn(async (ref: { collectionName: string; id: string }) => snapshot(ref.id, undefined)),
      set: vi.fn(),
      update: vi.fn(),
    };
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'league_admin_1', role: 'league_admin' });
    vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction) as never);
    installFirestoreMock({
      'users/league_admin_1': {
        id: 'league_admin_1',
        role: 'league_admin',
        accountClass: 'organization_operator',
        accountStatus: 'active',
      },
      'leagues/league_1': { id: 'league_1', adminUserIds: [] },
      'accessIndex/league_league_1_league_admin_1': {
        userId: 'league_admin_1',
        scopeType: 'league',
        scopeId: 'league_1',
        capabilities: ['league.season.manage'],
      },
    });

    const response = await POST(request(JSON.stringify({
      action: 'create_season',
      id: 'season_2027',
      leagueId: 'league_1',
      name: '2027 Regular Season',
      sport: 'football',
      status: 'registration',
      startDate: '2027-01-16T00:00:00.000Z',
      competitionFormat: 'league',
      scoring: { win: 3, draw: 1, loss: 0 },
    })));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, id: 'season_2027', requestId: expect.any(String) });
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'seasons',
      id: 'season_2027',
    }), expect.objectContaining({
      leagueId: 'league_1',
      name: '2027 Regular Season',
      status: 'registration',
    }));
    expect(transaction.update).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'leagues',
      id: 'league_1',
    }), expect.objectContaining({
      currentSeasonId: 'season_2027',
      season: '2027 Regular Season',
    }));
  });

  it('rejects season creation when the Organization Operator lacks the league scope', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'league_admin_1', role: 'league_admin' });
    installFirestoreMock({
      'users/league_admin_1': {
        id: 'league_admin_1',
        role: 'league_admin',
        accountClass: 'organization_operator',
        accountStatus: 'active',
      },
      'leagues/league_1': { id: 'league_1', adminUserIds: [] },
    });

    const response = await POST(request(JSON.stringify({
      action: 'create_season',
      id: 'season_2027',
      leagueId: 'league_1',
      name: '2027 Regular Season',
      sport: 'football',
      status: 'registration',
      startDate: '2027-01-16T00:00:00.000Z',
      competitionFormat: 'league',
      scoring: { win: 3, draw: 1, loss: 0 },
    })));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'You do not manage this league.' });
    expectNoDomainTransaction(vi.mocked(adminDb.runTransaction));
  });

  it('creates fixtures through a scoped trusted command with pending result state', async () => {
    const transaction = {
      get: vi.fn(async (ref: { collectionName: string; id: string }) => {
        if (ref.collectionName === 'seasons') return snapshot(ref.id, { id: ref.id, leagueId: 'league_1', status: 'active' });
        if (ref.collectionName === 'teams') return snapshot(ref.id, { id: ref.id, leagueId: 'league_1' });
        return snapshot(ref.id, undefined);
      }),
      set: vi.fn(),
      update: vi.fn(),
    };
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'league_admin_1', role: 'league_admin' });
    vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction) as never);
    installFirestoreMock({
      'users/league_admin_1': {
        id: 'league_admin_1',
        role: 'league_admin',
        accountClass: 'organization_operator',
        accountStatus: 'active',
      },
      'leagues/league_1': { id: 'league_1', adminUserIds: [] },
      'accessIndex/league_league_1_league_admin_1': {
        userId: 'league_admin_1',
        scopeType: 'league',
        scopeId: 'league_1',
        capabilities: ['league.season.manage'],
      },
    });

    const response = await POST(request(JSON.stringify({
      action: 'create_fixtures',
      fixtures: [{
        id: 'match_1',
        sport: 'football',
        leagueId: 'league_1',
        seasonId: 'season_1',
        homeTeamId: 'team_home',
        awayTeamId: 'team_away',
        venue: 'Kampala Ground',
        city: 'Kampala',
        scheduledAt: '2027-01-16T15:00:00.000Z',
        status: 'scheduled',
        score: { home: null, away: null },
        verificationStatus: 'pending',
      }],
    })));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, id: 'match_1', count: 1, requestId: expect.any(String) });
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'matches',
      id: 'match_1',
    }), expect.objectContaining({
      leagueId: 'league_1',
      seasonId: 'season_1',
      score: { home: null, away: null },
      verificationStatus: 'pending',
    }));
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'adminAuditEvents',
    }), expect.objectContaining({
      actorUserId: 'league_admin_1',
      action: 'created',
      targetCollection: 'matches',
      targetId: 'match_1',
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
    expectNoDomainCollectionAccess(vi.mocked(adminDb.collection));
  });

  it('rebuilds scoped access projections when an assignment is suspended', async () => {
    const assignmentA = {
      id: 'assignment_a',
      userId: 'operator_1',
      roleKey: 'league_admin',
      scopeType: 'league',
      scopeId: 'league_1',
      permissionBundleId: 'league_admin',
      status: 'active',
      grantedByUserId: 'league_admin_1',
      validFrom: '2026-07-30T00:00:00.000Z',
      createdAt: '2026-07-30T00:00:00.000Z',
      updatedAt: '2026-07-30T00:00:00.000Z',
    };
    const assignmentB = {
      ...assignmentA,
      id: 'assignment_b',
      roleKey: 'league_owner',
      permissionBundleId: 'league_owner',
    };
    const scopedQuery = { kind: 'scopedAssignments' };
    const collectionMock = (collectionName: string) => ({
      doc: vi.fn((id = `${collectionName}_generated`) => ({
        collectionName,
        id,
        get: vi.fn(async () => snapshot(
          id,
          collectionName === 'users' && id === 'platform_1'
            ? {
                id: 'platform_1',
                role: 'platform_admin',
                accountClass: 'platform_operator',
                accountStatus: 'active',
              }
            // transition_access_assignment is gated on platform.access.manage, and the
            // role no longer implies it.
            : collectionName === 'accessIndex' && id === 'platform_global_platform_1'
              ? { capabilities: ['platform.access.manage'] }
              : undefined,
        )),
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
    expect(await response.json()).toMatchObject({
      ok: true,
      id: 'assignment_a',
      status: 'suspended',
      requestId: expect.any(String),
    });
    expect(transaction.update).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'accessAssignments',
      id: 'assignment_a',
    }), expect.objectContaining({
      status: 'suspended',
    }));
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'accessIndex',
      id: 'league_league_1_operator_1',
    }), expect.objectContaining({
      userId: 'operator_1',
      scopeType: 'league',
      scopeId: 'league_1',
      activeRoles: ['league_owner'],
      assignmentIds: ['assignment_b'],
      capabilities: expect.arrayContaining(['ownership.transfer']),
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
