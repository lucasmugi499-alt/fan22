'use client';

import { useMemo, useState } from 'react';
import { MapPin, SoccerBall, Trophy, UsersThree } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { TeamCard } from '@/components/core/EntityCards';
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
  standingForTeam,
} from './discoveryUtils';

const SPORT_ORDER = ['All', 'Football', 'Basketball', 'Rugby'];

export function TeamsDiscover({
  teams: initialTeams = [],
  leagues: initialLeagues = [],
  matches: initialMatches = [],
  seasons: initialSeasons = [],
}: {
  teams?: Team[];
  leagues?: League[];
  matches?: Match[];
  seasons?: Season[];
}) {
  const [activeSport, setActiveSport] = useState('All');
  const { teams, leagues, matches, seasons, loading } = useGoalPlaceData({
    collections: ['teams', 'leagues', 'matches', 'seasons'],
    recordLimit: 700,
  });
  const records = teams.length ? teams : initialTeams;
  const leagueRecords = leagues.length ? leagues : initialLeagues;
  const matchRecords = matches.length ? matches : initialMatches;
  const seasonRecords = seasons.length ? seasons : initialSeasons;
  const leagueById = useMemo(() => new Map(leagueRecords.map((league) => [league.id, league])), [leagueRecords]);
  const snapshots = useMemo(() => new Map(leagueRecords.map((league) => [
    league.id,
    buildLeagueTableSnapshot(league, records, matchRecords, seasonRecords),
  ])), [leagueRecords, records, matchRecords, seasonRecords]);
  const filtered = useMemo(
    () => records
      .filter((team) => activeSport === 'All' || sportLabel(String(team.sport)) === activeSport)
      .sort((a, b) => {
        const left = standingForTeam(a.id, snapshots)?.row.points ?? a.leaguePoints ?? 0;
        const right = standingForTeam(b.id, snapshots)?.row.points ?? b.leaguePoints ?? 0;
        return right - left || a.name.localeCompare(b.name);
      }),
    [activeSport, records, snapshots],
  );
  const bySport = useMemo(() => groupBy(filtered, (team) => sportLabel(String(team.sport))), [filtered]);
  const followedRegions = [...new Set(records.map((team) => regionLabel(team.city)))].slice(0, 4);
  const rankedCount = records.filter((team) => standingForTeam(team.id, snapshots)?.row.played).length;

  if (loading && !initialTeams.length) {
    return (
      <div className="grid gap-2.5 md:grid-cols-2">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-[var(--radius-lg)]" />)}
      </div>
    );
  }

  if (!records.length) {
    return <EmptyState icon={SoccerBall} title="No teams yet" description="Teams appear here as they join their leagues." />;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[var(--radius-xl)] border border-border bg-surface-1 p-5 bezel-core md:p-6">
        <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">Team discovery</p>
            <h1 className="mt-3 max-w-2xl font-display text-3xl font-semibold leading-tight text-text-strong md:text-4xl">
              Clubs by sport, region, and real table position.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Points come from official match records, so a team card now matches the active league it belongs to.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <HeroMetric icon={UsersThree} label="Teams" value={records.length} />
            <HeroMetric icon={Trophy} label="Ranked" value={rankedCount} />
            <HeroMetric icon={MapPin} label="Regions" value={followedRegions.length} />
          </div>
        </div>
        <div className="mt-5 flex gap-2 overflow-x-auto">
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

      {[...bySport.entries()].map(([sport, sportTeams]) => {
        const byRegion = groupBy(sportTeams, (team) => regionLabel(team.city));
        return (
          <section key={sport} className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle">Grouped by sport</p>
                <h2 className="font-display text-2xl font-semibold text-text-strong">{sport}</h2>
              </div>
              <span className="rounded-[var(--radius-pill)] border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
                {sportTeams.length} teams
              </span>
            </div>
            {[...byRegion.entries()].map(([region, regionTeams]) => (
              <div key={region} className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-text-strong">
                  <MapPin className="h-4 w-4 text-brand" weight="bold" />
                  {region}
                </div>
                <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                  {regionTeams.map((team) => {
                    const standing = standingForTeam(team.id, snapshots);
                    const league = leagueById.get(team.leagueId);
                    return (
                      <TeamCard
                        key={team.id}
                        team={team}
                        standing={standing?.row}
                        rank={standing?.rank}
                        leagueName={league?.name}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function HeroMetric({ icon: Icon, label, value }: { icon: typeof UsersThree; label: string; value: number }) {
  return (
    <Card className="min-w-24 p-3">
      <Icon className="h-4 w-4 text-brand" weight="bold" />
      <p data-numeric className="mt-2 text-xl font-bold tabular-nums text-text-strong">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </Card>
  );
}
