import { describe, expect, it, vi } from 'vitest';
import { composeEntityViews, loadGoalPlaceData } from './useGoalPlaceData';
import type { GoalPlaceDataProvider } from '@/data/providers/types';

function providerWithCalls() {
  const empty = vi.fn().mockResolvedValue([]);
  const getStoredStandings = vi.fn().mockResolvedValue([]);
  const provider = {
    mode: 'firebase',
    getAthletes: vi.fn().mockResolvedValue([]),
    getTeams: vi.fn().mockResolvedValue([]),
    getLeagues: vi.fn().mockResolvedValue([]),
    getSeasons: vi.fn().mockResolvedValue([]),
    getMatches: vi.fn().mockResolvedValue([]),
    getChallenges: vi.fn().mockResolvedValue([]),
    getFeedPosts: vi.fn().mockResolvedValue([]),
    getLatestFeedPosts: vi.fn().mockResolvedValue([]),
    getReports: vi.fn().mockRejectedValue(new Error('restricted reports should not load')),
    getVerifications: vi.fn().mockRejectedValue(new Error('restricted verifications should not load')),
    getSports: empty,
    getUsers: vi.fn().mockRejectedValue(new Error('restricted users should not load')),
    getUserById: vi.fn().mockResolvedValue(undefined),
    getSponsors: empty,
    getAwardCategories: empty,
    getLeagueById: vi.fn().mockResolvedValue(undefined),
    getTeamById: vi.fn().mockResolvedValue(undefined),
    getAthleteById: vi.fn().mockResolvedValue(undefined),
    getMatchById: vi.fn().mockResolvedValue(undefined),
    getChallengeById: vi.fn().mockResolvedValue(undefined),
    getFeedPostById: vi.fn().mockResolvedValue(undefined),
    getCommentsByPost: empty,
    getNotificationsByUser: empty,
    getRosters: empty,
    getStoredStandings,
    getSponsorReports: empty,
    getSponsorCampaigns: empty,
    getLeagueNotices: empty,
    getFinalizations: empty,
    getSupportNeeds: empty,
    getLeagueAdminApplications: empty,
    getAdminAuditEvents: empty,
    getStandingsByLeague: empty,
    getTopSupportedAthletes: empty,
    getTopPointsAthletes: empty,
    getActiveChallenges: empty,
    getVerifiedMatches: empty,
    createFeedPost: vi.fn(),
    createComment: vi.fn(),
    toggleFollow: vi.fn(),
  } as unknown as GoalPlaceDataProvider;

  return provider;
}

describe('loadGoalPlaceData', () => {
  it('does not request platform-only collections for fan data loads', async () => {
    const provider = providerWithCalls();

    await expect(loadGoalPlaceData(provider, { role: 'fan' })).resolves.toMatchObject({
      reports: [],
      verifications: [],
    });

    expect(provider.getReports).not.toHaveBeenCalled();
    expect(provider.getVerifications).not.toHaveBeenCalled();
    expect(provider.getUsers).not.toHaveBeenCalled();
  });

  it('does not read the obsolete stored standings projection', async () => {
    const provider = providerWithCalls();

    await loadGoalPlaceData(provider, { role: 'fan' });

    expect((provider as GoalPlaceDataProvider & { getStoredStandings: ReturnType<typeof vi.fn> })
      .getStoredStandings).not.toHaveBeenCalled();
  });

  it('requests platform-only collections for platform admin data loads', async () => {
    const provider = providerWithCalls();
    vi.mocked(provider.getReports).mockResolvedValueOnce([]);
    vi.mocked(provider.getVerifications).mockResolvedValueOnce([]);
    vi.mocked(provider.getUsers).mockResolvedValueOnce([]);

    await loadGoalPlaceData(provider, { role: 'platform_admin' });

    expect(provider.getReports).toHaveBeenCalledOnce();
    expect(provider.getVerifications).toHaveBeenCalledOnce();
    expect(provider.getUsers).toHaveBeenCalledOnce();
  });

  it('requests only the collections selected by a screen', async () => {
    const provider = providerWithCalls();

    await loadGoalPlaceData(provider, {
      role: 'fan',
      collections: ['matches', 'teams'],
    });

    expect(provider.getMatches).toHaveBeenCalledOnce();
    expect(provider.getTeams).toHaveBeenCalledOnce();
    expect(provider.getAthletes).not.toHaveBeenCalled();
    expect(provider.getLeagues).not.toHaveBeenCalled();
    expect(provider.getSeasons).not.toHaveBeenCalled();
    expect(provider.getChallenges).not.toHaveBeenCalled();
    expect(provider.getFeedPosts).not.toHaveBeenCalled();
  });

  it('does not request any public collections when an empty collection set is selected', async () => {
    const provider = providerWithCalls();

    await loadGoalPlaceData(provider, {
      role: 'fan',
      collections: [],
    });

    expect(provider.getAthletes).not.toHaveBeenCalled();
    expect(provider.getTeams).not.toHaveBeenCalled();
    expect(provider.getLeagues).not.toHaveBeenCalled();
    expect(provider.getSeasons).not.toHaveBeenCalled();
    expect(provider.getMatches).not.toHaveBeenCalled();
  });

  it('does not request an unselected platform collection for an admin', async () => {
    const provider = providerWithCalls();
    vi.mocked(provider.getReports).mockResolvedValueOnce([]);

    await loadGoalPlaceData(provider, {
      role: 'platform_admin',
      collections: ['reports'],
    });

    expect(provider.getReports).toHaveBeenCalledOnce();
    expect(provider.getVerifications).not.toHaveBeenCalled();
    expect(provider.getUsers).not.toHaveBeenCalled();
  });

  it('uses limited ranking and feed queries when a screen requests them', async () => {
    const provider = providerWithCalls();

    await loadGoalPlaceData(provider, {
      role: 'fan',
      collections: ['athletes', 'feedPosts'],
      athleteRanking: 'support',
      athleteLimit: 8,
      feedLimit: 12,
    });

    expect(provider.getTopSupportedAthletes).toHaveBeenCalledWith(8);
    expect(provider.getLatestFeedPosts).toHaveBeenCalledWith(12);
    expect(provider.getAthletes).not.toHaveBeenCalled();
    expect(provider.getFeedPosts).not.toHaveBeenCalled();
  });
});

describe('demo state cannot reach a real data view', () => {
  /**
   * The merge below used to run unconditionally, on the assumption that the demo store
   * would be empty outside demo mode. "Usually empty" is not a boundary — a layer that
   * decides what the app believes must not be able to accept synthetic state just because
   * an in-memory store happened to hold some.
   */
  const realAthlete = { id: 'athlete_real', name: 'Real Athlete', totalSupport: 100 };
  const demoAthlete = { id: 'athlete_demo', name: 'Demo Athlete', totalSupport: 999999 };

  const contaminatedStore = {
    demoAthletes: [demoAthlete],
    demoTeams: [{ id: 'team_demo', name: 'Demo Team' }],
    demoLeagues: [{ id: 'league_demo', name: 'Demo League' }],
    demoMatches: [{ id: 'match_demo' }],
    demoChallenges: [{ id: 'challenge_demo' }],
    // The dangerous one: an override that rewrites a REAL athlete's support total.
    demoAthleteOverrides: { athlete_real: { totalSupport: 888888 } },
    demoMatchOverrides: {},
    demoChallengeOverrides: {},
  } as never;

  const items = {
    athletes: [realAthlete],
    teams: [{ id: 'team_real' }],
    leagues: [{ id: 'league_real' }],
    matches: [{ id: 'match_real' }],
    challenges: [{ id: 'challenge_real' }],
  } as never;

  it('returns provider data untouched when not in demo mode', () => {
    const view = composeEntityViews({ isDemoMode: false, items, demo: contaminatedStore });

    expect(view.athletes.map((a) => a.id)).toEqual(['athlete_real']);
    expect(view.teams.map((t) => t.id)).toEqual(['team_real']);
    expect(view.leagues.map((l) => l.id)).toEqual(['league_real']);
    expect(view.matches.map((m) => m.id)).toEqual(['match_real']);
    expect(view.challenges.map((c) => c.id)).toEqual(['challenge_real']);
  });

  it('does not let a demo override rewrite a real athlete outside demo mode', () => {
    // The subtle half: not just extra rows, but silently changed values on real ones.
    const view = composeEntityViews({ isDemoMode: false, items, demo: contaminatedStore });
    expect(view.athletes[0].totalSupport).toBe(100);
  });

  it('still merges demo state in demo mode', () => {
    // The guard must not break the demo experience it is protecting production from.
    const view = composeEntityViews({ isDemoMode: true, items, demo: contaminatedStore });
    expect(view.athletes.map((a) => a.id)).toContain('athlete_demo');
    expect(view.athletes.find((a) => a.id === 'athlete_real')?.totalSupport).toBe(888888);
    expect(view.matches.map((m) => m.id)).toEqual(expect.arrayContaining(['match_demo', 'match_real']));
  });
});
