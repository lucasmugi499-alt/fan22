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

function request(body: string, token = 'token') {
  return new Request('https://goalplace256.test/api/athletes', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body,
  });
}

describe('athlete creation route hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated athlete creation before parsing or touching Firestore', async () => {
    const response = await POST(request('{', ''));

    expect(response.status).toBe(401);
    expect(adminAuth.verifyIdToken).not.toHaveBeenCalled();
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('requires Team Admin access before parsing or touching Firestore', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'fan_1', role: 'fan' });

    const response = await POST(request('{'));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Team Admin access required.' });
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON before touching Firestore', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'team_admin_1', role: 'team_admin' });

    const response = await POST(request('{'));

    expect(response.status).toBe(400);
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('rejects oversized athlete creation bodies before touching Firestore', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'team_admin_1', role: 'team_admin' });

    const response = await POST(request(JSON.stringify({
      teamId: 'team_1',
      name: 'A'.repeat(5 * 1024),
      position: 'Forward',
      ageGroup: 'Senior',
    })));

    expect(response.status).toBe(413);
    expect(adminDb.collection).not.toHaveBeenCalled();
  });
});
