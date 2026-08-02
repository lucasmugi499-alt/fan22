import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { POST } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
  },
  adminDb: {
    collection: vi.fn(),
    bulkWriter: vi.fn(),
  },
}));

function doc(id: string, data: Record<string, unknown> | null) {
  return {
    id,
    exists: data !== null,
    data: () => data,
  };
}

function querySnapshot(docs: Array<ReturnType<typeof doc>>) {
  return {
    docs,
    size: docs.length,
  };
}

function request(body: Record<string, unknown>) {
  return new Request('https://goalplace256.test/api/fantasy/admin', {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    body: JSON.stringify(body),
  });
}

describe('fantasy admin activation route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'platform_1',
      role: 'platform_admin',
    });
  });

  it('blocks activation when competition stat coverage cannot support its active scoring rules', async () => {
    const collections: Record<string, unknown> = {
      users: {
        doc: () => ({
          get: vi.fn().mockResolvedValue(doc('platform_1', { role: 'platform_admin' })),
        }),
      },
      fantasyCompetitions: {
        doc: () => ({
          get: vi.fn().mockResolvedValue(doc('competition_1', {
            id: 'competition_1',
            name: 'Kampala Fantasy',
            shortName: 'KFF',
            sport: 'football',
            variant: 'association_football',
            leagueId: 'league_1',
            seasonId: 'season_1',
            scoringProfileId: 'profile_1',
            scoringProfileVersion: 1,
            squadRulesId: 'rules_1',
            dataLevel: 'basic',
            recordedStatKeys: ['goal'],
            status: 'approved',
            isFreeToPlay: true,
            creditsLabel: 'Fantasy Credits',
            createdAt: '2026-07-29T00:00:00.000Z',
          })),
        }),
      },
      fantasyScoringProfiles: {
        doc: () => ({
          get: vi.fn().mockResolvedValue(doc('profile_1', {
            id: 'profile_1',
            sport: 'football',
            variant: 'association_football',
            name: 'Football Lite',
            version: 1,
            status: 'approved',
            captainMultiplier: 1.5,
            createdAt: '2026-07-29T00:00:00.000Z',
            publishedAt: '2026-07-29T00:00:00.000Z',
            rules: [
              {
                id: 'goal',
                stat: 'goal',
                label: 'Goal',
                points: 4,
                requiredDataLevel: 'basic',
                requiredStatKey: 'goal',
                enabled: true,
              },
              {
                id: 'appearance',
                stat: 'appearance',
                label: 'Appearance',
                points: 2,
                requiredDataLevel: 'basic',
                requiredStatKey: 'appearance',
                enabled: true,
              },
            ],
          })),
        }),
      },
      fantasySquadRules: {
        doc: () => ({
          get: vi.fn().mockResolvedValue(doc('rules_1', {
            id: 'rules_1',
            sport: 'football',
            variant: 'association_football',
            version: 1,
            squadSize: 1,
            startingSize: 1,
            benchSize: 0,
            budgetCredits: 100,
            maxFromRealTeam: 3,
            captainRequired: true,
            viceCaptainRequired: true,
            transferAllowancePerRound: 2,
            deadlineStrategy: 'first_round_kickoff',
            positionGroups: [
              { id: 'forward', label: 'Forwards', positions: ['Forward'], minimum: 1, maximum: 1 },
            ],
            createdAt: '2026-07-29T00:00:00.000Z',
          })),
        }),
      },
      fantasyPlayers: {
        where: () => ({
          get: vi.fn().mockResolvedValue(querySnapshot([
            doc('player_1', {
              id: 'player_1',
              competitionId: 'competition_1',
              athleteId: 'athlete_1',
              realTeamId: 'team_1',
              sport: 'football',
              position: 'Forward',
              positionGroup: 'forward',
              availability: 'available',
              verifiedRecentForm: [],
              ownershipPercentage: 0,
              active: true,
            }),
          ])),
        }),
      },
      fantasyPlayerPrices: {
        where: () => ({
          get: vi.fn().mockResolvedValue(querySnapshot([
            doc('price_1', {
              id: 'price_1',
              competitionId: 'competition_1',
              athleteId: 'athlete_1',
              credits: 7,
              version: 1,
              status: 'draft',
            }),
          ])),
        }),
      },
      fantasyRounds: {
        where: () => ({
          get: vi.fn().mockResolvedValue(querySnapshot([
            doc('round_1', {
              id: 'round_1',
              competitionId: 'competition_1',
              number: 1,
              name: 'Round 1',
              matchIds: ['match_1'],
              startsAt: '2026-08-03T12:00:00.000Z',
              deadlineAt: '2026-08-03T12:00:00.000Z',
              endsAt: '2026-08-03T16:00:00.000Z',
              status: 'upcoming',
            }),
          ])),
        }),
      },
    };
    vi.mocked(adminDb.collection).mockImplementation((name: string) => collections[name] as never);

    const response = await POST(request({
      action: 'activate',
      competitionId: 'competition_1',
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Roster, rounds, or locked scoring configuration is incomplete.',
      blockers: ['Recorded stat coverage is missing: appearance.'],
    });
    expect(adminDb.bulkWriter).not.toHaveBeenCalled();
  });
});
