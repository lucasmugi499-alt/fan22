'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowRight, Broadcast, CaretRight, Fire } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
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
import type { Match } from '@/types';

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function FanHome() {
  const { matches, teams, athletes, leagues, seasons, feedPosts, loading, error, retry } = useGoalPlaceData({
    collections: ['matches', 'teams', 'athletes', 'leagues', 'seasons', 'feedPosts'],
    athleteRanking: 'support',
    athleteLimit: 8,
    feedLimit: 12,
  });
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const live = useMemo(() => matches.filter((m) => m.status === 'live'), [matches]);
  const upcoming = useMemo(
    () => matches.filter(isUpcomingMatch).filter((m) => m.status !== 'live').sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt)).slice(0, 6),
    [matches]
  );
  const topAthletes = useMemo(() => [...athletes].sort((a, b) => (b.totalSupport ?? 0) - (a.totalSupport ?? 0)).slice(0, 8), [athletes]);
  const news = useMemo(
    () => [...feedPosts].filter((p) => p.status !== 'hidden').sort((a, b) => +new Date(b.createdAt || b.timestamp || 0) - +new Date(a.createdAt || a.timestamp || 0)),
    [feedPosts]
  );

  // Featured league table: the busiest league.
  const featured = useMemo(() => {
    if (!leagues.length) return null;
    const count = new Map<string, number>();
    for (const m of matches) count.set(m.leagueId, (count.get(m.leagueId) ?? 0) + 1);
    const league = [...leagues].sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0))[0];
    const lTeams = teams.filter((t) => t.leagueId === league.id);
    const season = currentSeasonFor(seasons, league.id, league.currentSeasonId);
    const rows = buildLeagueStandings(lTeams, matches.filter((m) => m.leagueId === league.id), {
      seasonId: season?.id,
      scoring: season ? scoringForSeason(season, league.sport) : undefined,
    });
    return { league, rows };
  }, [leagues, teams, matches, seasons]);

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
        title="Match day"
        subtitle="Verified grassroots sport across Uganda. Back the athletes behind the game."
        variant="pitch"
      >
        <Link
          href="/athletes"
          className="group inline-flex h-11 items-center gap-2 rounded-[var(--radius-pill)] bg-white pl-5 pr-1.5 text-sm font-semibold text-black"
        >
          Discover athletes
          <span className="grid h-8 w-8 place-items-center rounded-full bg-black/10 transition-transform duration-[var(--dur-micro)] ease-[var(--ease-fluid)] group-hover:translate-x-0.5">
            <ArrowRight className="h-4 w-4" weight="bold" />
          </span>
        </Link>
      </GradientBanner>

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
          />
        </section>
      ) : null}
    </div>
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
