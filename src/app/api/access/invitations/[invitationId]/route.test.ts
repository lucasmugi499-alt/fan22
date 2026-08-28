import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { GET } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
  },
  adminDb: {
    collection: vi.fn(),
  },
}));

function request(token = 'invite_token', kind?: string) {
  const url = new URL('https://goalplace256.test/api/access/invitations/invite_1');
  if (token) url.searchParams.set('token', token);
  if (kind) url.searchParams.set('kind', kind);
  return new Request(url, {
    method: 'GET',
    headers: { authorization: 'Bearer auth_token' },
  });
}

function context(invitationId = 'invite_1') {
  return { params: Promise.resolve({ invitationId }) };
}

function mockDoc(collectionName: string, data: Record<string, unknown> | undefined) {
  const update = vi.fn();
  vi.mocked(adminDb.collection).mockImplementation((requestedCollection: string) => ({
    doc: vi.fn((id: string) => ({
      id,
      update,
      get: vi.fn(async () => ({
        id,
        exists: requestedCollection === collectionName && Boolean(data),
        data: () => data,
      })),
    })),
  }) as never);
  return update;
}

describe('safe invitation preview route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'operator_1',
      email: 'operator@example.com',
      role: 'team_admin',
    });
  });

  it('returns only safe invitation fields for a matching token and email', async () => {
    const update = mockDoc('invitations', {
      id: 'invite_1',
      type: 'team_admin',
      invitedEmail: 'operator@example.com',
      roleKey: 'team_admin',
      scopeType: 'team',
      scopeId: 'team_1',
      permissionBundleId: 'full_team_admin',
      tokenHash: createHash('sha256').update('invite_token').digest('hex'),
      status: 'sent',
      invitedByUserId: 'league_admin_1',
      expiresAt: '2026-09-09T00:00:00.000Z',
      createdAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
    });

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toMatchObject({
      id: 'invite_1',
      invitedEmail: 'operator@example.com',
      roleKey: 'team_admin',
      scopeType: 'team',
      scopeId: 'team_1',
      status: 'viewed',
    });
    expect(body.tokenHash).toBeUndefined();
    expect(body.tokenVersion).toBeUndefined();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'viewed' }));
  });

  it('rejects previews for the wrong signed-in email', async () => {
    mockDoc('invitations', {
      invitedEmail: 'other@example.com',
      tokenHash: createHash('sha256').update('invite_token').digest('hex'),
    });

    const response = await GET(request(), context());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Sign in with the email address that received this invitation.',
    });
  });

  it('can preview legacy team assignments without exposing token fields', async () => {
    mockDoc('teamAssignments', {
      id: 'team_assignment_1',
      teamId: 'team_1',
      leagueId: 'league_1',
      seasonId: 'season_1',
      role: 'team_admin',
      status: 'invited',
      invitedEmail: 'operator@example.com',
      tokenHash: createHash('sha256').update('invite_token').digest('hex'),
      expiresAt: '2026-08-09T00:00:00.000Z',
    });

    const response = await GET(request('invite_token', 'team'), context('team_assignment_1'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      id: 'team_assignment_1',
      teamId: 'team_1',
      leagueId: 'league_1',
      seasonId: 'season_1',
      role: 'team_admin',
      status: 'invited',
    });
    expect(body.tokenHash).toBeUndefined();
  });
});
