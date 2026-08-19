'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { buildLeagueStandings } from '@/lib/leagueModel';
import { isOfficialMatch } from '@/lib/status';
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
 * League Management as a first-class surface.
 *
 * Leagues were reachable only by drilling through Organizations — the detail route existed
 * but no index did, so the most common operational object on the platform had no front
 * door. Everything here is read-through: counts come from the documents themselves, and the
 * official-result count uses `isOfficialMatch`, never a stored aggregate.
 */
export function LeagueManagement() {
  const data = useGoalPlaceData({
    collections: ['leagues', 'teams', 'matches', 'seasons'],
    recordLimit: 500,
  });
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const teamsByLeague = new Map<string, number>();
    for (const team of data.teams) {
      teamsByLeague.set(team.leagueId, (teamsByLeague.get(team.leagueId) ?? 0) + 1);
    }
    return data.leagues
      .map((league) => {
        const leagueMatches = data.matches.filter((match) => match.leagueId === league.id);
        const official = leagueMatches.filter(isOfficialMatch);
        const leagueTeams = data.teams.filter((team) => team.leagueId === league.id);
        return {
          league,
          // Derived, not read from league.teamsCount — that is a stored aggregate.
          teams: teamsByLeague.get(league.id) ?? 0,
          matches: leagueMatches.length,
          official: official.length,
          // Standings prove the table can actually be built for this league.
          tableRows: buildLeagueStandings(leagueTeams, leagueMatches).length,
          pendingResults: leagueMatches.filter(
            (match) => match.status === 'completed' && match.verificationStatus === 'pending',
          ).length,
        };
      })
      .filter(({ league }) =>
        !query.trim()
        || `${league.name} ${league.city} ${league.sport}`.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => a.league.name.localeCompare(b.league.name));
  }, [data.leagues, data.teams, data.matches, query]);

  if (data.loading) return <Skeleton className="h-[560px] rounded-[var(--radius-lg)]" />;

  const totalPending = rows.reduce((sum, row) => sum + row.pendingResults, 0);
  const emptyLeagues = rows.filter((row) => row.teams === 0).length;

  return (
    <section className="space-y-5">
      <PlatformAdminHeader
        eyebrow="Network"
        title="League management"
        description="Every competition on the platform, with the numbers derived from official results rather than stored counters."
      />
      <PlatformStatGrid items={[
        { label: 'Leagues', value: rows.length },
        { label: 'Awaiting verification', value: totalPending, tone: totalPending ? 'warn' : 'good' },
        { label: 'Leagues with no clubs', value: emptyLeagues, tone: emptyLeagues ? 'warn' : 'good' },
        { label: 'Official results', value: rows.reduce((sum, row) => sum + row.official, 0) },
      ]} />
      <PlatformSearch value={query} onChange={setQuery} placeholder="Search leagues by name, city or sport" />
      <Card className="p-4">
        <div className="space-y-2.5">
          {rows.length ? rows.map((row) => (
            <DirectoryRow
              key={row.league.id}
              href={`/admin/leagues/${row.league.id}`}
              title={row.league.name}
              meta={`${row.league.city} · ${String(row.league.sport)} · ${row.teams} clubs · ${row.official}/${row.matches} official`}
              status={String(row.league.status ?? 'community')}
              statusTone={row.pendingResults ? 'warn' : 'good'}
            />
          )) : (
            <EmptyState title="No leagues match">Adjust the search to see competitions.</EmptyState>
          )}
        </div>
      </Card>
      <p className="text-xs text-subtle">
        Counts are derived from team and match documents. A league advertising more clubs
        than it holds is a data problem, not a display one —{' '}
        <Link href="/admin/competition" className="text-brand hover:underline">Competition integrity</Link>{' '}
        shows results that could not be published.
      </p>
    </section>
  );
}
