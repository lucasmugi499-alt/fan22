'use client';

import { useEffect, useMemo, useState } from 'react';
import { dataProvider } from '@/data/dataProvider';
import { mockDatabase } from '@/data/mockDatabase';
import {
  Athlete,
  Challenge,
  FeedPost,
  League,
  Match,
  SportSlug,
  SportType,
  Team,
  VerificationStatus,
  WalletTransaction,
} from '@/types';

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
  athletes: mockDatabase.athletes.map(adaptAthlete),
  teams: mockDatabase.teams.map(adaptTeam),
  leagues: mockDatabase.leagues.map(adaptLeague),
  matches: mockDatabase.matches.map(adaptMatch),
  challenges: mockDatabase.challenges.map(adaptChallenge),
  feedPosts: mockDatabase.feedPosts.map(adaptFeedPost),
};

export function useGoalPlaceData() {
  const [items, setItems] = useState(initialData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [athletes, teams, leagues, matches, challenges, feedPosts] = await Promise.all([
        dataProvider.getAthletes(),
        dataProvider.getTeams(),
        dataProvider.getLeagues(),
        dataProvider.getMatches(),
        dataProvider.getChallenges(),
        dataProvider.getFeedPosts(),
      ]);

      if (cancelled) return;
      setItems({
        athletes: athletes.map(adaptAthlete),
        teams: teams.map(adaptTeam),
        leagues: leagues.map(adaptLeague),
        matches: matches.map(adaptMatch),
        challenges: challenges.map(adaptChallenge),
        feedPosts: feedPosts.map(adaptFeedPost),
      });
      setLoading(false);
    }

    load().catch(() => {
      if (!cancelled) {
        setItems(initialData);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(
    () => ({
      ...items,
      loading,
      source: dataProvider.mode,
    }),
    [items, loading]
  );
}

export function useUserWalletTransactions(userId?: string | null) {
  const fallback = mockDatabase.walletTransactions as WalletTransaction[];
  const [items, setItems] = useState<WalletTransaction[]>(fallback);
  const [loading, setLoading] = useState(Boolean(userId));

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!userId) {
        setItems(fallback);
        setLoading(false);
        return;
      }

      setLoading(true);
      const nextItems = await dataProvider.getWalletTransactionsByUser(userId);
      if (!cancelled) {
        setItems(nextItems.length ? nextItems : fallback);
        setLoading(false);
      }
    }

    load().catch(() => {
      if (!cancelled) {
        setItems(fallback);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fallback, userId]);

  return { items, loading };
}

