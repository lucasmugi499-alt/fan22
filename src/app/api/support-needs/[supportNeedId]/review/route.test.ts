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
  return new Request('https://goalplace256.test/api/support-needs/need_1/review', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body,
  });
}

const context = {
  params: Promise.resolve({ supportNeedId: 'need_1' }),
};

describe('support need review route hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated reviews before parsing or touching Firestore', async () => {
    const response = await POST(request('{', ''), context);

    expect(response.status).toBe(401);
    expect(adminAuth.verifyIdToken).not.toHaveBeenCalled();
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON before touching Firestore', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'team_admin_1', role: 'team_admin' });

    const response = await POST(request('{'), context);

    expect(response.status).toBe(400);
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('rejects oversized review bodies before touching Firestore', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'team_admin_1', role: 'team_admin' });

    const response = await POST(request(JSON.stringify({
      supportNeedId: 'need_1',
      actorUserId: 'team_admin_1',
      action: 'team_reject',
      note: 'x'.repeat(5 * 1024),
    })), context);

    expect(response.status).toBe(413);
    expect(adminDb.collection).not.toHaveBeenCalled();
  });
});
