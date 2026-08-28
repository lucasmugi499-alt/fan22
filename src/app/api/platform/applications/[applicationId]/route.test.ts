import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { GET } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: { collection: vi.fn() },
}));

function installFirestore() {
  const rows: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {
    users: [{ id: 'admin_1', data: { role: 'platform_admin', accountClass: 'platform_operator', accountStatus: 'active' } }],
    accessIndex: [{ id: 'platform_global_admin_1', data: { capabilities: ['platform.audit.read', 'platform.application.review'] } }],
    leagueAdminApplications: [{ id: 'application_1', data: {
      applicantName: 'Grace Organizer', applicantEmail: 'owner@example.com', leagueName: 'Kampala Youth League',
      sport: 'football', city: 'Kampala', evidenceNote: 'Eight teams play weekly.', status: 'risk_review', riskLevel: 'high',
      riskFlags: ['duplicate_league_name'], duplicateCandidates: [{ id: 'league_1', kind: 'league', title: 'Kampala Youth League', city: 'Kampala', status: 'active', score: 100, reason: 'Exact normalized league name' }],
      invitationId: 'invite_1',
    } }],
    invitations: [{ id: 'invite_1', data: { invitedEmail: 'owner@example.com', status: 'failed_delivery', tokenHash: 'secret' } }],
    invitationDeliveryAttempts: [{ id: 'attempt_1', data: { invitationId: 'invite_1', status: 'failed_delivery', provider: 'resend', error: 'Rejected' } }],
  };
  vi.mocked(adminDb.collection).mockImplementation((name: string) => {
    const items = rows[name] ?? [];
    const query = {
      where: vi.fn(() => query), limit: vi.fn(() => query),
      get: vi.fn(async () => ({ docs: items.map((item) => ({ id: item.id, data: () => item.data })) })),
      doc: (id: string) => ({ get: vi.fn(async () => {
        const item = items.find((candidate) => candidate.id === id);
        return { id, exists: Boolean(item), data: () => item?.data };
      }) }),
    };
    return query as never;
  });
}

describe('Platform application workbench route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns risk comparison and observable invitation delivery without secrets', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin_1', role: 'platform_admin' } as never);
    installFirestore();

    const response = await GET(new Request('https://goalplace256.test/api/platform/applications/application_1', {
      headers: { authorization: 'Bearer token' },
    }), { params: Promise.resolve({ applicationId: 'application_1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.application).toMatchObject({ id: 'application_1', riskLevel: 'high' });
    expect(body.duplicateCandidates[0]).toMatchObject({ id: 'league_1', score: 100 });
    expect(body.invitation).toMatchObject({ id: 'invite_1', status: 'failed_delivery' });
    expect(body.deliveryAttempts[0]).toMatchObject({ id: 'attempt_1', error: 'Rejected' });
    expect(JSON.stringify(body)).not.toContain('tokenHash');
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});
