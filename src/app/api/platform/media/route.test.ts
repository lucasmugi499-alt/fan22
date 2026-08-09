import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb, adminStorage } from '@/lib/firebase/admin';
import { GET, POST } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: { collection: vi.fn(), runTransaction: vi.fn() },
  adminStorage: { bucket: vi.fn() },
}));

const PLATFORM_OPERATOR = { role: 'platform_admin', accountClass: 'platform_operator', accountStatus: 'active' };

let store: Record<string, Record<string, unknown>>;
let deletedObjects: string[];

function decision(body: unknown) {
  return new Request('https://goalplace256.test/api/platform/media', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function install(record: Record<string, unknown> | null) {
  store = {
    'users/admin_1': PLATFORM_OPERATOR,
    // Both capabilities this route gates on: the queue read wants platform.audit.read and
    // a moderation decision wants platform.admin.manage. The platform_admin role no longer
    // implies either, so the operator fixture is provisioned like a real account.
    'accessIndex/platform_global_admin_1': {
      capabilities: ['platform.audit.read', 'platform.admin.manage'],
    },
  };
  if (record) store['mediaRecords/media_1'] = record;
  deletedObjects = [];

  vi.mocked(adminDb.collection).mockImplementation((name: string) => {
    const api = {
      where: vi.fn(() => api),
      orderBy: vi.fn(() => api),
      limit: vi.fn(() => api),
      get: vi.fn(async () => ({
        docs: Object.entries(store)
          .filter(([path]) => path.startsWith(`${name}/`))
          .map(([path, value]) => ({ id: path.split('/')[1], data: () => value })),
      })),
      doc: (id = 'generated') => ({
        path: `${name}/${id}`,
        get: vi.fn(async () => ({
          exists: Boolean(store[`${name}/${id}`]),
          data: () => store[`${name}/${id}`],
        })),
        set: vi.fn(async (value: Record<string, unknown>) => {
          store[`${name}/${id}`] = { ...(store[`${name}/${id}`] ?? {}), ...value };
        }),
      }),
    };
    return api as never;
  });

  vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
    set: (ref: { path: string }, value: Record<string, unknown>) => {
      store[ref.path] = { ...(store[ref.path] ?? {}), ...value };
    },
  }) as never);

  vi.mocked(adminStorage.bucket).mockReturnValue({
    name: 'bucket.example',
    file: (path: string) => ({
      getSignedUrl: vi.fn(async () => ['https://storage.example/review']),
      delete: vi.fn(async () => {
        deletedObjects.push(path);
      }),
    }),
  } as never);
}

const PENDING = {
  storagePath: 'publishedMedia/team/team_1/uploader/photo.jpg',
  contentType: 'image/jpeg',
  size: 2048,
  moderationStatus: 'pending_review',
  published: false,
  createdAt: '2026-08-03T00:00:00.000Z',
};

describe('media moderation queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin_1', role: 'platform_admin' } as never);
  });

  it('requires a dedicated Platform Operator account', async () => {
    install(PENDING);
    store['users/admin_1'] = { role: 'platform_admin', accountClass: 'fan' };

    const response = await GET(new Request('https://goalplace256.test/api/platform/media', {
      headers: { authorization: 'Bearer token' },
    }));

    expect(response.status).toBe(403);
  });

  it('lists pending media with a short-lived review URL', async () => {
    install(PENDING);

    const body = await (await GET(new Request('https://goalplace256.test/api/platform/media', {
      headers: { authorization: 'Bearer token' },
    }))).json();

    // A moderator must be able to see the file without it becoming publicly addressable
    // before a decision is made.
    expect(body.items).toHaveLength(1);
    expect(body.items[0].reviewUrl).toBe('https://storage.example/review');
  });

  it('publishes a record only on approval', async () => {
    install(PENDING);

    const response = await POST(decision({
      mediaRecordId: 'media_1',
      decision: 'approved',
      note: 'Reviewed and appropriate.',
    }));

    expect(response.status).toBe(200);
    expect(store['mediaRecords/media_1']).toMatchObject({
      moderationStatus: 'approved',
      published: true,
    });
    expect(store['mediaRecords/media_1'].downloadUrl).toContain('bucket.example');
    expect(deletedObjects).toHaveLength(0);
  });

  it('deletes the stored object when media is rejected', async () => {
    install(PENDING);

    await POST(decision({
      mediaRecordId: 'media_1',
      decision: 'rejected',
      note: 'Contains unrelated content.',
    }));

    // Removed rather than flagged: a rejected file left in the bucket is one
    // configuration change away from being served.
    expect(deletedObjects).toContain(PENDING.storagePath);
    expect(store['mediaRecords/media_1']).toMatchObject({
      moderationStatus: 'rejected',
      published: false,
    });
  });

  it('refuses to decide the same record twice', async () => {
    install({ ...PENDING, moderationStatus: 'approved', published: true });

    const response = await POST(decision({
      mediaRecordId: 'media_1',
      decision: 'rejected',
      note: 'Changed my mind.',
    }));

    expect(response.status).toBe(409);
  });

  it('requires a moderation note', async () => {
    install(PENDING);

    const response = await POST(decision({ mediaRecordId: 'media_1', decision: 'approved', note: '' }));

    // Every publication decision is auditable, which needs a stated reason.
    expect(response.status).toBe(400);
  });
});
