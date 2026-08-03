import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { POST } from './route';
import { expectNoDomainCollectionAccess } from '@/test/firestoreAssertions';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
  },
  adminDb: {
    collection: vi.fn(),
  },
}));

function request(body: string, token = 'token') {
  return new Request('https://goalplace256.test/api/support-needs/need_1/completion', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body,
  });
}

const context = {
  params: Promise.resolve({ supportNeedId: 'need_1' }),
};

describe('support need completion route hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated completion before parsing or touching Firestore', async () => {
    const response = await POST(request('{', ''), context);

    expect(response.status).toBe(401);
    expect(adminAuth.verifyIdToken).not.toHaveBeenCalled();
    expectNoDomainCollectionAccess(vi.mocked(adminDb.collection));
  });

  it('rejects invalid JSON before touching Firestore', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'league_admin_1', role: 'league_admin' });

    const response = await POST(request('{'), context);

    expect(response.status).toBe(400);
    expectNoDomainCollectionAccess(vi.mocked(adminDb.collection));
  });

  it('rejects oversized completion bodies before touching Firestore', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'league_admin_1', role: 'league_admin' });

    const response = await POST(request(JSON.stringify({
      supportNeedId: 'need_1',
      actorUserId: 'league_admin_1',
      note: 'x'.repeat(5 * 1024),
    })), context);

    expect(response.status).toBe(413);
    expectNoDomainCollectionAccess(vi.mocked(adminDb.collection));
  });
});
