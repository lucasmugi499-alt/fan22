import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb, adminStorage } from '@/lib/firebase/admin';
import { GET } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: { collection: vi.fn() },
  adminStorage: { bucket: vi.fn() },
}));

function request(token = 'token') {
  return new Request('https://goalplace256.test/api/matches/match_1/evidence', {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

const context = { params: Promise.resolve({ matchId: 'match_1' }) };

const MATCH = { homeTeamId: 'team_home', awayTeamId: 'team_away', leagueId: 'league_1' };

function install(capabilities: Record<string, string[]>) {
  vi.mocked(adminDb.collection).mockImplementation((name: string) => {
    const api = {
      where: vi.fn(() => api),
      get: vi.fn(async () => ({
        docs: name === 'mediaRecords'
          ? [{
            id: 'media_1',
            data: () => ({
              kind: 'match_evidence',
              matchId: 'match_1',
              teamId: 'team_home',
              storagePath: 'matchEvidence/match_1/team_home/uploader/photo.jpg',
              contentType: 'image/jpeg',
              size: 1024,
              actorUserId: 'uploader',
              moderationStatus: 'pending_review',
            }),
          }]
          : [],
      })),
      doc: (id: string) => ({
        get: vi.fn(async () => {
          if (name === 'matches') return { exists: true, data: () => MATCH };
          const granted = capabilities[id];
          return { exists: Boolean(granted), data: () => (granted ? { capabilities: granted } : undefined) };
        }),
      }),
    };
    return api as never;
  });

  vi.mocked(adminStorage.bucket).mockReturnValue({
    file: () => ({
      getSignedUrl: vi.fn(async () => ['https://storage.example/read?sig=x']),
    }),
  } as never);
}

describe('match evidence access', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects an unauthenticated caller', async () => {
    install({});
    const response = await GET(request(''), context);

    expect(response.status).toBe(401);
  });

  it('allows the opposing team admin to review evidence they did not upload', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'away_admin', role: 'team_admin' } as never);
    install({ team_team_away_away_admin: ['team.result.confirm'] });

    const response = await GET(request(), context);
    const body = await response.json();

    // The whole verification workflow asks this account to confirm or dispute the
    // result; Storage Rules alone left them unable to open the evidence.
    expect(response.status).toBe(200);
    expect(body.evidence).toHaveLength(1);
    expect(body.evidence[0].readUrl).toContain('https://storage.example/read');
  });

  it('allows the assigned league admin who adjudicates the dispute', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'league_admin', role: 'league_admin' } as never);
    install({ league_league_1_league_admin: ['league.result.resolve'] });

    const response = await GET(request(), context);

    expect(response.status).toBe(200);
  });

  it('denies an operator with no scoped capability in this fixture', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'other_admin', role: 'team_admin' } as never);
    install({ team_team_elsewhere_other_admin: ['team.result.confirm'] });

    const response = await GET(request(), context);

    expect(response.status).toBe(403);
  });

  it('denies a fan with no assignment', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'fan_1', role: 'fan' } as never);
    install({});

    const response = await GET(request(), context);

    expect(response.status).toBe(403);
  });

  it('returns short-lived signed reads rather than durable public URLs', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin_1', role: 'platform_admin' } as never);
    install({});

    const response = await GET(request(), context);
    const body = await response.json();

    expect(body.evidence[0].expiresInSeconds).toBe(300);
    // An evidence listing must not be cached by an intermediary; the signed reads inside
    // it are credentials with a short life.
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
