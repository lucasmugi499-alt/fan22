'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Broadcast, CaretRight, Fire, MapPin, SlidersHorizontal, Trophy } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { useAuth } from '@/context/AuthProvider';
import { isUpcomingMatch } from '@/lib/status';
import { buildLeagueStandings } from '@/lib/leagueModel';
import { currentSeasonFor, scoringForSeason } from '@/lib/season';
import { GradientBanner } from '@/components/premium/GradientBanner';
import { NewsRow } from '@/components/premium/NewsRow';
import { Crest } from '@/components/premium/Crest';
import { RichStandings } from '@/components/premium/RichStandings';
import { MatchCard } from '@/components/core/MatchCard';
import { AthleteCard } from '@/components/core/EntityCards';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/EmptyState';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FanOnboarding } from '@/components/fan/FanOnboarding';
import type { Match } from '@/types';

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function FanHome() {
  const { userProfile } = useAuth();
  const [onboardingOpen, setOnboardingOpen] = useState(
    () => Boolean(userProfile && !userProfile.onboardingCompletedAt),
  );
  useEffect(() => {
    if (userProfile && !userProfile.onboardingCompletedAt) {
      queueMicrotask(() => setOnboardingOpen(true));
    }
  }, [userProfile]);
  const { matches, teams, athletes, leagues, seasons, feedPosts, loading, error, retry } = useGoalPlaceData({
    collections: ['matches', 'teams', 'athletes', 'leagues', 'seasons', 'feedPosts'],
    athleteRanking: 'support',
    athleteLimit: 8,
    feedLimit: 12,
  });
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const followedLeagueIds = useMemo(() => userProfile?.followedLeagues ?? [], [userProfile?.followedLeagues]);
  const followedTeamIds = useMemo(() => userProfile?.followedTeams ?? [], [userProfile?.followedTeams]);
  const followedAthleteIds = useMemo(() => userProfile?.followedAthletes ?? [], [userProfile?.followedAthletes]);
  const preferredMatch = useCallback((match: Match) =>
    (!followedLeagueIds.length && !followedTeamIds.length) ||
    followedLeagueIds.includes(match.leagueId) ||
    followedTeamIds.includes(match.homeTeamId) ||
    followedTeamIds.includes(match.awayTeamId), [followedLeagueIds, followedTeamIds]);

  const live = useMemo(() => matches.filter((m) => m.status === 'live' && preferredMatch(m)), [matches, preferredMatch]);
  const upcoming = useMemo(
    () => matches.filter(isUpcomingMatch).filter((m) => m.status !== 'live' && preferredMatch(m)).sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt)).slice(0, 6),
    [matches, preferredMatch]
  );
  const topAthletes = useMemo(() => {
    const followed = athletes.filter((athlete) => followedAthleteIds.includes(athlete.id));
    return (followed.length ? followed : [...athletes].sort((a, b) => (b.goalPlacePoints ?? 0) - (a.goalPlacePoints ?? 0))).slice(0, 8);
  }, [athletes, followedAthleteIds]);
  const news = useMemo(
    () => [...feedPosts].filter((post) =>
      post.status !== 'hidden' &&
      ((!followedLeagueIds.length && !followedTeamIds.length && !followedAthleteIds.length) ||
        (post.relatedLeagueId && followedLeagueIds.includes(post.relatedLeagueId)) ||
        (post.relatedTeamId && followedTeamIds.includes(post.relatedTeamId)) ||
        (post.relatedAthleteId && followedAthleteIds.includes(post.relatedAthleteId))),
    ).sort((a, b) => +new Date(b.createdAt || b.timestamp || 0) - +new Date(a.createdAt || a.timestamp || 0)),
    [feedPosts, followedAthleteIds, followedLeagueIds, followedTeamIds]
  );

  // Featured league table: the busiest league.
  const featured = useMemo(() => {
    if (!leagues.length) return null;
    const followedLeague = leagues.find((league) => followedLeagueIds.includes(league.id));
    const count = new Map<string, number>();
    for (const m of matches) count.set(m.leagueId, (count.get(m.leagueId) ?? 0) + 1);
    const league = followedLeague ?? [...leagues].sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0))[0];
    const lTeams = teams.filter((t) => t.leagueId === league.id);
    const season = currentSeasonFor(seasons, league.id, league.currentSeasonId);
    const rows = buildLeagueStandings(lTeams, matches.filter((m) => m.leagueId === league.id), {
      seasonId: season?.id,
      scoring: season ? scoringForSeason(season, league.sport) : undefined,
    });
    return { league, rows };
  }, [leagues, teams, matches, seasons, followedLeagueIds]);

  if (loading) return <FanHomeSkeleton />;
  if (error) return <ErrorState onRetry={retry} />;

  // Group the fixtures rail by day, broadcast-style.
  const byDay = new Map<string, Match[]>();
  for (const m of [...live, ...upcoming]) {
    const key = m.status === 'live' ? 'Live now' : dayLabel(m.scheduledAt);
    byDay.set(key, [...(byDay.get(key) ?? []), m]);
  }

  return (
    <div className="space-y-6">
      <GradientBanner
        title={`Your ${userProfile?.city ?? 'Uganda'} sports today`}
        subtitle="Fixtures, official results, athletes, and league updates from the people you follow."
        variant="pitch"
      >
        <Link
          href="/discover"
          className="group inline-flex h-11 items-center gap-2 rounded-[var(--radius-pill)] bg-white pl-5 pr-1.5 text-sm font-semibold text-black"
        >
          Discover
          <span className="grid h-8 w-8 place-items-center rounded-full bg-black/10 transition-transform duration-[var(--dur-micro)] ease-[var(--ease-fluid)] group-hover:translate-x-0.5">
            <ArrowRight className="h-4 w-4" weight="bold" />
          </span>
        </Link>
      </GradientBanner>

      <section className="grid grid-cols-3 gap-2.5">
        <TodayMetric icon={Broadcast} value={String(live.length)} label="Live" />
        <TodayMetric icon={MapPin} value={String(upcoming.length)} label="Coming up" />
        <TodayMetric icon={Trophy} value={String(news.length)} label="New updates" />
      </section>

      <div className="flex justify-end">
        <Button size="sm" variant="secondary" icon={SlidersHorizontal} onClick={() => setOnboardingOpen(true)}>
          Tune my home
        </Button>
      </div>

      {/* Fixtures rail grouped by day */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-text-strong">
            {live.length ? <Broadcast className="h-4 w-4 text-[var(--state-live)]" weight="fill" /> : null}
            Fixtures
          </h2>
          <Link href="/matches" className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted hover:text-text-strong">
            View all matches <CaretRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="snap-row -mx-[var(--gutter)] px-[var(--gutter)] md:mx-0 md:px-0">
          {[...byDay.entries()].map(([day, dayMatches]) => (
            <div key={day} className="snap-item w-[300px] max-w-[86vw]">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">{day}</p>
              <div className="space-y-2.5">
                {dayMatches.slice(0, 2).map((m) => (
                  <MatchCard key={m.id} match={m} home={teamById.get(m.homeTeamId)} away={teamById.get(m.awayTeamId)} href={`/matches/${m.id}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <NewsRow title="Latest" posts={news} />

      {/* Athletes to back */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-text-strong">
            <Fire className="h-4 w-4 text-[var(--basketball)]" weight="fill" /> Athletes to back
          </h2>
          <Link href="/athletes" className="text-sm font-medium text-brand hover:underline">More</Link>
        </div>
        <div className="snap-row -mx-[var(--gutter)] px-[var(--gutter)] md:mx-0 md:px-0">
          {topAthletes.map((a) => (
            <div key={a.id} className="snap-item w-[160px]">
              <AthleteCard athlete={a} />
            </div>
          ))}
        </div>
      </section>

      {/* Featured table */}
      {featured && featured.rows.length ? (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-strong">
              <Crest name={featured.league.name} sport={String(featured.league.sport)} size={22} />
              {featured.league.name}
            </h2>
            <Link href={`/leagues/${featured.league.id}`} className="text-sm font-medium text-brand hover:underline">Full table</Link>
          </div>
          <RichStandings
            rows={featured.rows}
            matches={matches}
            teamById={teamById}
            sportById={(id) => String(teamById.get(id)?.sport ?? '')}
            sport={String(featured.league.sport)}
          />
        </section>
      ) : null}

      <FanOnboarding
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
        leagues={leagues}
        teams={teams}
        athletes={athletes}
      />
    </div>
  );
}

function TodayMetric({ icon: Icon, value, label }: { icon: typeof Broadcast; value: string; label: string }) {
  return (
    <Card className="p-3">
      <Icon className="h-4 w-4 text-brand" weight="bold" />
      <p data-numeric className="mt-2 text-xl font-bold text-text-strong">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </Card>
  );
}

function FanHomeSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-44 w-full rounded-[var(--radius-xl)]" />
      <div className="flex gap-3 overflow-hidden">
        <Skeleton className="h-40 w-[300px] shrink-0 rounded-[var(--radius-lg)]" />
        <Skeleton className="h-40 w-[300px] shrink-0 rounded-[var(--radius-lg)]" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-[var(--radius-lg)]" />)}
      </div>
    </div>
  );
}
