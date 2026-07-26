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
    getReports: vi.fn().mockRejectedValue(new Error('restricted reports should not load')),
    getVerifications: vi.fn().mockRejectedValue(new Error('restricted verifications should not load')),
    getSports: empty,
    getUsers: empty,
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
    getWalletTransactionsByUser: empty,
    getNotificationsByUser: empty,
    getStandingsByLeague: empty,
    getTopSupportedAthletes: empty,
    getActiveChallenges: empty,
    getVerifiedMatches: empty,
    createSupportPledge: vi.fn(),
    createWalletTransaction: vi.fn(),
    createFeedPost: vi.fn(),
    createComment: vi.fn(),
    toggleFollow: vi.fn(),
    toggleSave: vi.fn(),
    updateMatchVerification: vi.fn(),
    updateChallengeVerification: vi.fn(),
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
  });

  it('requests platform-only collections for platform admin data loads', async () => {
    const provider = providerWithCalls();
    vi.mocked(provider.getReports).mockResolvedValueOnce([]);
    vi.mocked(provider.getVerifications).mockResolvedValueOnce([]);

    await loadGoalPlaceData(provider, { role: 'platform_admin' });

    expect(provider.getReports).toHaveBeenCalledOnce();
    expect(provider.getVerifications).toHaveBeenCalledOnce();
  });
});
