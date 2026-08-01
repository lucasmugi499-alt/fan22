import { createHash } from 'node:crypto';
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
  });

  it('rejects unauthenticated requests before parsing or touching Firestore', async () => {
    const response = await POST(request('{', ''));

    expect(response.status).toBe(401);
    expect(adminAuth.verifyIdToken).not.toHaveBeenCalled();
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON before touching Firestore', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'team_admin_1', role: 'fan', email_verified: true });

    const response = await POST(request('{'));

    expect(response.status).toBe(400);
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('rejects oversized JSON before touching Firestore', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'team_admin_1', role: 'fan', email_verified: true });

    const response = await POST(request(JSON.stringify({
      action: 'accept_team_invitation',
      assignmentId: 'assignment_1',
      token: 'x'.repeat(5 * 1024),
    })));

    expect(response.status).toBe(413);
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('requires Platform Admin access before approving a League Admin', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'league_admin_1', role: 'league_admin' });

    const response = await POST(request(JSON.stringify({
      action: 'approve_league_admin',
      applicationId: 'application_1',
    })));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Platform Admin access required.' });
    expect(adminDb.collection).not.toHaveBeenCalled();
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
      error: 'Fan accounts stay fan accounts. Sign out and set up a League Admin or Team Admin account with this invitation.',
    });
    expect(adminDb.runTransaction).not.toHaveBeenCalled();
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
      error: 'Fan accounts stay fan accounts. Sign out and set up a League Admin or Team Admin account with this invitation.',
    });
    expect(adminDb.runTransaction).not.toHaveBeenCalled();
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
      error: 'Fan accounts stay fan accounts. Sign out and set up a League Admin or Team Admin account with this invitation.',
    });
    expect(adminDb.runTransaction).not.toHaveBeenCalled();
    expect(adminAuth.setCustomUserClaims).not.toHaveBeenCalled();
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
    }));
  });
});
