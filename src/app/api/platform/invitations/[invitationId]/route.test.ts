import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { GET } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: { collection: vi.fn() },
}));

/**
 * Relative to now, not a date somebody typed.
 *
 * This fixture used to carry `expiresAt: '2026-09-03T12:00:00.000Z'`, which was comfortably in
 * the future when it was written and became the past on 3 September. The route derives
 * `expired` from the clock and correctly overrode the stored status, so the suite went red for
 * a reason that had nothing to do with any change — a test that rots on a calendar date is a
 * test that will eventually cry wolf during someone else's deploy.
 */
const FAR_FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const ALREADY_PAST = new Date(Date.now() - 60 * 1000).toISOString();

function installFirestore(overrides: Record<string, unknown> = {}) {
  const collections: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {
    users: [{ id: 'admin_1', data: { role: 'platform_admin', accountClass: 'platform_operator', accountStatus: 'active' } }],
    accessIndex: [{ id: 'platform_global_admin_1', data: { capabilities: ['platform.audit.read', 'platform.access.manage'] } }],
    invitations: [{ id: 'invite_1', data: {
      invitedEmail: 'owner@example.com', roleKey: 'league_owner', scopeType: 'league', scopeId: 'league_1',
      status: 'failed_delivery', expiresAt: FAR_FUTURE, tokenHash: 'secret_hash', actionUrl: '/secret?token=raw',
      ...overrides,
    } }],
    invitationDeliveryAttempts: [{ id: 'attempt_1', data: {
      invitationId: 'invite_1', channel: 'email', provider: 'resend', status: 'failed_delivery', error: 'Provider rejected', attemptNumber: 1,
    } }],
  };
  vi.mocked(adminDb.collection).mockImplementation((name: string) => {
    const rows = collections[name] ?? [];
    const query = {
      where: vi.fn(() => query),
      limit: vi.fn(() => query),
      get: vi.fn(async () => ({ docs: rows.map((row) => ({ id: row.id, data: () => row.data })) })),
      doc: (id: string) => ({
        get: vi.fn(async () => {
          const row = rows.find((item) => item.id === id);
          return { id, exists: Boolean(row), data: () => row?.data };
        }),
      }),
    };
    return query as never;
  });
}

describe('Platform invitation operations route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports an invitation past its expiry as expired, whatever its stored status says', async () => {
    /*
     * The behaviour that made the rotted fixture fail, now pinned deliberately instead of
     * arrived at by accident. Expiry is derived from the clock at read time, so a stored
     * `failed_delivery` on a lapsed invitation must not be shown as something an operator
     * could still retry.
     */
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin_1', role: 'platform_admin' } as never);
    installFirestore({ expiresAt: ALREADY_PAST });

    const response = await GET(new Request('https://goalplace256.test/api/platform/invitations/invite_1', {
      headers: { authorization: 'Bearer token' },
    }), { params: Promise.resolve({ invitationId: 'invite_1' }) });
    const body = await response.json();

    expect(body.invitation).toMatchObject({ id: 'invite_1', status: 'expired' });
  });

  it('returns provider attempt history without invitation secrets', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin_1', role: 'platform_admin' } as never);
    installFirestore();

    const response = await GET(new Request('https://goalplace256.test/api/platform/invitations/invite_1', {
      headers: { authorization: 'Bearer token' },
    }), { params: Promise.resolve({ invitationId: 'invite_1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.invitation).toMatchObject({ id: 'invite_1', status: 'failed_delivery', invitedEmail: 'owner@example.com' });
    expect(body.attempts[0]).toMatchObject({ id: 'attempt_1', status: 'failed_delivery', error: 'Provider rejected' });
    expect(JSON.stringify(body)).not.toContain('secret_hash');
    expect(JSON.stringify(body)).not.toContain('/secret?token=raw');
  });
});
