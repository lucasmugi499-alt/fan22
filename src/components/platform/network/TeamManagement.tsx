'use client';

import { useMemo, useState } from 'react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { buildLeagueStandings } from '@/lib/leagueModel';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  DirectoryRow,
  EmptyState,
  PlatformAdminHeader,
  PlatformSearch,
  PlatformStatGrid,
} from '@/components/platform/PlatformAdminPrimitives';

/**
 * Team Management as a first-class surface.
 *
 * Points and records come from the official standings projection, never from
 * `team.leaguePoints`. Those stored aggregates were seeded independently of any match and
 * are now repaired and deprecated; reading them here would reintroduce the second source of
 * sporting truth this platform spent a migration removing.
 */
export function TeamManagement() {
  const data = useGoalPlaceData({
    collections: ['teams', 'leagues', 'matches'],
    recordLimit: 500,
  });
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    // One standings pass per league, then look each club up in its own table.
    const standingByTeam = new Map<string, { points: number; wins: number; draws: number; losses: number }>();
    for (const league of data.leagues) {
      const leagueTeams = data.teams.filter((team) => team.leagueId === league.id);
      if (!leagueTeams.length) continue;
      const leagueMatches = data.matches.filter((match) => match.leagueId === league.id);
      for (const standing of buildLeagueStandings(leagueTeams, leagueMatches)) {
        standingByTeam.set(standing.teamId, standing);
      }
    }
    const leagueName = new Map(data.leagues.map((league) => [league.id, league.name]));
    return data.teams
      .map((team) => ({
        team,
        leagueName: leagueName.get(team.leagueId) ?? 'Unassigned',
        standing: standingByTeam.get(team.id),
        orphaned: !leagueName.has(team.leagueId),
      }))
      .filter(({ team, leagueName: name }) =>
        !query.trim()
        || `${team.name} ${team.city} ${name}`.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => a.team.name.localeCompare(b.team.name));
  }, [data.teams, data.leagues, data.matches, query]);

  if (data.loading) return <Skeleton className="h-[560px] rounded-[var(--radius-lg)]" />;

  const orphaned = rows.filter((row) => row.orphaned).length;
  const unverified = rows.filter((row) => !row.team.verified).length;

  return (
    <section className="space-y-5">
      <PlatformAdminHeader
        eyebrow="Network"
        title="Team management"
        description="Every club on the platform. Records come from the official standings projection, not stored counters."
      />
      <PlatformStatGrid items={[
        { label: 'Clubs', value: rows.length },
        { label: 'Unverified', value: unverified, tone: unverified ? 'warn' : 'good' },
        { label: 'Without a league', value: orphaned, tone: orphaned ? 'bad' : 'good' },
        { label: 'With official results', value: rows.filter((row) => (row.standing?.points ?? 0) > 0).length },
      ]} />
      <PlatformSearch value={query} onChange={setQuery} placeholder="Search clubs by name, city or league" />
      <Card className="p-4">
        <div className="space-y-2.5">
          {rows.length ? rows.slice(0, 200).map((row) => (
            <DirectoryRow
              key={row.team.id}
              href={`/admin/teams/${row.team.id}`}
              title={row.team.name}
              meta={
                `${row.leagueName} · ${row.team.city}`
                + (row.standing
                  ? ` · ${row.standing.wins}-${row.standing.draws}-${row.standing.losses}, ${row.standing.points} pts`
                  : ' · no official results')
              }
              status={row.orphaned ? 'no league' : row.team.verified ? 'verified' : 'pending'}
              statusTone={row.orphaned ? 'bad' : row.team.verified ? 'good' : 'warn'}
            />
          )) : (
            <EmptyState title="No clubs match">Adjust the search to see clubs.</EmptyState>
          )}
        </div>
      </Card>
      {rows.length > 200 ? (
        <p className="text-xs text-subtle">Showing the first 200 of {rows.length}. Narrow the search to see the rest.</p>
      ) : null}
    </section>
  );
}
