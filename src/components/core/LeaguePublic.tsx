'use client';

import { useMemo } from 'react';
import { Warning } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { teamsInLeague, matchesInLeague } from '@/lib/league/leagueContext';
import { buildLeagueStandings } from '@/lib/leagueModel';
import { currentSeasonFor, scoringForSeason } from '@/lib/season';
import { GradientBanner } from '@/components/premium/GradientBanner';
import { RichStandings } from '@/components/premium/RichStandings';
import { NewsRow } from '@/components/premium/NewsRow';
import { TeamCard } from '@/components/core/EntityCards';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { DemoDataNote } from '@/components/ui/DemoDataNote';

const SPORT_BANNER: Record<string, 'brand' | 'gold' | 'broadcast' | 'pitch'> = {
  football: 'pitch',
  basketball: 'gold',
  rugby: 'broadcast',
};

export function LeaguePublic({ leagueId }: { leagueId: string }) {
  const { leagues, teams, matches, seasons, feedPosts, loading } = useGoalPlaceData({
    collections: ['leagues', 'teams', 'matches', 'seasons', 'feedPosts'],
  });
  const league = useMemo(() => leagues.find((l) => l.id === leagueId), [leagues, leagueId]);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const lTeams = useMemo(() => teamsInLeague(leagueId, teams), [teams, leagueId]);
  const news = useMemo(() => feedPosts.filter((p) => p.relatedLeagueId === leagueId), [feedPosts, leagueId]);
  const standings = useMemo(() => {
    if (!league) return [];
    const season = currentSeasonFor(seasons, league.id, league.currentSeasonId);
    return buildLeagueStandings(lTeams, matchesInLeague(leagueId, matches), {
      seasonId: season?.id,
      scoring: season ? scoringForSeason(season, league.sport) : undefined,
    });
  }, [league, lTeams, matches, seasons, leagueId]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-32 w-full rounded-[var(--radius-xl)]" /><Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" /></div>;
  if (!league) return <EmptyState icon={Warning} title="League not found" description="This league may have been removed, or the link is out of date." />;

  return (
    <div className="space-y-5">
      <GradientBanner
        title={league.name}
        subtitle={`${league.city} · ${String(league.sport)[0].toUpperCase() + String(league.sport).slice(1)} · standings from official results only`}
        variant={SPORT_BANNER[String(league.sport).toLowerCase()] ?? 'pitch'}
      />

      <section className="space-y-2.5">
        <h2 className="text-[15px] font-semibold text-text-strong">Table</h2>
        <DemoDataNote />
        {standings.length ? (
          <RichStandings
            rows={standings}
            matches={matches}
            teamById={teamById}
            sportById={(id) => String(teamById.get(id)?.sport ?? '')}
          />
        ) : (
          <Card className="p-4 text-sm text-muted">Standings appear as official results are recorded.</Card>
        )}
      </section>

      <NewsRow title="League news" posts={news} />

      <section className="space-y-2.5">
        <h2 className="text-[15px] font-semibold text-text-strong">Clubs</h2>
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {lTeams.map((t) => <TeamCard key={t.id} team={t} />)}
        </div>
      </section>
    </div>
  );
}
