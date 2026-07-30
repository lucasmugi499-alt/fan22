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
});
