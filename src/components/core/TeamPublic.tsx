'use client';

import { useMemo } from 'react';
import { MapPin, Warning, CalendarBlank, Coins, Users, Trophy } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { teamRecord } from '@/lib/team/teamContext';
import { buildLeagueStandings } from '@/lib/leagueModel';
import { currentSeasonFor, scoringForSeason } from '@/lib/season';
import { isUpcomingMatch } from '@/lib/status';
import { clubColor } from '@/lib/clubColors';
import { IdentityHero } from '@/components/premium/IdentityHero';
import { NextMatchCard } from '@/components/premium/NextMatchCard';
import { PositionCallout } from '@/components/premium/PositionCallout';
import { PeopleCarousel } from '@/components/premium/PeopleCarousel';
import { NewsRow } from '@/components/premium/NewsRow';
import { Crest } from '@/components/premium/Crest';
import { MatchCard } from '@/components/core/MatchCard';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

function ugx(n: number): string {
  if (n >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `UGX ${(n / 1_000).toFixed(0)}k`;
  return `UGX ${n}`;
}

export function TeamPublic({ teamId }: { teamId: string }) {
  const { teams, athletes, matches, leagues, seasons, feedPosts, loading } = useGoalPlaceData();
  const team = useMemo(() => teams.find((t) => t.id === teamId), [teams, teamId]);
  const league = useMemo(() => leagues.find((l) => l.id === team?.leagueId), [leagues, team]);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const roster = useMemo(() => athletes.filter((a) => a.teamId === teamId), [athletes, teamId]);
  const teamMatches = useMemo(() => matches.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId), [matches, teamId]);
  const nextMatch = useMemo(() => teamMatches.filter(isUpcomingMatch).sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))[0], [teamMatches]);
  const results = useMemo(() => teamMatches.filter((m) => m.status === 'completed').sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt)).slice(0, 3), [teamMatches]);
  const news = useMemo(() => feedPosts.filter((p) => p.relatedTeamId === teamId), [feedPosts, teamId]);

  const standings = useMemo(() => {
    if (!league) return [];
    const lTeams = teams.filter((t) => t.leagueId === league.id);
    const season = currentSeasonFor(seasons, league.id, league.currentSeasonId);
    return buildLeagueStandings(lTeams, matches.filter((m) => m.leagueId === league.id), {
      seasonId: season?.id,
      scoring: season ? scoringForSeason(season, league.sport) : undefined,
    });
  }, [league, teams, matches, seasons]);

  const sportOf = useMemo(() => (id: string) => teamById.get(id)?.sport as string | undefined, [teamById]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-36 w-full rounded-[var(--radius-xl)]" /><Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" /></div>;
  if (!team) return <EmptyState icon={Warning} title="Team not found" description="This team may have been removed, or the link is out of date." />;

  return (
    <div className="space-y-5">
      <IdentityHero
        gradient={clubColor(team.name).gradient}
        media={<Crest name={team.name} sport={String(team.sport)} size={72} className="!bg-white/15 !border-white/40 !text-white" />}
        watermark={<span className="font-display font-black text-white">{team.name.slice(0, 3).toUpperCase()}</span>}
        eyebrow={league?.name}
        title={team.name}
        verified={team.verified}
        meta={
          <>
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {team.city}</span>
            <span className="opacity-50">|</span>
            <span className="tabular tabular-nums">{teamRecord(team)}</span>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {nextMatch ? <NextMatchCard match={nextMatch} home={teamById.get(nextMatch.homeTeamId)} away={teamById.get(nextMatch.awayTeamId)} /> : null}

          {results.length ? (
            <section className="space-y-2.5">
              <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-text-strong"><CalendarBlank className="h-4 w-4 text-brand" weight="bold" /> Recent results</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {results.map((m) => <MatchCard key={m.id} match={m} home={teamById.get(m.homeTeamId)} away={teamById.get(m.awayTeamId)} href={`/matches/${m.id}`} />)}
              </div>
            </section>
          ) : null}

          <PeopleCarousel title="Squad" athletes={roster} />

          <NewsRow title="From the club" posts={news} badge={<Crest name={team.name} sport={String(team.sport)} size={22} />} />
        </div>

        <aside className="space-y-5">
          {standings.length ? <PositionCallout rows={standings} teamId={team.id} sportById={sportOf} href={league ? `/leagues/${league.id}` : '/leagues'} /> : null}

          <Card className="p-4">
            <h2 className="mb-3 text-[15px] font-semibold text-text-strong">Club</h2>
            <div className="space-y-3">
              <InfoRow icon={Trophy} label="League points" value={String(team.leaguePoints)} accent="text-brand" />
              <InfoRow icon={Users} label="Supporters" value={String(team.supportersCount)} />
              <InfoRow icon={Coins} label="Support raised" value={ugx(team.totalSupport)} accent="text-[var(--brand-2)]" />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, accent = 'text-text-strong' }: { icon: typeof Trophy; label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 text-sm text-muted"><Icon className="h-4 w-4" weight="bold" /> {label}</span>
      <span data-numeric className={`text-sm font-bold tabular-nums ${accent}`}>{value}</span>
    </div>
  );
}
