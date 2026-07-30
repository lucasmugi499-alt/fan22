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
  return new Request('https://goalplace256.test/api/athlete-claims', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body,
  });
}

describe('athlete claims route hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated claim actions before parsing or touching Firestore', async () => {
    const response = await POST(request('{', ''));

    expect(response.status).toBe(401);
    expect(adminAuth.verifyIdToken).not.toHaveBeenCalled();
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON before touching Firestore', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'fan_1', role: 'fan', email_verified: true });

    const response = await POST(request('{'));

    expect(response.status).toBe(400);
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('rejects oversized claim bodies before touching Firestore', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'fan_1', role: 'fan', email_verified: true });

    const response = await POST(request(JSON.stringify({
      action: 'reject',
      claimId: 'claim_1',
      reason: 'x'.repeat(5 * 1024),
    })));

    expect(response.status).toBe(413);
    expect(adminDb.collection).not.toHaveBeenCalled();
  });
});
