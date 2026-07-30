import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { POST } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
  },
  adminDb: {
    collection: vi.fn(),
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
});
