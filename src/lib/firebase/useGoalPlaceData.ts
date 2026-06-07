'use client';

import { useEffect, useMemo, useState } from 'react';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import {
  Athlete,
  Challenge,
  FeedPost,
  League,
  Match,
  Report,
  SportSlug,
  SportType,
  Team,
  Verification,
  VerificationStatus,
  WalletTransaction,
} from '@/types';
import { useAppStore } from '@/lib/store';

function toSportName(sport?: SportSlug | SportType): SportType {
  if (sport === 'basketball' || sport === 'Basketball') return 'Basketball';
  if (sport === 'rugby' || sport === 'Rugby') return 'Rugby';
  return 'Football';
}

function toVerificationTitle(status?: VerificationStatus | string): 'Pending' | 'Verified' | 'Disputed' | 'Rejected' {
  if (status === 'verified' || status === 'Verified') return 'Verified';
  if (status === 'disputed' || status === 'Disputed') return 'Disputed';
  if (status === 'rejected' || status === 'Rejected') return 'Rejected';
  return 'Pending';
}

function toChallengeTitle(status?: string): 'Active' | 'Achieved' | 'Failed' {
  if (status === 'achieved' || status === 'paid' || status === 'Achieved') return 'Achieved';
  if (status === 'failed' || status === 'refunded' || status === 'Failed') return 'Failed';
  return 'Active';
}

function toMatchTitle(status?: string): 'Upcoming' | 'Live' | 'Completed' {
  if (status === 'live' || status === 'Live') return 'Live';
  if (status === 'completed' || status === 'verified' || status === 'disputed' || status === 'Completed') return 'Completed';
  return 'Upcoming';
}

function toFeedType(type: FeedPost['type'] | string): FeedPost['type'] {
  const map: Record<string, FeedPost['type']> = {
    athlete_highlight: 'AthleteHighlight',
    verified_achievement: 'VerifiedAchievement',
    match_result: 'MatchResult',
    support_milestone: 'SupportMilestone',
    league_update: 'LeagueUpdate',
    sponsor_impact: 'SponsorImpact',
    awards_update: 'AnnualAwards',
  };
  return map[type] ?? (type as FeedPost['type']);
}

function toAuthorType(post: FeedPost): NonNullable<FeedPost['authorType']> {
  if (post.authorType) return post.authorType;
  if (post.authorRole === 'team') return 'Team';
  if (post.authorRole === 'league') return 'League';
  if (post.authorRole === 'sponsor') return 'Sponsor';
  if (post.authorRole === 'platform_admin' || post.authorRole === 'super_admin') return 'Admin';
  if (post.authorRole === 'athlete') return 'Athlete';
  return 'Fan';
}

function signalsForLeague(league: League) {
  return league.indexSignals ?? {
    verification: league.verifiedResultsRate ?? 0,
    matchCompletionRate: league.matchCompletionRate ?? 0,
    athleteProfileCompletion: league.athletesCount ? 82 : 0,
    fanEngagement: Math.min(100, Math.round((league.supportersCount ?? 0) / 8)),
    supportActivity: Math.min(100, Math.round((league.totalSupport ?? 0) / 50000)),
    adminReliability: league.verified ? 88 : 58,
    mediaUploads: 72,
  };
}

export function adaptAthlete(athlete: Athlete): Athlete {
  const sport = toSportName(athlete.sport);
  return {
    ...athlete,
    sport,
    avatarUrl: athlete.avatarUrl ?? athlete.avatarURL ?? '',
    coverUrl: athlete.coverUrl ?? athlete.coverURL ?? `/placeholders/${sport.toLowerCase()}-gradient.svg`,
    totalEarnings: athlete.totalEarnings ?? athlete.totalSupport ?? 0,
    verified: athlete.verified ?? athlete.verificationStatus === 'verified',
  };
}

export function adaptTeam(team: Team): Team {
  const sport = toSportName(team.sport);
  return {
    ...team,
    sport,
    location: team.location ?? team.city,
    logoUrl: team.logoUrl ?? team.logoURL ?? `/placeholders/${sport.toLowerCase()}-gradient.svg`,
    supportPool: team.supportPool ?? team.totalSupport ?? 0,
    recentResults: team.recentResults ?? ['W', 'D', 'L'],
  };
}

export function adaptLeague(league: League): League {
  const sport = toSportName(league.sport);
  return {
    ...league,
    sport,
    logoUrl: league.logoUrl ?? `/placeholders/${sport.toLowerCase()}-gradient.svg`,
    verifiedPercentage: league.verifiedPercentage ?? league.verifiedResultsRate ?? 0,
    completionRate: league.completionRate ?? league.matchCompletionRate ?? 0,
    ranking: league.ranking ?? 1,
    indexSignals: signalsForLeague(league),
  };
}

export function adaptMatch(match: Match): Match {
  const sport = toSportName(match.sport);
  return {
    ...match,
    sport,
    teamAId: match.teamAId ?? match.homeTeamId,
    teamBId: match.teamBId ?? match.awayTeamId,
    teamAScore: match.teamAScore ?? match.score?.home ?? undefined,
    teamBScore: match.teamBScore ?? match.score?.away ?? undefined,
    date: match.date ?? match.scheduledAt,
    status: toMatchTitle(match.status),
    verificationStatus: toVerificationTitle(match.verificationStatus),
  };
}

export function adaptChallenge(challenge: Challenge): Challenge {
  return {
    ...challenge,
    sport: toSportName(challenge.sport),
    targetDescription: challenge.targetDescription ?? challenge.description,
    status: toChallengeTitle(challenge.status),
    verificationStatus: toVerificationTitle(challenge.verificationStatus),
  };
}

export function adaptFeedPost(post: FeedPost): FeedPost {
  return {
    ...post,
    authorType: toAuthorType(post),
    sport: post.sport ? toSportName(post.sport) : 'Football',
    type: toFeedType(post.type),
    mediaUrl: post.mediaUrl ?? post.mediaURL,
    timestamp: post.timestamp ?? post.createdAt,
    likes: post.likes ?? post.likesCount,
    comments: post.comments ?? post.commentsCount,
    shares: post.shares ?? post.sharesCount,
    verified: post.verified ?? post.type === 'verified_achievement',
  };
}

const initialData = {
  athletes: [] as Athlete[],
  teams: [] as Team[],
  leagues: [] as League[],
  matches: [] as Match[],
  challenges: [] as Challenge[],
  feedPosts: [] as FeedPost[],
  reports: [] as Report[],
  verifications: [] as Verification[],
};

async function loadGoalPlaceData(provider = dataProvider) {
  const [athletes, teams, leagues, matches, challenges, feedPosts, reports, verifications] = await Promise.all([
    provider.getAthletes(),
    provider.getTeams(),
    provider.getLeagues(),
    provider.getMatches(),
    provider.getChallenges(),
    provider.getFeedPosts(),
    provider.getReports(),
    provider.getVerifications(),
  ]);

  return {
    athletes: athletes.map(adaptAthlete),
    teams: teams.map(adaptTeam),
    leagues: leagues.map(adaptLeague),
    matches: matches.map(adaptMatch),
    challenges: challenges.map(adaptChallenge),
    feedPosts: feedPosts.map(adaptFeedPost),
    reports,
    verifications,
  };
}

export function useGoalPlaceData() {
  const [items, setItems] = useState(initialData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const nextItems = await loadGoalPlaceData();
      if (cancelled) return;
      setItems(nextItems);
      setLoading(false);
    }

    load().catch(async () => {
      if (!cancelled) {
        setItems(await loadGoalPlaceData(mockProvider));
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const store = useAppStore();

  return useMemo(() => {
    // Merge standard mock data with any local demo session overrides
    const providerMatchesWithOverrides = items.matches.map(m => {
      const override = store.demoMatchOverrides[m.id];
      return override ? { ...m, ...override } as Match : m;
    });

    const providerChallengesWithOverrides = items.challenges.map(c => {
      const override = store.demoChallengeOverrides[c.id];
      return override ? { ...c, ...override } as Challenge : c;
    });

    const mergedMatches = [...store.demoMatches, ...providerMatchesWithOverrides];
    const uniqueMatches = Array.from(new Map(mergedMatches.map(m => [m.id, m])).values());

    const mergedChallenges = [...store.demoChallenges, ...providerChallengesWithOverrides];
    const uniqueChallenges = Array.from(new Map(mergedChallenges.map(c => [c.id, c])).values());

    return {
      athletes: [...store.demoAthletes, ...items.athletes],
      teams: [...store.demoTeams, ...items.teams],
      leagues: [...store.demoLeagues, ...items.leagues],
      matches: uniqueMatches,
      challenges: uniqueChallenges,
      feedPosts: items.feedPosts,
      reports: items.reports,
      verifications: items.verifications,
      loading,
      source: dataProvider.mode,
    };
  }, [items, loading, store.demoAthletes, store.demoTeams, store.demoLeagues, store.demoMatches, store.demoMatchOverrides, store.demoChallenges, store.demoChallengeOverrides]);
}

export function useUserWalletTransactions(userId?: string | null) {
  const [items, setItems] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));

  useEffect(() => {
    let cancelled = false;

    async function loadDemoWallet() {
      const users = await mockProvider.getUsers();
      const candidates = [...users.filter((user) => user.role === 'fan'), ...users];

      for (const user of candidates) {
        const transactions = await mockProvider.getWalletTransactionsByUser(user.id);
        if (transactions.length) return transactions;
      }

      return [];
    }

    async function load() {
      if (!userId) {
        setItems(dataProvider.mode === 'mock' ? await loadDemoWallet() : []);
        setLoading(false);
        return;
      }

      setLoading(true);
      const nextItems = await dataProvider.getWalletTransactionsByUser(userId);
      if (!cancelled) {
        setItems(nextItems.length || dataProvider.mode === 'firebase' ? nextItems : await loadDemoWallet());
        setLoading(false);
      }
    }

    load().catch(async () => {
      if (!cancelled) {
        setItems(dataProvider.mode === 'mock' ? await loadDemoWallet() : []);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { items, loading };
}
