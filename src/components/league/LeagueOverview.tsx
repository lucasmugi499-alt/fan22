'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { SealCheck, Warning, Buildings, ShieldCheck, ChartLineUp } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyLeague, teamsInLeague, matchesInLeague, exceptionQueue, verifiedRate } from '@/lib/league/leagueContext';
import { buildLeagueStandings } from '@/lib/leagueModel';
import { currentSeasonFor, scoringForSeason } from '@/lib/season';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { RichStandings } from '@/components/premium/RichStandings';
import { LeagueVerification } from '@/components/league/LeagueVerification';
import { cn } from '@/lib/utils';

export function LeagueOverview() {
  const { userProfile } = useAuth();
  const { leagues, teams, matches, seasons, loading } = useGoalPlaceData();

  const league = useMemo(() => resolveMyLeague(userProfile, leagues, matches), [userProfile, leagues, matches]);

  const standings = useMemo(() => {
    if (!league) return [];
    const lTeams = teamsInLeague(league.id, teams);
    const lMatches = matchesInLeague(league.id, matches);
    const season = currentSeasonFor(seasons, league.id, league.currentSeasonId);
    return buildLeagueStandings(lTeams, lMatches, {
      seasonId: season?.id,
      scoring: season ? scoringForSeason(season, league.sport) : undefined,
    }).slice(0, 5);
  }, [league, teams, matches, seasons]);

  if (loading) return <LeagueOverviewSkeleton />;
  if (!league) return null;

  const exceptions = exceptionQueue(league.id, matches);
  const rate = verifiedRate(league.id, matches);
  const lTeams = teamsInLeague(league.id, teams);

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3.5">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[var(--radius-lg)] border border-[color:var(--border-glow)] bg-surface-2 text-lg font-bold text-text-strong shadow-[var(--glow-brand)]">
          {league.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight text-text-strong">{league.name}</h1>
            {league.verified ? <SealCheck className="h-5 w-5 shrink-0 text-[var(--state-verified)]" weight="fill" /> : null}
          </div>
          <p className="text-sm text-muted">{league.city} · {String(league.sport)} · {league.status}</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Metric icon={Warning} label="Exceptions" value={exceptions.length} tone={exceptions.length ? 'pending' : 'default'} />
        <Metric icon={Buildings} label="Teams" value={lTeams.length} />
        <Metric icon={ShieldCheck} label="Verified" value={`${rate}%`} tone="verified" />
        <Metric icon={ChartLineUp} label="Index" value={league.goalPlaceIndex} tone="brand" />
      </div>

      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-text-strong">Needs the league</h2>
          <Link href="/league-admin/verification" className="text-sm font-medium text-brand hover:underline">
            Verification queue
          </Link>
        </div>
        <LeagueVerification compact />
      </section>

      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-text-strong">Standings</h2>
          <Link href="/league-admin/teams" className="text-sm font-medium text-brand hover:underline">
            All teams
          </Link>
        </div>
        {standings.length ? (
          <RichStandings
            rows={standings}
            matches={matches}
            teamById={new Map(teams.map((t) => [t.id, t]))}
            sportById={(id) => String(teams.find((t) => t.id === id)?.sport ?? '')}
          />
        ) : (
          <Card className="p-4 text-sm text-muted">Standings appear once official results are recorded.</Card>
        )}
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Warning;
  label: string;
  value: number | string;
  tone?: 'default' | 'pending' | 'verified' | 'brand';
}) {
  const color =
    tone === 'pending'
      ? 'text-[var(--state-pending)]'
      : tone === 'verified'
        ? 'text-[var(--state-verified)]'
        : tone === 'brand'
          ? 'text-brand'
          : 'text-text-strong';
  return (
    <Card className="p-3.5">
      <span className="mb-2 inline-grid h-8 w-8 place-items-center rounded-full bg-surface-3 text-muted">
        <Icon className="h-4 w-4" weight="bold" />
      </span>
      <p data-numeric className={cn('tabular text-2xl font-bold tabular-nums', color)}>{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</p>
    </Card>
  );
}

function LeagueOverviewSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3.5">
        <Skeleton className="h-14 w-14 rounded-[var(--radius-lg)]" />
        <div className="space-y-2"><Skeleton className="h-5 w-44" /><Skeleton className="h-4 w-36" /></div>
      </div>
      <div className="grid grid-cols-4 gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-[var(--radius-lg)]" />)}
      </div>
      <Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" />
    </div>
  );
}
