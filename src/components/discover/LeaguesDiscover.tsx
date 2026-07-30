'use client';

import { useMemo, useState } from 'react';
import { Buildings, MapTrifold, Trophy, UsersThree } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { LeagueCard } from '@/components/core/EntityCards';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import type { League, Match, Season, Team } from '@/types';
import {
  buildLeagueTableSnapshot,
  groupBy,
  regionLabel,
  sportLabel,
  tableForLeague,
} from './discoveryUtils';

const SPORT_ORDER = ['All', 'Football', 'Basketball', 'Rugby'];

export function LeaguesDiscover({
  leagues: initialLeagues = [],
  teams: initialTeams = [],
  matches: initialMatches = [],
  seasons: initialSeasons = [],
}: {
  leagues?: League[];
  teams?: Team[];
  matches?: Match[];
  seasons?: Season[];
}) {
  const [activeSport, setActiveSport] = useState('All');
  const { leagues, teams, matches, seasons, loading } = useGoalPlaceData({
    collections: ['leagues', 'teams', 'matches', 'seasons'],
    recordLimit: 700,
  });
  const records = leagues.length ? leagues : initialLeagues;
  const teamRecords = teams.length ? teams : initialTeams;
  const matchRecords = matches.length ? matches : initialMatches;
  const seasonRecords = seasons.length ? seasons : initialSeasons;
  const snapshots = useMemo(() => new Map(records.map((league) => [
    league.id,
    buildLeagueTableSnapshot(league, teamRecords, matchRecords, seasonRecords),
  ])), [records, teamRecords, matchRecords, seasonRecords]);
  const filtered = useMemo(
    () => records
      .filter((league) => activeSport === 'All' || sportLabel(String(league.sport)) === activeSport)
      .sort((a, b) => (b.goalPlaceIndex ?? 0) - (a.goalPlaceIndex ?? 0)),
    [activeSport, records],
  );
  const bySport = useMemo(() => groupBy(filtered, (league) => sportLabel(String(league.sport))), [filtered]);
  const leagueCount = records.length;
  const teamCount = teamRecords.length || records.reduce((count, league) => count + (league.teamsCount ?? 0), 0);
  const officialCount = [...snapshots.values()].reduce((count, snapshot) => (
    count + snapshot.rows.reduce((played, row) => Math.max(played, row.played), 0)
  ), 0);
  const strongest = [...records].sort((a, b) => (b.verifiedResultsRate ?? 0) - (a.verifiedResultsRate ?? 0))[0];

  if (loading && !initialLeagues.length) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-[var(--radius-lg)]" />)}
      </div>
    );
  }

  if (!records.length) {
    return <EmptyState icon={Buildings} title="No leagues yet" description="Leagues appear here as they join GoalPlace256." />;
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface-1 bezel-core">
        <div className="grid gap-5 p-5 md:grid-cols-[1.2fr_0.8fr] md:p-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">League discovery</p>
            <h1 className="mt-3 max-w-2xl font-display text-3xl font-semibold leading-tight text-text-strong md:text-4xl">
              Find the competitions that are actually moving.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Browse by sport and region, then jump straight into official tables, fixtures, clubs and public proof.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 self-end">
            <HeroMetric icon={Buildings} label="Leagues" value={leagueCount} />
            <HeroMetric icon={UsersThree} label="Teams" value={teamCount} />
            <HeroMetric icon={Trophy} label="Official rows" value={officialCount} />
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto border-t border-border px-5 py-3 md:px-6">
          {SPORT_ORDER.map((sport) => (
            <button
              key={sport}
              type="button"
              onClick={() => setActiveSport(sport)}
              className={cn(
                'h-10 shrink-0 rounded-[var(--radius-pill)] border px-4 text-sm font-semibold transition-colors',
                activeSport === sport
                  ? 'border-brand bg-brand text-on-brand'
                  : 'border-border bg-surface-2 text-muted hover:border-border-strong hover:text-text-strong',
              )}
            >
              {sport}
            </button>
          ))}
        </div>
      </section>

      {strongest ? (
        <Card className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">Highest verification signal</p>
            <h2 className="mt-1 text-lg font-semibold text-text-strong">{strongest.name}</h2>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted">
            <span>{strongest.city}</span>
            <span data-numeric className="font-bold tabular-nums text-brand">{strongest.verifiedResultsRate}% verified</span>
          </div>
        </Card>
      ) : null}

      {[...bySport.entries()].map(([sport, sportLeagues]) => (
        <SportSection key={sport} sport={sport} leagues={sportLeagues} snapshots={snapshots} />
      ))}
    </div>
  );
}

function SportSection({
  sport,
  leagues,
  snapshots,
}: {
  sport: string;
  leagues: League[];
  snapshots: Map<string, ReturnType<typeof buildLeagueTableSnapshot>>;
}) {
  const byRegion = groupBy(leagues, (league) => regionLabel(league.city));
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle">Grouped by sport</p>
          <h2 className="font-display text-2xl font-semibold text-text-strong">{sport}</h2>
        </div>
        <span className="rounded-[var(--radius-pill)] border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
          {leagues.length} {leagues.length === 1 ? 'league' : 'leagues'}
        </span>
      </div>

      {[...byRegion.entries()].map(([region, regionLeagues]) => (
        <div key={region} className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-strong">
            <MapTrifold className="h-4 w-4 text-brand" weight="bold" />
            {region}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {regionLeagues.map((league) => {
              const table = tableForLeague(league.id, snapshots);
              const leader = table[0];
              const officialMatches = snapshots.get(league.id)?.officialMatches ?? 0;
              return (
                <LeagueCard
                  key={league.id}
                  league={league}
                  leaderName={leader?.teamName}
                  officialMatches={officialMatches}
                />
              );
            })}
          </div>
          <TablePreview leagues={regionLeagues} snapshots={snapshots} />
        </div>
      ))}
    </section>
  );
}

function TablePreview({
  leagues,
  snapshots,
}: {
  leagues: League[];
  snapshots: Map<string, ReturnType<typeof buildLeagueTableSnapshot>>;
}) {
  const rows = leagues
    .flatMap((league) => tableForLeague(league.id, snapshots).slice(0, 2).map((row) => ({ league, row })))
    .sort((a, b) => b.row.points - a.row.points)
    .slice(0, 5);
  if (!rows.length) return null;

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-1">
      <div className="grid grid-cols-[1fr_72px_52px] gap-2 border-b border-border px-3 py-2 text-[11px] font-semibold uppercase text-subtle">
        <span>Regional table pulse</span>
        <span className="text-right">League</span>
        <span className="text-right">Pts</span>
      </div>
      {rows.map(({ league, row }) => (
        <div key={`${league.id}-${row.teamId}`} className="grid grid-cols-[1fr_72px_52px] gap-2 border-b border-border px-3 py-2 text-sm last:border-0">
          <span className="truncate font-medium text-text-strong">{row.teamName}</span>
          <span className="truncate text-right text-xs text-muted">{league.city}</span>
          <span data-numeric className="text-right font-bold tabular-nums text-brand">{row.points}</span>
        </div>
      ))}
    </div>
  );
}

function HeroMetric({ icon: Icon, label, value }: { icon: typeof Buildings; label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface-2 p-3">
      <Icon className="h-4 w-4 text-brand" weight="bold" />
      <p data-numeric className="mt-2 text-xl font-bold tabular-nums text-text-strong">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}
