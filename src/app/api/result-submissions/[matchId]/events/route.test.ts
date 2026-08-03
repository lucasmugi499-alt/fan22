import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminDb } from '@/lib/firebase/admin';
import { enforceRateLimit } from '@/server/api/security';
import { GET } from './route';
import { expectNoDomainCollectionAccess } from '@/test/firestoreAssertions';

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(),
  },
}));

vi.mock('@/server/api/security', async () => {
  const actual = await vi.importActual<typeof import('@/server/api/security')>('@/server/api/security');
  return {
    ...actual,
    enforceRateLimit: vi.fn(async () => null),
  };
});

function request() {
  return new Request('https://goalplace256.test/api/result-submissions/match_1/events', {
    headers: { 'x-forwarded-for': '203.0.113.9' },
  });
}

function installFirestore() {
  const eventsGet = vi.fn(async () => ({
    docs: [
      {
        id: 'event_public',
        data: () => ({
          from: 'pending_confirmation',
          to: 'confirmed',
          actor: 'opponent_team',
          actorUserId: 'team_admin_secret',
          note: 'Internal operator note',
          createdAt: '2026-07-30T12:00:00.000Z',
        }),
      },
      {
        id: 'event_internal',
        data: () => ({
          from: 'confirmed',
          to: 'risk_review',
          actor: 'league_admin',
          actorUserId: 'league_admin_secret',
          internalOnly: true,
          createdAt: '2026-07-30T12:05:00.000Z',
        }),
      },
    ],
  }));
  const limit = vi.fn(() => ({ get: eventsGet }));
  const orderBy = vi.fn(() => ({ limit }));
  vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => {
    if (collectionName === 'matches') {
      return {
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({ exists: true })),
        })),
      } as never;
    }
    if (collectionName === 'resultSubmissions') {
      return {
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({ orderBy })),
        })),
      } as never;
    }
    throw new Error(`Unexpected collection ${collectionName}`);
  });
  return { limit };
}

describe('public result provenance route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a bounded sanitized public event projection', async () => {
    const { limit } = installFirestore();

    const response = await GET(request(), {
      params: Promise.resolve({ matchId: 'match_1' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('s-maxage=60');
    expect(limit).toHaveBeenCalledWith(50);
    expect(enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({
      bucket: 'public_result_provenance',
      identity: ['203.0.113.9', 'match_1'],
    }));
    expect(await response.json()).toEqual({
      events: [{
        id: 'event_public',
        submissionId: 'match_1',
        from: 'pending_confirmation',
        to: 'confirmed',
        actor: 'opponent_team',
        createdAt: '2026-07-30T12:00:00.000Z',
      }],
    });
  });

  it('rejects invalid match paths without touching Firestore', async () => {
    const response = await GET(request(), {
      params: Promise.resolve({ matchId: 'match/../bad' }),
    });

    expect(response.status).toBe(404);
    expectNoDomainCollectionAccess(vi.mocked(adminDb.collection));
  });
});
