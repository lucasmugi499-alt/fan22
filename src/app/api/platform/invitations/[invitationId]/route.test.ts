import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { GET } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: { collection: vi.fn() },
}));

function installFirestore() {
  const collections: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {
    users: [{ id: 'admin_1', data: { role: 'platform_admin', accountClass: 'platform_operator', accountStatus: 'active' } }],
    accessIndex: [{ id: 'platform_global_admin_1', data: { capabilities: ['platform.audit.read', 'platform.access.manage'] } }],
    invitations: [{ id: 'invite_1', data: {
      invitedEmail: 'owner@example.com', roleKey: 'league_owner', scopeType: 'league', scopeId: 'league_1',
      status: 'failed_delivery', expiresAt: '2026-09-03T12:00:00.000Z', tokenHash: 'secret_hash', actionUrl: '/secret?token=raw',
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
