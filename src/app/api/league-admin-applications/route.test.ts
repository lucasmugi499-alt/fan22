import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminDb } from '@/lib/firebase/admin';
import { POST } from './route';
import { expectNoDomainCollectionAccess } from '@/test/firestoreAssertions';

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(),
    runTransaction: vi.fn(),
  },
}));

vi.mock('@/server/api/security', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/api/security')>();
  return {
    ...actual,
    verifyOptionalAppCheck: vi.fn(async () => ({ appId: 'test-app' })),
    enforceRateLimit: vi.fn(async () => null),
    clientIpFrom: vi.fn(() => '203.0.113.10'),
  };
});

function request(body: unknown) {
  return new Request('https://goalplace256.test/api/league-admin-applications', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('public league admin applications route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a pending public application without authentication', async () => {
    const applicationRef = { id: 'application_1' };
    const transaction = { create: vi.fn() };
    vi.mocked(adminDb.collection).mockReturnValue({
      doc: vi.fn(() => applicationRef),
    } as never);
    vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction) as never);

    const response = await POST(request({
      applicantName: 'Grace Organizer',
      applicantPhone: '+256700000000',
      applicantEmail: 'owner@example.com',
      leagueName: 'Public Rugby League',
      sport: 'rugby',
      city: 'Jinja',
      evidenceNote: 'We operate a verified regional competition with eight clubs.',
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'application_1' });
    expect(transaction.create).toHaveBeenCalledWith(applicationRef, expect.objectContaining({
      id: 'application_1',
      applicantName: 'Grace Organizer',
      applicantEmail: 'owner@example.com',
      applicantPhone: '+256700000000',
      leagueName: 'Public Rugby League',
      sport: 'rugby',
      city: 'Jinja',
      status: 'pending',
      source: 'public_league_application',
    }));
  });

  it('rejects incomplete public applications before touching Firestore', async () => {
    const response = await POST(request({
      applicantName: 'G',
      applicantEmail: 'not-an-email',
      leagueName: '',
      sport: 'rugby',
      city: 'Jinja',
      evidenceNote: 'short',
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Complete every required field.' });
    expectNoDomainCollectionAccess(vi.mocked(adminDb.collection));
  });
});
