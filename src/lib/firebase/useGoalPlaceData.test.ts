import { describe, expect, it, vi } from 'vitest';
import { loadGoalPlaceData } from './useGoalPlaceData';
import type { GoalPlaceDataProvider } from '@/data/providers/types';

function providerWithCalls() {
  const empty = vi.fn().mockResolvedValue([]);
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
    getStoredStandings: empty,
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
    toggleSave: vi.fn(),
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
