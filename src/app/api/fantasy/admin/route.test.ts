import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { GET, POST } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
  },
  adminDb: {
    collection: vi.fn(),
    bulkWriter: vi.fn(),
  },
}));

/** Records which league ids were requested by id rather than scanned. */
const requestedLeagueIds: string[] = [];

/** Records which competition ids a per-competition query asked for. */
const requestedCompetitionIds: Record<string, string[]> = {};

function perCompetitionWhere(collection: string) {
  return (_field: string, _op: string, ids: string[]) => {
    requestedCompetitionIds[collection] = [...(requestedCompetitionIds[collection] ?? []), ...ids];
    return { get: vi.fn().mockResolvedValue(querySnapshot([])) };
  };
}

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

function getRequest() {
  return new Request('https://goalplace256.test/api/fantasy/admin', {
    headers: { authorization: 'Bearer token' },
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
      // Public activation is gated on the platform operating capability, not the role, so
      // the operator fixture has to be provisioned the way a real account is.
      accessIndex: {
        doc: () => ({
          get: vi.fn().mockResolvedValue(doc('platform_global_platform_user', {
            capabilities: ['platform.admin.manage'],
          })),
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

  it('limits League Admin launch state to scoped leagues', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'league_user',
      role: 'league_admin',
    });
    const collections: Record<string, unknown> = {
      users: {
        doc: () => ({
          get: vi.fn().mockResolvedValue(doc('league_user', { role: 'league_admin' })),
        }),
      },
      accessIndex: {
        where: () => ({
          get: vi.fn().mockResolvedValue(querySnapshot([
            doc('scope_1', {
              userId: 'league_user',
              scopeType: 'league',
              scopeId: 'league_allowed',
              activeRoles: ['league_admin'],
              capabilities: ['league.season.manage'],
              assignmentIds: ['assignment_1'],
              accessVersion: 1,
              updatedAt: '2026-08-02T00:00:00.000Z',
            }),
          ])),
        }),
      },
      leagues: {
        // A League Admin now asks for their own leagues by id rather than downloading every
        // league to filter down, so the stub records which ids were requested.
        where: (_field: string, _op: string, ids: string[]) => {
          requestedLeagueIds.push(...ids);
          return {
            get: vi.fn().mockResolvedValue(querySnapshot(
              [
                doc('league_allowed', { id: 'league_allowed', name: 'Allowed League', adminUserIds: [] }),
                doc('league_blocked', { id: 'league_blocked', name: 'Blocked League', adminUserIds: [] }),
              ].filter((entry) => ids.includes(entry.id)),
            )),
          };
        },
        get: vi.fn().mockResolvedValue(querySnapshot([
          doc('league_allowed', { id: 'league_allowed', name: 'Allowed League', adminUserIds: [] }),
          doc('league_blocked', { id: 'league_blocked', name: 'Blocked League', adminUserIds: [] }),
        ])),
      },
      seasons: {
        get: vi.fn().mockResolvedValue(querySnapshot([
          doc('season_allowed', { id: 'season_allowed', leagueId: 'league_allowed' }),
          doc('season_blocked', { id: 'season_blocked', leagueId: 'league_blocked' }),
        ])),
      },
      fantasyCompetitions: {
        get: vi.fn().mockResolvedValue(querySnapshot([
          doc('competition_allowed', {
            id: 'competition_allowed',
            leagueId: 'league_allowed',
            sport: 'football',
            variant: 'association_football',
            scoringProfileId: 'profile_1',
            scoringProfileVersion: 1,
            squadRulesId: 'rules_1',
            dataLevel: 'basic',
            recordedStatKeys: ['appearance'],
            status: 'proposed',
            isFreeToPlay: true,
            creditsLabel: 'Fantasy Credits',
            createdAt: '2026-08-02T00:00:00.000Z',
          }),
          doc('competition_blocked', {
            id: 'competition_blocked',
            leagueId: 'league_blocked',
            sport: 'football',
            variant: 'association_football',
            scoringProfileId: 'profile_1',
            scoringProfileVersion: 1,
            squadRulesId: 'rules_1',
            dataLevel: 'basic',
            recordedStatKeys: ['appearance'],
            status: 'proposed',
            isFreeToPlay: true,
            creditsLabel: 'Fantasy Credits',
            createdAt: '2026-08-02T00:00:00.000Z',
          }),
        ])),
      },
      fantasyScoringProfiles: { get: vi.fn().mockResolvedValue(querySnapshot([])) },
      fantasySquadRules: { get: vi.fn().mockResolvedValue(querySnapshot([])) },
      // Per-competition collections are now queried by competitionId rather than scanned
      // whole, so the stub records which ids were actually asked for.
      fantasyPlayers: { where: perCompetitionWhere('fantasyPlayers') },
      fantasyPlayerPrices: { where: perCompetitionWhere('fantasyPlayerPrices') },
      fantasyRounds: { where: perCompetitionWhere('fantasyRounds') },
    };
    vi.mocked(adminDb.collection).mockImplementation((name: string) => collections[name] as never);

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    // H13: the per-competition collections must be asked only for competitions this
    // operator can see. Scanning them whole would pull every league's fantasy dataset,
    // including the ones scoping just excluded.
    // H13's first layer: a League Admin never downloads every league on the platform.
    expect(requestedLeagueIds).toEqual(['league_allowed']);
    expect(requestedCompetitionIds.fantasyPlayers).toEqual(['competition_allowed']);
    expect(requestedCompetitionIds.fantasyPlayerPrices).toEqual(['competition_allowed']);
    expect(requestedCompetitionIds.fantasyRounds).toEqual(['competition_allowed']);
    expect(body.leagues.map((league: { id: string }) => league.id)).toEqual(['league_allowed']);
    expect(body.seasons.map((season: { id: string }) => season.id)).toEqual(['season_allowed']);
    expect(body.competitions.map((competition: { id: string }) => competition.id)).toEqual(['competition_allowed']);
  });

  it('allows scoped League Admins to prepare fantasy proposals', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'league_user',
      role: 'league_admin',
    });
    const competitionSet = vi.fn().mockResolvedValue(undefined);
    const writer = {
      create: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(adminDb.bulkWriter).mockReturnValue(writer as never);
    const collections: Record<string, unknown> = {
      users: {
        doc: () => ({
          get: vi.fn().mockResolvedValue(doc('league_user', { role: 'league_admin' })),
        }),
      },
      accessIndex: {
        where: () => ({
          get: vi.fn().mockResolvedValue(querySnapshot([
            doc('scope_1', {
              userId: 'league_user',
              scopeType: 'league',
              scopeId: 'league_1',
              activeRoles: ['league_admin'],
              capabilities: ['league.season.manage'],
              assignmentIds: ['assignment_1'],
              accessVersion: 1,
              updatedAt: '2026-08-02T00:00:00.000Z',
            }),
          ])),
        }),
      },
      leagues: {
        doc: () => ({
          get: vi.fn().mockResolvedValue(doc('league_1', {
            id: 'league_1',
            sport: 'football',
            adminUserIds: [],
          })),
        }),
      },
      seasons: {
        doc: () => ({
          get: vi.fn().mockResolvedValue(doc('season_1', {
            id: 'season_1',
            leagueId: 'league_1',
            sport: 'football',
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
            rules: [{
              id: 'appearance',
              stat: 'appearance',
              label: 'Appearance',
              points: 2,
              requiredDataLevel: 'basic',
              requiredStatKey: 'appearance',
              enabled: true,
            }],
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
      fantasyCompetitions: {
        doc: () => ({
          id: 'competition_1',
          set: competitionSet,
        }),
      },
      athletes: {
        where: () => ({
          get: vi.fn().mockResolvedValue(querySnapshot([
            doc('athlete_1', {
              id: 'athlete_1',
              leagueId: 'league_1',
              teamId: 'team_1',
              position: 'Forward',
            }),
          ])),
        }),
      },
      matches: {
        where: () => ({
          get: vi.fn().mockResolvedValue(querySnapshot([
            doc('match_1', {
              id: 'match_1',
              leagueId: 'league_1',
              seasonId: 'season_1',
              scheduledAt: '2026-08-03T12:00:00.000Z',
            }),
          ])),
        }),
      },
      fantasyPlayers: { doc: (id: string) => ({ id }) },
      fantasyPlayerPrices: { doc: (id: string) => ({ id }) },
      fantasyRounds: { doc: (id: string) => ({ id }) },
    };
    vi.mocked(adminDb.collection).mockImplementation((name: string) => collections[name] as never);

    const response = await POST(request({
      action: 'propose',
      name: 'Kampala Fantasy Pilot',
      shortName: 'Kampala Fantasy',
      sport: 'football',
      variant: 'association_football',
      leagueId: 'league_1',
      seasonId: 'season_1',
      scoringProfileId: 'profile_1',
      squadRulesId: 'rules_1',
      dataLevel: 'basic',
      recordedStatKeys: ['appearance'],
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: 'competition_1',
      status: 'proposed',
      rosterReadiness: 1,
      roundReadiness: 1,
    });
    expect(competitionSet).toHaveBeenCalled();
    expect(writer.create).toHaveBeenCalledTimes(3);
  });
});
