import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb, adminStorage } from '@/lib/firebase/admin';
import { POST } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: { collection: vi.fn(), runTransaction: vi.fn() },
  adminStorage: { bucket: vi.fn() },
}));

function request(sessionId = 'session_1') {
  return new Request('https://goalplace256.test/api/uploads/session/confirm', {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    body: JSON.stringify({ sessionId }),
  });
}

const AUTHORIZED_SESSION = {
  id: 'session_1',
  kind: 'published_media',
  actorUserId: 'operator_1',
  storagePath: 'publishedMedia/team/team_1/operator_1/file.jpg',
  declaredContentType: 'image/jpeg',
  declaredSize: 2048,
  ownerType: 'team',
  ownerId: 'team_1',
  status: 'authorized',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

let store: Record<string, Record<string, unknown>>;
let deleted: string[];
let objectMetadata: { size: number; contentType: string; md5Hash?: string } | null;

function install({ session = AUTHORIZED_SESSION, exists = true } = {}) {
  store = { 'uploadSessions/session_1': { ...session } };
  deleted = [];

  vi.mocked(adminDb.collection).mockImplementation((name: string) => ({
    doc: (id: string) => ({
      path: `${name}/${id}`,
      get: vi.fn(async () => ({
        exists: Boolean(store[`${name}/${id}`]),
        data: () => store[`${name}/${id}`],
      })),
      set: vi.fn(async (value: Record<string, unknown>, options?: { merge?: boolean }) => {
        store[`${name}/${id}`] = options?.merge
          ? { ...(store[`${name}/${id}`] ?? {}), ...value }
          : value;
      }),
    }),
  }) as never);

  vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
    get: async (ref: { path: string }) => ({ exists: true, data: () => store[ref.path] }),
    set: (ref: { path: string }, value: Record<string, unknown>, options?: { merge?: boolean }) => {
      store[ref.path] = options?.merge ? { ...(store[ref.path] ?? {}), ...value } : value;
    },
  }) as never);

  vi.mocked(adminStorage.bucket).mockReturnValue({
    file: () => ({
      exists: vi.fn(async () => [exists]),
      getMetadata: vi.fn(async () => [objectMetadata]),
      delete: vi.fn(async () => {
        deleted.push('deleted');
      }),
    }),
  } as never);
}

describe('upload confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    objectMetadata = { size: 2048, contentType: 'image/jpeg', md5Hash: 'abc123' };
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'operator_1', role: 'team_admin' } as never);
  });

  it('creates a media record pending review, not a published one', async () => {
    install();

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    // Confirming an upload does not publish it.
    expect(body).toMatchObject({ moderationStatus: 'pending_review', published: false });
    expect(body).not.toHaveProperty('downloadUrl');
    expect(store['mediaRecords/media_session_1']).toMatchObject({
      storagePath: AUTHORIZED_SESSION.storagePath,
      size: 2048,
      md5Hash: 'abc123',
      moderationStatus: 'pending_review',
      published: false,
    });
    expect(store['uploadSessions/session_1']).toMatchObject({ status: 'confirmed' });
  });

  it('rejects an object larger than the authorized size and removes it', async () => {
    install();
    // The signed URL only bound the content type, so an oversized upload was previously
    // accepted and never inspected.
    objectMetadata = { size: 9_000_000, contentType: 'image/jpeg' };

    const response = await POST(request());

    expect(response.status).toBe(422);
    expect(deleted).toHaveLength(1);
    expect(store['uploadSessions/session_1']).toMatchObject({
      status: 'rejected',
      rejectionReason: 'exceeds_declared_size',
    });
    expect(store['mediaRecords/media_session_1']).toBeUndefined();
  });

  it('rejects an object whose type differs from the authorized type', async () => {
    install();
    objectMetadata = { size: 1024, contentType: 'application/zip' };

    const response = await POST(request());

    expect(response.status).toBe(422);
    expect(store['uploadSessions/session_1']).toMatchObject({ rejectionReason: 'content_type_mismatch' });
  });

  it('refuses a second confirmation of the same session', async () => {
    install({ session: { ...AUTHORIZED_SESSION, status: 'confirmed' } });

    const response = await POST(request());

    // Single use: a replay must not mint a second media record for one authorization.
    expect(response.status).toBe(409);
  });

  it('refuses a session belonging to another account', async () => {
    install({ session: { ...AUTHORIZED_SESSION, actorUserId: 'someone_else' } });

    const response = await POST(request());

    expect(response.status).toBe(403);
  });

  it('refuses an expired session and marks it expired', async () => {
    install({
      session: { ...AUTHORIZED_SESSION, expiresAt: new Date(Date.now() - 60_000).toISOString() },
    });

    const response = await POST(request());

    expect(response.status).toBe(410);
    expect(store['uploadSessions/session_1']).toMatchObject({ status: 'expired' });
  });

  it('refuses when the authorization exists but nothing was uploaded', async () => {
    install({ exists: false });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(store['mediaRecords/media_session_1']).toBeUndefined();
  });
});
