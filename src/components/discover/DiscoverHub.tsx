'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { MagnifyingGlass, Target, TrendUp } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { AthleteCard, LeagueCard, TeamCard } from '@/components/core/EntityCards';
import { MatchCard } from '@/components/core/MatchCard';
import { GradientBanner } from '@/components/premium/GradientBanner';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import type { Athlete, Challenge, League, Match, Season, Team } from '@/types';
import {
  buildLeagueTableSnapshot,
  standingForTeam,
  type LeagueTableSnapshot,
} from './discoveryUtils';

const TABS = ['For You', 'Athletes', 'Teams', 'Leagues', 'Matches', 'Challenges'] as const;
type Tab = (typeof TABS)[number];

export function DiscoverHub() {
  const { userProfile } = useAuth();
  const { athletes, teams, leagues, matches, seasons, challenges, loading } = useGoalPlaceData({
    collections: ['athletes', 'teams', 'leagues', 'matches', 'seasons', 'challenges'],
    recordLimit: 1_200,
  });
  const [tab, setTab] = useState<Tab>('For You');
  const [sport, setSport] = useState('all');
  const [city, setCity] = useState('all');
  const [query, setQuery] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const teamById = useMemo(() => new Map(teams.map((item) => [item.id, item])), [teams]);
  const leagueById = useMemo(() => new Map(leagues.map((item) => [item.id, item])), [leagues]);
  const leagueSnapshots = useLeagueSnapshots(leagues, teams, matches, seasons);

  const pointsForTeam = useCallback(
    (team: Team) => standingForTeam(team.id, leagueSnapshots)?.row.points ?? team.leaguePoints,
    [leagueSnapshots],
  );

  const matchesFilters = useCallback((item: { sport: unknown; city: string; name?: string }) =>
    (sport === 'all' || String(item.sport).toLowerCase() === sport) &&
    (city === 'all' || item.city === city) &&
    (!query || (item.name ?? '').toLowerCase().includes(query.toLowerCase())), [city, query, sport]);

  const filteredAthletes = useMemo(() => athletes
    .filter((item) => {
      const team = teamById.get(item.teamId);
      const league = leagueById.get(item.leagueId);
      const haystack = `${item.name} ${item.position} ${item.city} ${item.sport} ${team?.name ?? ''} ${league?.name ?? ''}`.toLowerCase();
      return matchesFilters(item) &&
        (!query || haystack.includes(query.toLowerCase())) &&
        (!verifiedOnly || item.verified);
    })
    .sort((a, b) => b.goalPlacePoints - a.goalPlacePoints), [athletes, leagueById, matchesFilters, query, teamById, verifiedOnly]);
  const filteredTeams = useMemo(() => teams
    .filter((item) => matchesFilters(item) && (!verifiedOnly || item.verified))
    .sort((a, b) => pointsForTeam(b) - pointsForTeam(a)), [teams, matchesFilters, pointsForTeam, verifiedOnly]);
  const filteredLeagues = useMemo(() => leagues
    .filter((item) => matchesFilters(item) && (!verifiedOnly || item.verified))
    .sort((a, b) => b.goalPlaceIndex - a.goalPlaceIndex), [leagues, matchesFilters, verifiedOnly]);
  const filteredMatches = useMemo(() => matches
    .filter((item) => {
      const home = teamById.get(item.homeTeamId);
      const away = teamById.get(item.awayTeamId);
      const haystack = `${home?.name ?? ''} ${away?.name ?? ''} ${item.venue}`.toLowerCase();
      return (sport === 'all' || String(item.sport).toLowerCase() === sport) &&
        (city === 'all' || item.city === city) &&
        (!query || haystack.includes(query.toLowerCase())) &&
        (!verifiedOnly || item.verificationStatus === 'verified');
    })
    .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt)), [matches, city, query, sport, teamById, verifiedOnly]);
  const filteredChallenges = useMemo(() => challenges
    .filter((item) => {
      const athlete = athletes.find((candidate) => candidate.id === item.athleteId);
      return (sport === 'all' || String(item.sport).toLowerCase() === sport) &&
        (city === 'all' || athlete?.city === city) &&
        (!query || `${item.description} ${athlete?.name ?? ''}`.toLowerCase().includes(query.toLowerCase())) &&
        (!verifiedOnly || item.verificationStatus === 'verified');
    })
    .sort((a, b) => b.totalPledged - a.totalPledged), [athletes, challenges, city, query, sport, verifiedOnly]);

  const forYou = {
    athletes: followedOrTop(athletes, userProfile?.followedAthletes, (item) => item.goalPlacePoints),
    teams: followedOrTop(teams, userProfile?.followedTeams, pointsForTeam),
    leagues: followedOrTop(leagues, userProfile?.followedLeagues, (item) => item.goalPlaceIndex),
  };
  const cities = [...new Set(leagues.map((item) => item.city))].sort();

  if (loading) return <DiscoverSkeleton />;

  return (
    <div className="-mx-[var(--gutter)] space-y-5 md:mx-0">
      <div className="px-[var(--gutter)] md:px-0">
        <GradientBanner
          title="Discover"
          subtitle="Rising athletes, active leagues, community teams, and verified match stories."
          variant="broadcast"
        />
      </div>

      <SegmentedTabs tabs={TABS} active={tab} onChange={setTab} className="md:px-0" />

      <div className="space-y-4 px-[var(--gutter)] md:px-0">
        <div className="grid gap-2 rounded-[var(--radius-lg)] border border-border bg-surface-1 p-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,auto)]">
          <label className="relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              aria-label="Search discover"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search this view"
              className="h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 pl-9 pr-3 text-sm text-text-strong"
            />
          </label>
          <select aria-label="Filter by sport" value={sport} onChange={(event) => setSport(event.target.value)} className="h-11 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text-strong">
            <option value="all">All sports</option>
            <option value="football">Football</option>
            <option value="basketball">Basketball</option>
            <option value="rugby">Rugby</option>
          </select>
          <select aria-label="Filter by region" value={city} onChange={(event) => setCity(event.target.value)} className="h-11 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text-strong">
            <option value="all">All regions</option>
            {cities.map((item) => <option key={item}>{item}</option>)}
          </select>
          <label className="flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-muted">
            <input type="checkbox" checked={verifiedOnly} onChange={(event) => setVerifiedOnly(event.target.checked)} className="accent-[var(--brand)]" />
            Verified
          </label>
        </div>

        {tab === 'For You' ? (
          <ForYou athletes={forYou.athletes} teams={forYou.teams} leagues={forYou.leagues} leagueById={leagueById} leagueSnapshots={leagueSnapshots} />
        ) : null}
        {tab === 'Athletes' ? <AthleteGrid items={filteredAthletes} /> : null}
        {tab === 'Teams' ? <TeamGrid items={filteredTeams} leagueById={leagueById} leagueSnapshots={leagueSnapshots} /> : null}
        {tab === 'Leagues' ? <LeagueGrid items={filteredLeagues} leagueSnapshots={leagueSnapshots} /> : null}
        {tab === 'Matches' ? <MatchGrid items={filteredMatches} teamById={teamById} /> : null}
        {tab === 'Challenges' ? <ChallengeGrid items={filteredChallenges} athletes={athletes} leagueById={leagueById} /> : null}
      </div>
    </div>
  );
}

function useLeagueSnapshots(
  leagues: League[],
  teams: Team[],
  matches: Match[],
  seasons: Season[],
) {
  return useMemo(() => new Map(
    leagues.map((league) => [league.id, buildLeagueTableSnapshot(league, teams, matches, seasons)]),
  ), [leagues, matches, seasons, teams]);
}

function followedOrTop<T extends { id: string }>(
  items: T[],
  followed: string[] | undefined,
  score: (item: T) => number,
) {
  const preferred = items.filter((item) => followed?.includes(item.id));
  return (preferred.length ? preferred : [...items].sort((a, b) => score(b) - score(a))).slice(0, 6);
}

function ForYou({
  athletes,
  teams,
  leagues,
  leagueById,
  leagueSnapshots,
}: {
  athletes: Athlete[];
  teams: Team[];
  leagues: League[];
  leagueById: Map<string, League>;
  leagueSnapshots: Map<string, LeagueTableSnapshot>;
}) {
  return (
    <div className="space-y-7">
      <Section title="Rising this week" copy="Ranked by verified GoalPlace activity, never by support spend.">
        <AthleteGrid items={athletes} />
      </Section>
      <Section title="Your community teams" copy="Follow teams to move them into your personal home.">
        <TeamGrid items={teams} leagueById={leagueById} leagueSnapshots={leagueSnapshots} />
      </Section>
      <Section title="Competition hubs" copy="Official tables, fixtures, stories, and notices.">
        <LeagueGrid items={leagues} leagueSnapshots={leagueSnapshots} />
      </Section>
    </div>
  );
}

function Section({ title, copy, children }: { title: string; copy: string; children: React.ReactNode }) {
  return <section><h2 className="text-lg font-semibold text-text-strong">{title}</h2><p className="mb-3 text-sm text-muted">{copy}</p>{children}</section>;
}

function AthleteGrid({ items }: { items: Athlete[] }) {
  const [visible, setVisible] = useState(60);
  return items.length
    ? <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{items.slice(0, visible).map((item) => <AthleteCard key={item.id} athlete={item} />)}</div>
        {visible < items.length ? <Button variant="secondary" block onClick={() => setVisible((value) => value + 60)}>Load more athletes</Button> : null}
      </div>
    : <EmptyState icon={MagnifyingGlass} title="No athletes found" description="Try widening the filters." />;
}
function TeamGrid({
  items,
  leagueById,
  leagueSnapshots,
}: {
  items: Team[];
  leagueById: Map<string, League>;
  leagueSnapshots: Map<string, LeagueTableSnapshot>;
}) {
  return items.length
    ? (
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {items.map((item) => {
          const standing = standingForTeam(item.id, leagueSnapshots);
          return (
            <TeamCard
              key={item.id}
              team={item}
              standing={standing?.row}
              rank={standing?.rank}
              leagueName={leagueById.get(item.leagueId)?.name}
            />
          );
        })}
      </div>
    )
    : <EmptyState icon={MagnifyingGlass} title="No teams found" description="Try widening the filters." />;
}
function LeagueGrid({
  items,
  leagueSnapshots,
}: {
  items: League[];
  leagueSnapshots: Map<string, LeagueTableSnapshot>;
}) {
  return items.length
    ? (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map((item) => {
          const snapshot = leagueSnapshots.get(item.id);
          return (
            <LeagueCard
              key={item.id}
              league={item}
              leaderName={snapshot?.rows[0]?.teamName}
              officialMatches={snapshot?.officialMatches}
            />
          );
        })}
      </div>
    )
    : <EmptyState icon={MagnifyingGlass} title="No leagues found" description="Try widening the filters." />;
}
function MatchGrid({ items, teamById }: { items: Match[]; teamById: Map<string, Team> }) {
  return items.length
    ? <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{items.slice(0, 60).map((item) => <MatchCard key={item.id} match={item} home={teamById.get(item.homeTeamId)} away={teamById.get(item.awayTeamId)} href={`/matches/${item.id}`} />)}</div>
    : <EmptyState icon={MagnifyingGlass} title="No matches found" description="Try widening the filters." />;
}
function ChallengeGrid({ items, athletes, leagueById }: { items: Challenge[]; athletes: Athlete[]; leagueById: Map<string, League> }) {
  return items.length ? (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item) => {
        const athlete = athletes.find((candidate) => candidate.id === item.athleteId);
        return (
          <Link key={item.id} href={`/athletes/${item.athleteId}`}>
            <Card className="flex min-h-32 items-start gap-3 p-4 transition-colors hover:border-border-strong">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-subtle text-brand"><Target className="h-5 w-5" weight="bold" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-text-strong">{item.description}</span>
                <span className="mt-1 block text-xs text-muted">{athlete?.name ?? 'Athlete'} / {leagueById.get(item.leagueId)?.name ?? 'League'}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-2">
                  <TrendUp className="h-3.5 w-3.5" />
                  {item.fundingModel === 'non_cash'
                    ? `${item.supportersCount} participants`
                    : `UGX ${item.totalPledged.toLocaleString()} sponsor grant`}
                </span>
              </span>
            </Card>
          </Link>
        );
      })}
    </div>
  ) : <EmptyState icon={Target} title="No challenges found" description="Try widening the filters." />;
}

function DiscoverSkeleton() {
  return <div className="space-y-4"><Skeleton className="h-36 w-full rounded-[var(--radius-xl)]" /><Skeleton className="h-12 w-full" /><div className="grid grid-cols-2 gap-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-56 rounded-[var(--radius-lg)]" />)}</div></div>;
}
