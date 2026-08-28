import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { allowingRateLimitTransaction } from '@/test/rateLimitMock';
import { POST } from './route';
import { expectNoDomainCollectionAccess, expectNoDomainTransaction } from '@/test/firestoreAssertions';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
    getUser: vi.fn(),
    getUserByEmail: vi.fn(),
    setCustomUserClaims: vi.fn(),
  },
  adminDb: {
    collection: vi.fn(),
    runTransaction: vi.fn(),
  },
}));

function request(body: string, token = 'token') {
  return new Request('https://goalplace256.test/api/access', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body,
  });
}

describe('trusted access route hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminDb.runTransaction).mockImplementation(allowingRateLimitTransaction() as never);
    // The shared mutation wrapper rate-limits before the handler runs, so every case
    // needs a Firestore stand-in even when the request is rejected on authorization.
    vi.mocked(adminDb.collection).mockImplementation(() => ({
      doc: vi.fn((id: string) => ({
        id,
        get: vi.fn().mockResolvedValue({ exists: false, data: () => undefined }),
      })),
    }) as never);
  });

  it('rejects unauthenticated requests before parsing or touching Firestore', async () => {
    const response = await POST(request('{', ''));

    expect(response.status).toBe(401);
    expect(adminAuth.verifyIdToken).not.toHaveBeenCalled();
    expectNoDomainCollectionAccess(vi.mocked(adminDb.collection));
  });

  it('rejects invalid JSON before touching Firestore', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'team_admin_1', role: 'fan', email_verified: true });

    const response = await POST(request('{'));

    expect(response.status).toBe(400);
    expectNoDomainCollectionAccess(vi.mocked(adminDb.collection));
  });

  it('rejects oversized JSON before touching Firestore', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'team_admin_1', role: 'fan', email_verified: true });

    const response = await POST(request(JSON.stringify({
      action: 'accept_team_invitation',
      assignmentId: 'assignment_1',
      token: 'x'.repeat(5 * 1024),
    })));

    expect(response.status).toBe(413);
    expectNoDomainCollectionAccess(vi.mocked(adminDb.collection));
  });

  it('requires Platform Admin access before approving a League Admin', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'league_admin_1', role: 'league_admin' });

    const response = await POST(request(JSON.stringify({
      action: 'approve_league_admin',
      applicationId: 'application_1',
    })));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Platform Admin access required.' });
    expectNoDomainCollectionAccess(vi.mocked(adminDb.collection));
  });

  it('prevents fan accounts from accepting scoped operator invitations', async () => {
    const token = 'operator_invitation_token';
    const tokenHash = createHash('sha256').update(token).digest('hex');
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'fan_1',
      role: 'fan',
      email: 'fan@example.com',
      email_verified: true,
    });
    vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => ({
      doc: vi.fn((id: string) => ({
        id,
        get: vi.fn().mockResolvedValue({
          exists: collectionName === 'invitations',
          data: () => ({
            id,
            roleKey: 'league_owner',
            scopeType: 'league',
            scopeId: 'league_1',
            permissionBundleId: 'league_owner',
            invitedByUserId: 'platform_admin_1',
            invitedEmail: 'fan@example.com',
            tokenHash,
            status: 'sent',
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          }),
        }),
      })),
    }) as never);

    const response = await POST(request(JSON.stringify({
      action: 'accept_invitation',
      invitationId: 'invite_league_owner_1',
      token,
    })));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'This invitation requires a GoalPlace256 Organization Operator account. Sign out and create or access your operator account using the invited email.',
    });
    expectNoDomainTransaction(vi.mocked(adminDb.runTransaction));
    expect(adminAuth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('prevents Firestore fan profiles from accepting operator invitations even without a custom role claim', async () => {
    const token = 'operator_invitation_token';
    const tokenHash = createHash('sha256').update(token).digest('hex');
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'fan_1',
      email: 'fan@example.com',
      email_verified: true,
    });
    vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => ({
      doc: vi.fn((id: string) => ({
        id,
        get: vi.fn().mockResolvedValue({
          exists: collectionName === 'invitations' || collectionName === 'users',
          data: () => collectionName === 'users'
            ? { uid: 'fan_1', role: 'fan', accountStatus: 'active' }
            : {
              id,
              roleKey: 'league_owner',
              scopeType: 'league',
              scopeId: 'league_1',
              permissionBundleId: 'league_owner',
              invitedByUserId: 'platform_admin_1',
              invitedEmail: 'fan@example.com',
              tokenHash,
              status: 'sent',
              expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
            },
        }),
      })),
    }) as never);

    const response = await POST(request(JSON.stringify({
      action: 'accept_invitation',
      invitationId: 'invite_league_owner_1',
      token,
    })));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'This invitation requires a GoalPlace256 Organization Operator account. Sign out and create or access your operator account using the invited email.',
    });
    expectNoDomainTransaction(vi.mocked(adminDb.runTransaction));
    expect(adminAuth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('prevents fan accounts from accepting legacy Team Admin invitations', async () => {
    const token = 'team_admin_invitation_token';
    const tokenHash = createHash('sha256').update(token).digest('hex');
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'fan_1',
      role: 'fan',
      email: 'fan@example.com',
      email_verified: true,
    });
    vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => ({
      doc: vi.fn((id: string) => ({
        id,
        get: vi.fn().mockResolvedValue({
          exists: collectionName === 'teamAssignments',
          data: () => ({
            id,
            teamId: 'team_1',
            seasonId: 'season_1',
            invitedEmail: 'fan@example.com',
            tokenHash,
            status: 'invited',
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          }),
        }),
      })),
    }) as never);

    const response = await POST(request(JSON.stringify({
      action: 'accept_team_invitation',
      assignmentId: 'team_assignment_1',
      token,
    })));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'This invitation requires a GoalPlace256 Organization Operator account. Sign out and create or access your operator account using the invited email.',
    });
    expectNoDomainTransaction(vi.mocked(adminDb.runTransaction));
    expect(adminAuth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('prevents athlete accounts from accepting scoped operator invitations', async () => {
    const token = 'operator_invitation_token';
    const tokenHash = createHash('sha256').update(token).digest('hex');
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'athlete_1',
      role: 'athlete',
      email: 'athlete@example.com',
      email_verified: true,
    });
    vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => ({
      doc: vi.fn((id: string) => ({
        id,
        get: vi.fn().mockResolvedValue({
          exists: collectionName === 'invitations' || collectionName === 'users',
          data: () => collectionName === 'users'
            ? { uid: 'athlete_1', role: 'athlete', accountClass: 'athlete', accountStatus: 'active' }
            : {
              id,
              roleKey: 'team_admin',
              scopeType: 'team',
              scopeId: 'team_1',
              permissionBundleId: 'full_team_admin',
              invitedByUserId: 'league_admin_1',
              invitedEmail: 'athlete@example.com',
              tokenHash,
              status: 'sent',
              expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
            },
        }),
      })),
    }) as never);

    const response = await POST(request(JSON.stringify({
      action: 'accept_invitation',
      invitationId: 'invite_team_admin_1',
      token,
    })));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'This invitation requires a GoalPlace256 Organization Operator account. Sign out and create or access your operator account using the invited email.',
    });
    expectNoDomainTransaction(vi.mocked(adminDb.runTransaction));
    expect(adminAuth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('lets an Organization Operator accept a league invitation without changing account class', async () => {
    const token = 'operator_invitation_token';
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const invitationData = {
      id: 'invite_league_admin_1',
      roleKey: 'league_admin',
      scopeType: 'league',
      scopeId: 'league_1',
      permissionBundleId: 'league_admin',
      invitedByUserId: 'league_admin_1',
      invitedEmail: 'operator@example.com',
      tokenHash,
      status: 'sent',
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    };
    const scopedQuery = { kind: 'scopedAssignments' };
    const transaction = {
      get: vi.fn(async (ref: { kind?: string }) => ref.kind === 'scopedAssignments'
        ? { docs: [] }
        : {
            exists: true,
            data: () => invitationData,
          }),
      set: vi.fn(),
      update: vi.fn(),
    };

    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'operator_1',
      role: 'league_admin',
      email: 'operator@example.com',
      email_verified: true,
    });
    vi.mocked(adminAuth.getUser).mockResolvedValue({
      uid: 'operator_1',
      customClaims: { role: 'league_admin', accountClass: 'organization_operator' },
    } as never);
    vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction) as never);
    vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => ({
      doc: vi.fn((id = `${collectionName}_generated`) => {
        const ref = { id, collectionName };
        return {
          ...ref,
          get: vi.fn().mockResolvedValue({
            exists: collectionName === 'invitations' || collectionName === 'users',
            data: () => collectionName === 'users'
              ? {
                  uid: 'operator_1',
                  role: 'league_admin',
                  accountClass: 'organization_operator',
                  accountStatus: 'invited',
                }
              : invitationData,
          }),
        };
      }),
      where: vi.fn(() => ({
        where: vi.fn(() => ({
          where: vi.fn(() => scopedQuery),
        })),
      })),
    }) as never);

    const response = await POST(request(JSON.stringify({
      action: 'accept_invitation',
      invitationId: 'invite_league_admin_1',
      token,
    })));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      role: 'league_admin',
      scopeId: 'league_1',
    });
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'users',
      id: 'operator_1',
    }), expect.objectContaining({
      accountClass: 'organization_operator',
      primaryPersona: 'league_admin',
      role: 'league_admin',
      accountStatus: 'active',
    }), { merge: true });
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'accessAssignments',
      id: 'assignment_invite_league_admin_1',
    }), expect.objectContaining({
      userId: 'operator_1',
      roleKey: 'league_admin',
      scopeType: 'league',
      scopeId: 'league_1',
      status: 'active',
    }));
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'accessIndex',
      id: 'league_league_1_operator_1',
    }), expect.objectContaining({
      userId: 'operator_1',
      scopeType: 'league',
      scopeId: 'league_1',
      activeRoles: ['league_admin'],
      assignmentIds: ['assignment_invite_league_admin_1'],
      capabilities: expect.arrayContaining(['league.athlete.manage', 'league.result.enter']),
    }), { merge: false });
  });

  /**
   * ADR-004. A retired bundle is refused by name rather than accepted into an assignment
   * that grants nothing, which the invitee would have no way to distinguish from a bug.
   */
  it('refuses an invitation to a retired Team Admin bundle', async () => {
    const token = 'operator_invitation_token';
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const invitationData = {
      id: 'invite_team_admin_1',
      roleKey: 'team_admin',
      scopeType: 'team',
      scopeId: 'team_1',
      permissionBundleId: 'full_team_admin',
      invitedByUserId: 'league_admin_1',
      invitedEmail: 'operator@example.com',
      tokenHash,
      status: 'sent',
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    };

    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'operator_1',
      role: 'team_admin',
      email: 'operator@example.com',
      email_verified: true,
    });
    vi.mocked(adminAuth.getUser).mockResolvedValue({
      uid: 'operator_1',
      customClaims: { role: 'team_admin', accountClass: 'organization_operator' },
    } as never);
    vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => ({
      doc: vi.fn((id = `${collectionName}_generated`) => ({
        id,
        collectionName,
        get: vi.fn(async () => ({ exists: true, id, data: () => invitationData })),
      })),
    }) as never);

    const response = await POST(request(JSON.stringify({
      action: 'accept_invitation',
      invitationId: 'invite_team_admin_1',
      token,
    })));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('League Operations');
  });

  it('rebuilds access projections when an operator accepts another assignment in the same scope', async () => {
    const token = 'operator_invitation_token';
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const invitationData = {
      id: 'invite_league_admin_2',
      roleKey: 'league_admin',
      scopeType: 'league',
      scopeId: 'league_1',
      permissionBundleId: 'league_admin',
      invitedByUserId: 'league_admin_1',
      invitedEmail: 'operator@example.com',
      tokenHash,
      status: 'sent',
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    };
    const existingAssignment = {
      id: 'assignment_result_reporter_1',
      userId: 'operator_1',
      roleKey: 'league_owner',
      scopeType: 'league',
      scopeId: 'league_1',
      permissionBundleId: 'league_owner',
      status: 'active',
      grantedByUserId: 'league_admin_1',
      validFrom: '2026-07-30T00:00:00.000Z',
      createdAt: '2026-07-30T00:00:00.000Z',
      updatedAt: '2026-07-30T00:00:00.000Z',
    };
    const scopedQuery = { kind: 'scopedAssignments' };
    const transaction = {
      get: vi.fn(async (ref: { kind?: string }) => ref.kind === 'scopedAssignments'
        ? {
            docs: [
              { id: 'assignment_result_reporter_1', data: () => existingAssignment },
            ],
          }
        : {
            exists: true,
            data: () => invitationData,
          }),
      set: vi.fn(),
      update: vi.fn(),
    };

    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'operator_1',
      role: 'league_admin',
      email: 'operator@example.com',
      email_verified: true,
    });
    vi.mocked(adminAuth.getUser).mockResolvedValue({
      uid: 'operator_1',
      customClaims: { role: 'league_admin', accountClass: 'organization_operator' },
    } as never);
    vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction) as never);
    vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => ({
      doc: vi.fn((id = `${collectionName}_generated`) => {
        const ref = { id, collectionName };
        return {
          ...ref,
          get: vi.fn().mockResolvedValue({
            exists: collectionName === 'invitations' || collectionName === 'users',
            data: () => collectionName === 'users'
              ? {
                  uid: 'operator_1',
                  role: 'league_admin',
                  accountClass: 'organization_operator',
                  accountStatus: 'active',
                }
              : invitationData,
          }),
        };
      }),
      where: vi.fn(() => ({
        where: vi.fn(() => ({
          where: vi.fn(() => scopedQuery),
        })),
      })),
    }) as never);

    const response = await POST(request(JSON.stringify({
      action: 'accept_invitation',
      invitationId: 'invite_league_admin_2',
      token,
    })));

    expect(response.status).toBe(200);
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'accessIndex',
      id: 'league_league_1_operator_1',
    }), expect.objectContaining({
      userId: 'operator_1',
      scopeType: 'league',
      scopeId: 'league_1',
      activeRoles: ['league_admin', 'league_owner'],
      assignmentIds: ['assignment_invite_league_admin_2', 'assignment_result_reporter_1'],
      capabilities: expect.arrayContaining([
        'league.athlete.manage',
        'ownership.transfer',
        'league.result.enter',
      ]),
    }), { merge: false });
  });

  it('approves public league applications using the setup email without requiring an applicant auth user', async () => {
    const transaction = {
      get: vi.fn(async () => ({
        exists: true,
        data: () => ({
          id: 'application_public_1',
          userId: 'public_applicant_123',
          applicantEmail: 'owner@example.com',
          leagueName: 'Public Rugby League',
          sport: 'rugby',
          city: 'Jinja',
          status: 'pending',
        }),
      })),
      set: vi.fn(),
      update: vi.fn(),
    };
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'platform_1', role: 'platform_admin' });
    vi.mocked(adminAuth.getUser).mockRejectedValue(new Error('not found'));
    vi.mocked(adminAuth.getUserByEmail).mockRejectedValue(new Error('not found'));
    vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction) as never);
    vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => ({
      doc: vi.fn((id?: string) => ({
        id: id ?? `${collectionName}_generated`,
        collectionName,
        get: vi.fn(async () => collectionName === 'leagueAdminApplications'
          ? {
              exists: true,
              data: () => ({
                id: 'application_public_1',
                userId: 'public_applicant_123',
                applicantEmail: 'owner@example.com',
                leagueName: 'Public Rugby League',
                sport: 'rugby',
                city: 'Jinja',
                status: 'pending',
              }),
            }
          : { exists: false, data: () => undefined }),
      })),
    }) as never);

    const response = await POST(request(JSON.stringify({
      action: 'approve_league_admin',
      applicationId: 'application_public_1',
    })));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      invitationId: expect.stringContaining('invite_'),
    });
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'invitations',
    }), expect.objectContaining({
      roleKey: 'league_owner',
      invitedEmail: 'owner@example.com',
      status: 'queued',
    }));
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'invitationDeliveryAttempts',
    }), expect.objectContaining({
      channel: 'email',
      provider: 'resend',
      status: 'queued',
    }));
  });

  it('returns the existing approval result on retry without creating another organization, league, or invitation', async () => {
    const collections: string[] = [];
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'platform_1', role: 'platform_admin' });
    vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => {
      collections.push(collectionName);
      return {
        doc: vi.fn((id?: string) => ({
          id: id ?? `${collectionName}_generated`,
          collectionName,
          get: vi.fn(async () => collectionName === 'leagueAdminApplications'
            ? {
                exists: true,
                data: () => ({
                  status: 'approved',
                  organizationId: 'org_existing',
                  leagueId: 'league_existing',
                  invitationId: 'invite_existing',
                  invitationActionUrl: '/invitations/access/invite_existing?token=existing',
                }),
              }
            : { exists: false, data: () => undefined }),
        })),
      } as never;
    });

    const response = await POST(request(JSON.stringify({
      action: 'approve_league_admin',
      applicationId: 'application_public_1',
    })));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      leagueId: 'league_existing',
      invitationId: 'invite_existing',
    });
    expect(collections).not.toContain('organizations');
    expect(collections).not.toContain('leagues');
    expect(collections).not.toContain('invitations');
    expect(adminAuth.getUser).not.toHaveBeenCalled();
    expect(adminAuth.getUserByEmail).not.toHaveBeenCalled();
  });

  it('requires a separate operator email before approving a league application tied to an existing Fan account', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'platform_1', role: 'platform_admin' });
    vi.mocked(adminAuth.getUser).mockRejectedValue(new Error('not found'));
    vi.mocked(adminAuth.getUserByEmail).mockResolvedValue({
      uid: 'fan_1',
      customClaims: { role: 'fan' },
    } as never);
    vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => ({
      doc: vi.fn((id?: string) => ({
        id: id ?? `${collectionName}_generated`,
        collectionName,
        get: vi.fn(async () => {
          if (collectionName === 'leagueAdminApplications') {
            return {
              exists: true,
              data: () => ({
                id: 'application_public_1',
                userId: 'public_applicant_123',
                applicantEmail: 'fan@example.com',
                leagueName: 'Public Rugby League',
                sport: 'rugby',
                city: 'Jinja',
                status: 'pending',
              }),
            };
          }
          if (collectionName === 'users') {
            return {
              exists: true,
              data: () => ({ uid: 'fan_1', role: 'fan', accountClass: 'fan' }),
            };
          }
          return { exists: false, data: () => undefined };
        }),
      })),
    }) as never);

    const response = await POST(request(JSON.stringify({
      action: 'approve_league_admin',
      applicationId: 'application_public_1',
    })));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'This email already belongs to a non-operator account. Request a separate operational email before approving this league.',
    });
    expectNoDomainTransaction(vi.mocked(adminDb.runTransaction));
  });
});
