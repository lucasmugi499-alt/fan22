'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { dataMode, dataProvider } from '@/data/dataProvider';
import { GoalPlaceDataProvider } from '@/data/providers/types';
import { mockProvider } from '@/data/providers/mockProvider';
import {
  AppRole,
  Athlete,
  Challenge,
  FeedPost,
  League,
  Match,
  Report,
  Season,
  SportSlug,
  SportType,
  Team,
  Verification,
  WalletTransaction,
} from '@/types';
import { useAuth } from '@/context/AuthProvider';
import { useAppStore } from '@/lib/store';
import {
  normalizeChallengeStatus,
  normalizeMatchStatus,
  normalizeMatchVerification,
  normalizeVerificationStatus,
} from '@/lib/status';

function toSportName(sport?: SportSlug | SportType): SportType {
  if (sport === 'basketball' || sport === 'Basketball') return 'Basketball';
  if (sport === 'rugby' || sport === 'Rugby') return 'Rugby';
  return 'Football';
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
    status: normalizeMatchStatus(match.status),
    verificationStatus: normalizeMatchVerification(match.verificationStatus, match.status),
  };
}

export function adaptChallenge(challenge: Challenge): Challenge {
  return {
    ...challenge,
    sport: toSportName(challenge.sport),
    targetDescription: challenge.targetDescription ?? challenge.description,
    status: normalizeChallengeStatus(challenge.status),
    verificationStatus: normalizeVerificationStatus(challenge.verificationStatus),
  };
}

export function adaptVerification(verification: Verification): Verification {
  return {
    ...verification,
    status: normalizeVerificationStatus(verification.status),
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
  seasons: [] as Season[],
  verifications: [] as Verification[],
};

export type GoalPlaceDataCollection = keyof typeof initialData;

export const ALL_GOALPLACE_COLLECTIONS = Object.freeze(
  Object.keys(initialData) as GoalPlaceDataCollection[]
);

export function canReadPlatformCollections(role?: AppRole | null) {
  return role === 'platform_admin' || role === 'super_admin';
}

export async function loadGoalPlaceData(
  provider: GoalPlaceDataProvider = dataProvider,
  {
    role,
    collections = ALL_GOALPLACE_COLLECTIONS,
    athleteRanking,
    athleteLimit,
    feedLimit,
  }: {
    role?: AppRole | null;
    collections?: readonly GoalPlaceDataCollection[];
    athleteRanking?: 'support' | 'points';
    athleteLimit?: number;
    feedLimit?: number;
  } = {}
) {
  const requested = new Set(collections);
  const shouldLoad = (collection: GoalPlaceDataCollection) => requested.has(collection);
  const shouldLoadPlatformCollections = canReadPlatformCollections(role);
  const loadAthletes = () => {
    if (!shouldLoad('athletes')) return Promise.resolve([] as Athlete[]);
    if (athleteRanking === 'support') return provider.getTopSupportedAthletes(athleteLimit);
    if (athleteRanking === 'points') return provider.getTopPointsAthletes(athleteLimit);
    return provider.getAthletes();
  };
  const [athletes, teams, leagues, seasons, matches, challenges, feedPosts, reports, verifications] = await Promise.all([
    loadAthletes(),
    shouldLoad('teams') ? provider.getTeams() : Promise.resolve([] as Team[]),
    shouldLoad('leagues') ? provider.getLeagues() : Promise.resolve([] as League[]),
    shouldLoad('seasons') ? provider.getSeasons() : Promise.resolve([] as Season[]),
    shouldLoad('matches') ? provider.getMatches() : Promise.resolve([] as Match[]),
    shouldLoad('challenges') ? provider.getChallenges() : Promise.resolve([] as Challenge[]),
    shouldLoad('feedPosts')
      ? feedLimit
        ? provider.getLatestFeedPosts(feedLimit)
        : provider.getFeedPosts()
      : Promise.resolve([] as FeedPost[]),
    shouldLoad('reports') && shouldLoadPlatformCollections ? provider.getReports() : Promise.resolve([] as Report[]),
    shouldLoad('verifications') && shouldLoadPlatformCollections
      ? provider.getVerifications()
      : Promise.resolve([] as Verification[]),
  ]);

  return {
    athletes: athletes.map(adaptAthlete),
    teams: teams.map(adaptTeam),
    leagues: leagues.map(adaptLeague),
    seasons,
    matches: matches.map(adaptMatch),
    challenges: challenges.map(adaptChallenge),
    feedPosts: feedPosts.map(adaptFeedPost),
    reports,
    verifications: verifications.map(adaptVerification),
  };
}

export function useGoalPlaceData({
  collections = ALL_GOALPLACE_COLLECTIONS,
  athleteRanking,
  athleteLimit,
  feedLimit,
}: {
  collections?: readonly GoalPlaceDataCollection[];
  athleteRanking?: 'support' | 'points';
  athleteLimit?: number;
  feedLimit?: number;
} = {}) {
  const { role } = useAuth();
  const collectionKey = [...collections].sort().join(',');
  const selectedCollections = useMemo(
    () => collectionKey.split(',').filter(Boolean) as GoalPlaceDataCollection[],
    [collectionKey]
  );
  const [items, setItems] = useState(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  /** Lets an error surface offer retry without a full page reload. */
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const nextItems = await loadGoalPlaceData(dataProvider, {
          role,
          collections: selectedCollections,
          athleteRanking,
          athleteLimit,
          feedLimit,
        });
        if (cancelled) return;
        setItems(nextItems);
      } catch (cause) {
        if (cancelled) return;
        // A platform whose product is trusted records must never quietly replace live data
        // with seeded fixtures: a viewer could not tell the difference. In Firebase mode a
        // failure stays a failure, keeping whatever real snapshot we already hold. Mock
        // mode has no fallback to make, so the error surfaces there too.
        console.error('GoalPlace256: failed to load data from the', dataMode, 'provider', cause);
        setError(cause instanceof Error ? cause : new Error('Failed to load data'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [attempt, role, selectedCollections, athleteRanking, athleteLimit, feedLimit]);

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

    // Same override pattern for athletes, so demo support pledges move visible totals.
    const providerAthletesWithOverrides = items.athletes.map(a => {
      const override = store.demoAthleteOverrides[a.id];
      return override ? { ...a, ...override } as Athlete : a;
    });

    return {
      athletes: [...store.demoAthletes, ...providerAthletesWithOverrides],
      teams: [...store.demoTeams, ...items.teams],
      leagues: [...store.demoLeagues, ...items.leagues],
      seasons: items.seasons,
      matches: uniqueMatches,
      challenges: uniqueChallenges,
      feedPosts: items.feedPosts,
      reports: items.reports,
      verifications: items.verifications,
      loading,
      error,
      retry,
      source: dataMode,
    };
  }, [items, loading, error, retry, store.demoAthletes, store.demoTeams, store.demoLeagues, store.demoMatches, store.demoMatchOverrides, store.demoChallenges, store.demoChallengeOverrides, store.demoAthleteOverrides]);
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
