'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { dataMode, dataProvider } from '@/data/dataProvider';
import { GoalPlaceDataProvider } from '@/data/providers/types';
import { mockProvider } from '@/data/providers/mockProvider';
import {
  AppRole,
  Athlete,
  AdminAuditEvent,
  Challenge,
  FinalizationRecord,
  FeedPost,
  League,
  LeagueAdminApplication,
  LeagueNotice,
  Match,
  Notification,
  Report,
  Roster,
  Season,
  SponsorReport,
  SponsorCampaign,
  Sponsor,
  StoredStanding,
  SupportNeed,
  Team,
  TeamAssignment,
  User,
  Verification,
} from '@/types';
import { useAuth } from '@/context/AuthProvider';
import { useAppStore } from '@/lib/store';
import {
  normalizeChallengeStatus,
  normalizeVerificationStatus,
} from '@/lib/status';
import { cacheData, privateCacheNamespace, readCachedData } from '@/lib/offline';
import type { Contribution } from '@/types/money';
import type { DataQueryOptions } from '@/data/providers/types';

// `adaptMatch` and `toSportName` moved to @/lib/matchRecord so the server-rendered public
// pages can apply the same mapping. Imported (not just re-exported) because this module
// uses `toSportName` locally; re-exported because existing callers import `adaptMatch`
// from here.
import { adaptMatch, toSportName } from '@/lib/matchRecord';

export { adaptMatch, toSportName };

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

export function adaptChallenge(challenge: Challenge): Challenge {
  return {
    ...challenge,
    sport: toSportName(challenge.sport),
    targetDescription: challenge.targetDescription ?? challenge.description,
    status: normalizeChallengeStatus(challenge.status),
    fundingModel: challenge.fundingModel ?? 'non_cash',
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
  rosters: [] as Roster[],
  sponsorReports: [] as SponsorReport[],
  sponsorCampaigns: [] as SponsorCampaign[],
  leagueNotices: [] as LeagueNotice[],
  /**
   * The stored league table.
   *
   * Requested as its own collection rather than derived from `matches`, because deriving it
   * from `matches` is the defect: a page asks for `recordLimit` matches, gets an arbitrary
   * page of a long season, and computes a confident table from it. One row per team is
   * bounded by how many clubs a league has, not by how long its season is.
   */
  standings: [] as StoredStanding[],
  finalizations: [] as FinalizationRecord[],
  supportNeeds: [] as SupportNeed[],
  leagueAdminApplications: [] as LeagueAdminApplication[],
  adminAuditEvents: [] as AdminAuditEvent[],
  sponsors: [] as Sponsor[],
  teamAssignments: [] as TeamAssignment[],
  users: [] as User[],
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
    scope,
    recordLimit,
  }: {
    role?: AppRole | null;
    collections?: readonly GoalPlaceDataCollection[];
    athleteRanking?: 'support' | 'points';
    athleteLimit?: number;
    feedLimit?: number;
    scope?: DataQueryOptions;
    recordLimit?: number;
  } = {}
) {
  const requested = new Set(collections);
  const shouldLoad = (collection: GoalPlaceDataCollection) => requested.has(collection);
  const shouldLoadPlatformCollections = canReadPlatformCollections(role);
  const loadAthletes = () => {
    if (!shouldLoad('athletes')) return Promise.resolve([] as Athlete[]);
    if (athleteRanking === 'support') return provider.getTopSupportedAthletes(athleteLimit);
    if (athleteRanking === 'points') return provider.getTopPointsAthletes(athleteLimit);
    return provider.getAthletes({ ...scope, limit: athleteLimit ?? recordLimit });
  };
  const [
    athletes,
    teams,
    leagues,
    seasons,
    matches,
    challenges,
    feedPosts,
    reports,
    verifications,
    rosters,
    sponsorReports,
    sponsorCampaigns,
    leagueNotices,
    standings,
    finalizations,
    supportNeeds,
    leagueAdminApplications,
    adminAuditEvents,
    sponsors,
    teamAssignments,
    users,
  ] = await Promise.all([
    loadAthletes(),
    shouldLoad('teams') ? provider.getTeams({ ...scope, limit: recordLimit }) : Promise.resolve([] as Team[]),
    shouldLoad('leagues') ? provider.getLeagues() : Promise.resolve([] as League[]),
    shouldLoad('seasons') ? provider.getSeasons() : Promise.resolve([] as Season[]),
    shouldLoad('matches') ? provider.getMatches({ ...scope, limit: recordLimit }) : Promise.resolve([] as Match[]),
    shouldLoad('challenges') ? provider.getChallenges({ ...scope, limit: recordLimit }) : Promise.resolve([] as Challenge[]),
    shouldLoad('feedPosts')
      ? feedLimit
        ? provider.getLatestFeedPosts(feedLimit)
        : provider.getFeedPosts({ ...scope, limit: recordLimit })
      : Promise.resolve([] as FeedPost[]),
    shouldLoad('reports') && shouldLoadPlatformCollections ? provider.getReports() : Promise.resolve([] as Report[]),
    shouldLoad('verifications') && shouldLoadPlatformCollections
      ? provider.getVerifications()
      : Promise.resolve([] as Verification[]),
    shouldLoad('rosters') ? provider.getRosters({ ...scope, limit: recordLimit }) : Promise.resolve([] as Roster[]),
    shouldLoad('sponsorReports')
      ? provider.getSponsorReports()
      : Promise.resolve([] as SponsorReport[]),
    shouldLoad('sponsorCampaigns')
      ? provider.getSponsorCampaigns()
      : Promise.resolve([] as SponsorCampaign[]),
    shouldLoad('leagueNotices')
      ? provider.getLeagueNotices({ ...scope, limit: recordLimit })
      : Promise.resolve([] as LeagueNotice[]),
    // Deliberately NOT passed `recordLimit`. That limit exists to bound long collections like
    // matches and feed posts; applying it to a table would truncate the very thing this
    // collection was created to stop being truncated.
    shouldLoad('standings')
      ? provider.getStoredStandings({ leagueId: scope?.leagueId, seasonId: scope?.seasonId })
      : Promise.resolve([] as StoredStanding[]),
    shouldLoad('finalizations')
      ? provider.getFinalizations()
      : Promise.resolve([] as FinalizationRecord[]),
    shouldLoad('supportNeeds')
      ? provider.getSupportNeeds({ ...scope, limit: recordLimit })
      : Promise.resolve([] as SupportNeed[]),
    shouldLoad('leagueAdminApplications') && shouldLoadPlatformCollections
      ? provider.getLeagueAdminApplications()
      : Promise.resolve([] as LeagueAdminApplication[]),
    shouldLoad('adminAuditEvents') && shouldLoadPlatformCollections
      ? provider.getAdminAuditEvents()
      : Promise.resolve([] as AdminAuditEvent[]),
    shouldLoad('sponsors') ? provider.getSponsors() : Promise.resolve([] as Sponsor[]),
    shouldLoad('teamAssignments') && shouldLoadPlatformCollections && typeof provider.getTeamAssignments === 'function'
      ? provider.getTeamAssignments()
      : Promise.resolve([] as TeamAssignment[]),
    shouldLoad('users') && shouldLoadPlatformCollections
      ? provider.getUsers()
      : Promise.resolve([] as User[]),
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
    rosters,
    sponsorReports,
    sponsorCampaigns,
    leagueNotices,
    standings,
    finalizations,
    supportNeeds,
    leagueAdminApplications,
    adminAuditEvents,
    sponsors,
    teamAssignments,
    users,
  };
}

/**
 * Which entities a data view is allowed to show.
 *
 * Demo mode merges an in-memory store of synthetic matches, teams, leagues and athletes into
 * provider results, plus per-entity overrides that move visible support totals. That merge
 * used to run unconditionally, on the assumption the demo arrays would simply be empty
 * outside demo mode.
 *
 * "Usually empty" is not a boundary. A layer that decides what the app believes must not be
 * capable of accepting synthetic state merely because an in-memory store happened to hold
 * some — the same one-truth-source rule this codebase applies to sporting data, applied to
 * the layer that displays it.
 *
 * Extracted from the hook so the boundary is a pure function with a test, rather than a
 * branch buried in a useMemo that nothing can exercise.
 */
export function composeEntityViews(input: {
  isDemoMode: boolean;
  items: {
    athletes: Athlete[];
    teams: Team[];
    leagues: League[];
    matches: Match[];
    challenges: Challenge[];
  };
  demo: {
    demoAthletes: Athlete[];
    demoTeams: Team[];
    demoLeagues: League[];
    demoMatches: Match[];
    demoChallenges: Challenge[];
    demoMatchOverrides: Record<string, Partial<Match>>;
    demoChallengeOverrides: Record<string, Partial<Challenge>>;
    demoAthleteOverrides: Record<string, Partial<Athlete>>;
  };
}) {
  const { items, demo } = input;

  if (!input.isDemoMode) {
    return {
      athletes: items.athletes,
      teams: items.teams,
      leagues: items.leagues,
      matches: items.matches,
      challenges: items.challenges,
    };
  }

  const matchesWithOverrides = items.matches.map((match) => {
    const override = demo.demoMatchOverrides[match.id];
    return override ? ({ ...match, ...override } as Match) : match;
  });
  const challengesWithOverrides = items.challenges.map((challenge) => {
    const override = demo.demoChallengeOverrides[challenge.id];
    return override ? ({ ...challenge, ...override } as Challenge) : challenge;
  });
  // Same override pattern for athletes, so demo support pledges move visible totals.
  const athletesWithOverrides = items.athletes.map((athlete) => {
    const override = demo.demoAthleteOverrides[athlete.id];
    return override ? ({ ...athlete, ...override } as Athlete) : athlete;
  });

  const dedupe = <T extends { id: string }>(rows: T[]) =>
    Array.from(new Map(rows.map((row) => [row.id, row])).values());

  return {
    athletes: [...demo.demoAthletes, ...athletesWithOverrides],
    teams: [...demo.demoTeams, ...items.teams],
    leagues: [...demo.demoLeagues, ...items.leagues],
    matches: dedupe([...demo.demoMatches, ...matchesWithOverrides]),
    challenges: dedupe([...demo.demoChallenges, ...challengesWithOverrides]),
  };
}

export function useGoalPlaceData({
  collections = ALL_GOALPLACE_COLLECTIONS,
  athleteRanking,
  athleteLimit,
  feedLimit,
  scope,
  recordLimit,
}: {
  collections?: readonly GoalPlaceDataCollection[];
  athleteRanking?: 'support' | 'points';
  athleteLimit?: number;
  feedLimit?: number;
  scope?: DataQueryOptions;
  recordLimit?: number;
} = {}) {
  const { currentUser, isDemoMode, role, userProfile } = useAuth();
  const collectionListKey = [...collections].sort().join(',');
  const scopeKey = `${scope?.leagueId ?? ''}:${scope?.teamId ?? ''}:${scope?.athleteId ?? ''}:${scope?.matchId ?? ''}:${recordLimit ?? ''}`;
  const uid = currentUser?.uid ?? userProfile?.uid ?? 'public';
  const cacheNamespace = privateCacheNamespace({
    environment: process.env.NEXT_PUBLIC_GOALPLACE_ENVIRONMENT ?? process.env.NODE_ENV ?? 'local',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'unconfigured',
    databaseId: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID ?? '(default)',
    dataMode,
    uid,
    role: role ?? (isDemoMode ? 'demo' : 'public'),
    leagueId: scope?.leagueId,
    teamId: scope?.teamId,
  });
  const collectionKey = `${cacheNamespace}|${collectionListKey}|${scopeKey}`;
  const stableScope = useMemo<DataQueryOptions>(() => ({
    leagueId: scope?.leagueId,
    teamId: scope?.teamId,
    athleteId: scope?.athleteId,
    matchId: scope?.matchId,
  }), [scope?.athleteId, scope?.leagueId, scope?.matchId, scope?.teamId]);
  const selectedCollections = useMemo(
    () => collectionListKey.split(',').filter(Boolean) as GoalPlaceDataCollection[],
    [collectionListKey]
  );
  const [items, setItems] = useState(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [offline, setOffline] = useState(false);
  const [cachedAt, setCachedAt] = useState<string>();
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
          scope: stableScope,
          recordLimit,
        });
        if (cancelled) return;
        setItems(nextItems);
        setOffline(false);
        setCachedAt(undefined);
        void cacheData(collectionKey, nextItems);
      } catch (cause) {
        if (cancelled) return;
        // A platform whose product is trusted records must never quietly replace live data
        // with seeded fixtures: a viewer could not tell the difference. In Firebase mode a
        // failure stays a failure, keeping whatever real snapshot we already hold. Mock
        // mode has no fallback to make, so the error surfaces there too.
        console.error('GoalPlace256: failed to load data from the', dataMode, 'provider', cause);
        const cached = await readCachedData<typeof initialData>(collectionKey).catch(() => undefined);
        if (cached && !cancelled) {
          setItems(cached.value);
          setOffline(true);
          setCachedAt(cached.cachedAt);
          setError(null);
        } else {
          setError(cause instanceof Error ? cause : new Error('Failed to load data'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [
    attempt,
    role,
    selectedCollections,
    athleteRanking,
    athleteLimit,
    collectionKey,
    feedLimit,
    recordLimit,
    stableScope,
  ]);

  const store = useAppStore();

  /**
   * The demo slice, pinned to its individual fields.
   *
   * Depending on the whole store object would recompute the view on any unrelated store
   * change; naming the fields keeps the memo as narrow as it was before the composer was
   * extracted.
   */
  const demo = useMemo(() => ({
    demoAthletes: store.demoAthletes,
    demoTeams: store.demoTeams,
    demoLeagues: store.demoLeagues,
    demoMatches: store.demoMatches,
    demoChallenges: store.demoChallenges,
    demoMatchOverrides: store.demoMatchOverrides,
    demoChallengeOverrides: store.demoChallengeOverrides,
    demoAthleteOverrides: store.demoAthleteOverrides,
  }), [
    store.demoAthletes, store.demoTeams, store.demoLeagues, store.demoMatches,
    store.demoChallenges, store.demoMatchOverrides, store.demoChallengeOverrides,
    store.demoAthleteOverrides,
  ]);

  return useMemo(() => {
    const { athletes, teams, leagues, matches, challenges } = composeEntityViews({
      isDemoMode,
      items,
      demo,
    });

    return {
      athletes,
      teams,
      leagues,
      seasons: items.seasons,
      matches,
      challenges,
      feedPosts: items.feedPosts,
      reports: items.reports,
      verifications: items.verifications,
      rosters: items.rosters,
      sponsorReports: items.sponsorReports,
      sponsorCampaigns: items.sponsorCampaigns,
      leagueNotices: items.leagueNotices,
      standings: items.standings,
      finalizations: items.finalizations,
      supportNeeds: items.supportNeeds,
      leagueAdminApplications: items.leagueAdminApplications,
      adminAuditEvents: items.adminAuditEvents,
      sponsors: items.sponsors,
      teamAssignments: items.teamAssignments,
      users: items.users,
      loading,
      error,
      retry,
      source: dataMode,
      offline,
      cachedAt,
    };
  }, [items, loading, error, retry, offline, cachedAt, isDemoMode, demo]);
}

export function useUserNotifications(userId?: string | null) {
  const { isDemoMode, role } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<Error>();
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true);
        setError(undefined);
      }
    });
    const cacheKey = `${privateCacheNamespace({
      environment: process.env.NEXT_PUBLIC_GOALPLACE_ENVIRONMENT ?? process.env.NODE_ENV ?? 'local',
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'unconfigured',
      databaseId: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID ?? '(default)',
      dataMode: isDemoMode ? 'mock' : 'firebase',
      uid: userId,
      role: role ?? 'fan',
    })}|notifications`;
    const unsubscribe = provider.subscribeToNotifications(
      userId,
      (notifications) => {
        if (cancelled) return;
        const sorted = [...notifications].sort((a, b) => +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0));
        setItems(sorted);
        setError(undefined);
        setLoading(false);
        void cacheData(cacheKey, sorted);
      },
      async (cause) => {
        if (cancelled) return;
        const cached = await readCachedData<Notification[]>(cacheKey).catch(() => undefined);
        if (cached) setItems(cached.value);
        else setError(cause);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [attempt, isDemoMode, provider, role, userId]);

  return { items: userId ? items : [], loading: userId ? loading : false, error, retry };
}

export function useUserContributions(userId?: string | null) {
  const { isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const [items, setItems] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<Error>();
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true);
        setError(undefined);
      }
    });
    provider.getContributionsByUser(userId)
      .then((contributions) => {
        if (!cancelled) {
          setItems(contributions);
          setError(undefined);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause : new Error('Contribution activity is unavailable.'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, provider, userId]);

  return { items: userId ? items : [], loading: userId ? loading : false, error, retry };
}
