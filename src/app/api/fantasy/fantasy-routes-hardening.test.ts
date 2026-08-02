import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { POST as postAdmin } from './admin/route';
import { POST as postMiniLeague } from './mini-leagues/route';
import { POST as postTeam } from './teams/route';
import { POST as postTransfer } from './transfers/route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
  },
  adminDb: {
    collection: vi.fn(),
  },
}));

function request(path: string, body: string, token = 'token') {
  return new Request(`https://goalplace256.test${path}`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body,
  });
}

function installUserProfile(profile: Record<string, unknown>) {
  vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => ({
    doc: (id: string) => ({
      id,
      get: vi.fn(async () => ({
        id,
        exists: collectionName === 'users',
        data: () => collectionName === 'users' ? profile : undefined,
      })),
    }),
  }) as never);
}

describe('fantasy route hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['/api/fantasy/teams', postTeam, 'Sign in to submit a fantasy squad.'],
    ['/api/fantasy/transfers', postTransfer, 'Sign in to make a fantasy transfer.'],
    ['/api/fantasy/mini-leagues', postMiniLeague, 'Sign in to manage mini-leagues.'],
    ['/api/fantasy/admin', postAdmin, 'Authentication required.'],
  ] as const)('rejects unauthenticated POST %s before body parsing or Firestore work', async (path, handler, error) => {
    const response = await handler(request(path, '{', ''));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error });
    expect(adminAuth.verifyIdToken).not.toHaveBeenCalled();
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it.each([
    ['/api/fantasy/teams', postTeam, 'Invalid fantasy squad.'],
    ['/api/fantasy/transfers', postTransfer, 'Choose two different eligible athletes.'],
    ['/api/fantasy/mini-leagues', postMiniLeague, 'Invalid mini-league request.'],
    ['/api/fantasy/admin', postAdmin, 'Invalid fantasy administration request.'],
  ] as const)('rejects invalid JSON for POST %s before Firestore work', async (path, handler, error) => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'fan_1', role: 'fan' });

    const response = await handler(request(path, '{'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it.each([
    ['/api/fantasy/teams', postTeam, 'Invalid fantasy squad.', 9 * 1024],
    ['/api/fantasy/transfers', postTransfer, 'Choose two different eligible athletes.', 5 * 1024],
    ['/api/fantasy/mini-leagues', postMiniLeague, 'Invalid mini-league request.', 5 * 1024],
    ['/api/fantasy/admin', postAdmin, 'Invalid fantasy administration request.', 9 * 1024],
  ] as const)('rejects oversized JSON for POST %s before Firestore work', async (path, handler, error, size) => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'fan_1', role: 'fan' });

    const response = await handler(request(path, JSON.stringify({
      action: 'join',
      inviteCode: 'ABCDEF',
      padding: 'x'.repeat(size),
    })));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error });
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it.each([
    ['/api/fantasy/teams', postTeam, {
      competitionId: 'competition_1',
      roundId: 'round_1',
      teamName: 'No Scope FC',
      squadAthleteIds: ['athlete_1'],
      startingAthleteIds: ['athlete_1'],
      benchAthleteIds: [],
      captainAthleteId: 'athlete_1',
      viceCaptainAthleteId: 'athlete_1',
    }],
    ['/api/fantasy/transfers', postTransfer, {
      competitionId: 'competition_1',
      roundId: 'round_1',
      athleteOutId: 'athlete_1',
      athleteInId: 'athlete_2',
    }],
    ['/api/fantasy/mini-leagues', postMiniLeague, {
      action: 'join',
      inviteCode: 'ABCDEF',
    }],
  ] as const)('rejects operator accounts before fantasy writes for POST %s', async (path, handler, body) => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'operator_1',
      role: 'team_admin',
      accountClass: 'organization_operator',
    });
    installUserProfile({ role: 'team_admin', accountClass: 'organization_operator' });

    const response = await handler(request(path, JSON.stringify(body)));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'GoalPlace Fantasy is available to Fan accounts only.',
    });
  });
});
