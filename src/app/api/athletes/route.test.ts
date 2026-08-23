import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { sendAthleteInvitationEmail } from '@/server/email/athleteInvitation';
import { POST } from './route';
import { expectNoDomainCollectionAccess, expectNoDomainTransaction } from '@/test/firestoreAssertions';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
  },
  adminDb: {
    collection: vi.fn(),
    runTransaction: vi.fn(),
  },
}));

vi.mock('@/server/email/athleteInvitation', () => ({
  sendAthleteInvitationEmail: vi.fn(async () => ({ status: 'sent', id: 'email_athlete_1' })),
}));

function request(body: string, token = 'token') {
  return new Request('https://goalplace256.test/api/athletes', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body,
  });
}

function snapshot(id: string, data: Record<string, unknown> | undefined) {
  return {
    id,
    exists: Boolean(data),
    data: () => data,
  };
}

function installFirestoreMock(records: Record<string, Record<string, unknown>>) {
  vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => ({
    doc: (id = `${collectionName}_generated`) => ({
      id,
      get: vi.fn(async () => snapshot(id, records[`${collectionName}/${id}`])),
      set: vi.fn(async () => undefined),
    }),
  }) as never);
}

// Invitation links are built from configuration only — never from the request's Origin
// header, which a caller controls. Tests configure it the way a deployment does.
process.env.GOALPLACE_APP_BASE_URL = 'https://goalplace256.test';

describe('athlete creation route hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated athlete creation before parsing or touching Firestore', async () => {
    const response = await POST(request('{', ''));

    expect(response.status).toBe(401);
    expect(adminAuth.verifyIdToken).not.toHaveBeenCalled();
    expectNoDomainCollectionAccess(vi.mocked(adminDb.collection));
  });

  it('requires Team Admin access before parsing or touching Firestore', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'fan_1', role: 'fan' });

    const response = await POST(request('{'));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Team Admin access required.' });
    expectNoDomainCollectionAccess(vi.mocked(adminDb.collection));
  });

  it('rejects invalid JSON before touching Firestore', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'team_admin_1', role: 'team_admin' });

    const response = await POST(request('{'));

    expect(response.status).toBe(400);
    expectNoDomainCollectionAccess(vi.mocked(adminDb.collection));
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
    expectNoDomainCollectionAccess(vi.mocked(adminDb.collection));
  });

  it('allows a Team Admin with scoped athlete creation access even without legacy team arrays', async () => {
    const transaction = { set: vi.fn() };
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'team_admin_1', role: 'team_admin' });
    vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction) as never);
    installFirestoreMock({
      'teams/team_1': {
        id: 'team_1',
        name: 'Kampala Testers',
        sport: 'football',
        city: 'Kampala',
        leagueId: 'league_1',
        adminUserIds: [],
      },
      'leagues/league_1': { id: 'league_1', adminUserIds: [] },
      'accessIndex/team_team_1_team_admin_1': {
        userId: 'team_admin_1',
        scopeType: 'team',
        scopeId: 'team_1',
        capabilities: ['team.athlete.create'],
      },
    });

    const response = await POST(request(JSON.stringify({
      teamId: 'team_1',
      name: 'New Athlete',
      position: 'Forward',
      ageGroup: 'Senior',
      invitedEmail: 'new.athlete@example.com',
    })));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      id: 'athletes_generated',
      actionUrl: expect.stringContaining('/register?next='),
      emailDelivery: 'sent',
      emailMessageId: 'email_athlete_1',
    });
    expect(transaction.set).toHaveBeenCalledWith(expect.objectContaining({ id: 'athletes_generated' }), expect.objectContaining({
      name: 'New Athlete',
      teamId: 'team_1',
      leagueId: 'league_1',
      invitedEmail: 'new.athlete@example.com',
      invitationTokenHash: expect.any(String),
      invitationActionUrl: expect.stringContaining('/register?next='),
      verificationStatus: 'pending',
    }));
    expect(sendAthleteInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'new.athlete@example.com',
      athleteName: 'New Athlete',
      teamName: 'Kampala Testers',
    }));
  });

  it('rejects a Team Admin whose scoped access is for another team', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'team_admin_1', role: 'team_admin' });
    installFirestoreMock({
      'teams/team_1': {
        id: 'team_1',
        name: 'Kampala Testers',
        sport: 'football',
        city: 'Kampala',
        leagueId: 'league_1',
        adminUserIds: [],
      },
      'leagues/league_1': { id: 'league_1', adminUserIds: [] },
      'accessIndex/team_team_2_team_admin_1': {
        userId: 'team_admin_1',
        scopeType: 'team',
        scopeId: 'team_2',
        capabilities: ['team.athlete.create'],
      },
    });

    const response = await POST(request(JSON.stringify({
      teamId: 'team_1',
      name: 'New Athlete',
      position: 'Forward',
      ageGroup: 'Senior',
      invitedEmail: 'new.athlete@example.com',
    })));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'You are not assigned to this team.' });
    expectNoDomainTransaction(vi.mocked(adminDb.runTransaction));
  });
});
