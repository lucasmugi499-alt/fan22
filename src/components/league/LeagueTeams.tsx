'use client';

import { useMemo, useState } from 'react';
import { Buildings } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyLeague, teamsInLeague, matchesInLeague } from '@/lib/league/leagueContext';
import { buildLeagueStandings } from '@/lib/leagueModel';
import { currentSeasonFor, scoringForSeason } from '@/lib/season';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { RichStandings } from '@/components/premium/RichStandings';
import { TeamCard } from '@/components/core/EntityCards';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

const TABS = ['Standings', 'All teams'] as const;
type Tab = (typeof TABS)[number];

export function LeagueTeams() {
  const { userProfile, isDemoMode } = useAuth();
  const { leagues, teams, matches, seasons, loading } = useGoalPlaceData({
    collections: ['leagues', 'teams', 'matches', 'seasons'],
  });
  const [tab, setTab] = useState<Tab>('Standings');

  const league = useMemo(() => resolveMyLeague(userProfile, leagues, matches, isDemoMode), [userProfile, leagues, matches, isDemoMode]);
  const lTeams = useMemo(() => (league ? teamsInLeague(league.id, teams) : []), [league, teams]);
  const standings = useMemo(() => {
    if (!league) return [];
    const season = currentSeasonFor(seasons, league.id, league.currentSeasonId);
    return buildLeagueStandings(lTeams, matchesInLeague(league.id, matches), {
      seasonId: season?.id,
      scoring: season ? scoringForSeason(season, league.sport) : undefined,
    });
  }, [league, lTeams, matches, seasons]);

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" /></div>;
  }

  return (
    <div className="-mx-[var(--gutter)] md:mx-0">
      <div className="mb-4">
        <h1 className="px-[var(--gutter)] pb-3 text-xl font-semibold text-text-strong md:px-0">Teams</h1>
        <SegmentedTabs tabs={TABS} active={tab} onChange={setTab} className="md:px-0" />
      </div>

      <div className="px-[var(--gutter)] md:px-0">
        {tab === 'Standings' ? (
          standings.length ? (
            <RichStandings
              rows={standings}
              matches={matches}
              teamById={new Map(teams.map((t) => [t.id, t]))}
              sportById={(id) => String(teams.find((t) => t.id === id)?.sport ?? '')}
            />
          ) : (
            <EmptyState icon={Buildings} title="No standings yet" description="The table fills in as official results are recorded. Pending results never move it." />
          )
        ) : lTeams.length ? (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {lTeams.map((t) => <TeamCard key={t.id} team={t} />)}
          </div>
        ) : (
          <EmptyState icon={Buildings} title="No teams yet" description="Teams that join this league appear here." />
        )}
      </div>
    </div>
  );
}
