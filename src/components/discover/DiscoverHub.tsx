'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { CaretRight, MagnifyingGlass, Target, TrendUp } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { AthleteCard, LeagueCard, TeamCard } from '@/components/core/EntityCards';
import { MatchCard } from '@/components/core/MatchCard';
import { GradientBanner } from '@/components/premium/GradientBanner';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import type { Athlete, Challenge, League, Match, Season, StoredStanding, Team } from '@/types';
import { indexSortValue } from '@/lib/leagueIndex';
import { useDiscoveryPage, type DiscoveryEntity } from '@/lib/discovery/useDiscoveryPage';
import { useCatalogueSearch, type SearchableEntity } from '@/lib/discovery/useCatalogueSearch';
import {
  buildLeagueTableSnapshot,
  standingForTeam,
  type LeagueTableSnapshot,
} from './discoveryUtils';

const TABS = ['For You', 'Athletes', 'Teams', 'Leagues', 'Matches', 'Challenges'] as const;
type Tab = (typeof TABS)[number];

/** Which tabs browse the catalogue, and therefore page through the server. */
const TAB_ENTITY: Partial<Record<Tab, DiscoveryEntity>> = {
  Athletes: 'athletes',
  Teams: 'teams',
  Leagues: 'leagues',
  Matches: 'matches',
};

/**
 * Which tabs the search index can answer a text query for.
 *
 * `searchIndex` holds athletes, teams, leagues and seasons — not matches. So the Matches tab
 * keeps filtering its loaded page and says so, rather than offering a search that would
 * silently cover less than the others.
 */
const TAB_SEARCH: Partial<Record<Tab, SearchableEntity>> = {
  Athletes: 'athlete',
  Teams: 'team',
  Leagues: 'league',
};

type InitialDiscoveryData = {
  leagues?: League[];
  teams?: Team[];
  matches?: Match[];
  seasons?: Season[];
  standings?: StoredStanding[];
  athletes?: Athlete[];
  challenges?: Challenge[];
};

export function DiscoverHub({ initialData }: { initialData?: InitialDiscoveryData } = {}) {
  const { userProfile } = useAuth();
  const live = useGoalPlaceData({
    collections: ['athletes', 'teams', 'leagues', 'matches', 'seasons', 'challenges', 'standings'],
    recordLimit: 1_200,
  });

  /**
   * Server data first, live data when it arrives.
   *
   * The same pattern the league and team pages use. It matters most for an anonymous visitor,
   * who has no client Firestore read available at all and for whom `initialData` is the entire
   * page — that was the gap that left `/discover` blank-ish for signed-out users while the
   * league page rendered fine.
   */
  //
  // Each is memoised rather than computed inline. The `?? []` in a conditional produces a NEW
  // array reference on every render, which invalidates every downstream `useMemo` that depends
  // on it — and this page's downstream work is the filtering and league-table composition for
  // four entity grids. Inline, the memos would recompute on every keystroke in the search box.
  const athletes = useMemo(
    () => (live.athletes.length ? live.athletes : initialData?.athletes ?? []),
    [live.athletes, initialData?.athletes],
  );
  const teams = useMemo(
    () => (live.teams.length ? live.teams : initialData?.teams ?? []),
    [live.teams, initialData?.teams],
  );
  const leagues = useMemo(
    () => (live.leagues.length ? live.leagues : initialData?.leagues ?? []),
    [live.leagues, initialData?.leagues],
  );
  const matches = useMemo(
    () => (live.matches.length ? live.matches : initialData?.matches ?? []),
    [live.matches, initialData?.matches],
  );
  const seasons = useMemo(
    () => (live.seasons.length ? live.seasons : initialData?.seasons ?? []),
    [live.seasons, initialData?.seasons],
  );
  const challenges = useMemo(
    () => (live.challenges.length ? live.challenges : initialData?.challenges ?? []),
    [live.challenges, initialData?.challenges],
  );
  const standings = useMemo(
    () => (live.standings.length ? live.standings : initialData?.standings ?? []),
    [live.standings, initialData?.standings],
  );
  // Server data means there is something to show immediately, so the skeleton is only for a
  // client-only load with nothing rendered yet.
  const loading = live.loading && !initialData?.leagues?.length;
  const [tab, setTab] = useState<Tab>('For You');
  const [sport, setSport] = useState('all');
  const [city, setCity] = useState('all');
  const [query, setQuery] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const teamById = useMemo(() => new Map(teams.map((item) => [item.id, item])), [teams]);
  const leagueById = useMemo(() => new Map(leagues.map((item) => [item.id, item])), [leagues]);
  const leagueSnapshots = useLeagueSnapshots(leagues, teams, matches, seasons, standings);

  /**
   * The four browse tabs page through the server; For You and Challenges do not.
   *
   * For You is a personalised set drawn from what this user follows — bounded by their own
   * follow list, not by the catalogue — and Challenges is a small curated collection. Neither
   * grows with league count, so neither needs paging. The four that do are the four that were
   * showing a fixed slice of an unbounded catalogue.
   *
   * `enabled` keeps a tab from fetching until it is looked at. Opening Discover should cost
   * one query, not five.
   */
  const browseEntity = TAB_ENTITY[tab];
  /**
   * A text query searches the whole catalogue, not the loaded page.
   *
   * The box used to filter the 24 or 48 records that happened to be loaded. Typing "Mbarara
   * United" — a club that exists twice and appears on the fixtures list two screens away —
   * returned "No teams found", because a search box that only searches what is on screen
   * cannot tell "no such club" from "not on this page".
   */
  const search = useCatalogueSearch(query, TAB_SEARCH[tab]);
  const searching = Boolean(TAB_SEARCH[tab]) && query.trim().length >= 2;
  const page = useDiscoveryPage(
    browseEntity ?? 'leagues',
    { sport, city, verified: verifiedOnly },
    { enabled: Boolean(browseEntity) },
  );

  const pointsForTeam = useCallback(
    // Zero when neither the projection nor the deprecated aggregate has a number: a team
    // with no results has no points, and sorting must not treat that as unknown.
    (team: Team) => standingForTeam(team.id, leagueSnapshots)?.row.points ?? team.leaguePoints ?? 0,
    [leagueSnapshots],
  );

  const filteredChallenges = useMemo(() => challenges
    .filter((item) => {
      const athlete = athletes.find((candidate) => candidate.id === item.athleteId);
      return (sport === 'all' || String(item.sport).toLowerCase() === sport) &&
        (city === 'all' || athlete?.city === city) &&
        (!query || `${item.description} ${athlete?.legalName ?? ''}`.toLowerCase().includes(query.toLowerCase())) &&
        (!verifiedOnly || item.verificationStatus === 'verified');
    })
    .sort((a, b) => b.totalPledged - a.totalPledged), [athletes, challenges, city, query, sport, verifiedOnly]);

  const forYou = {
    athletes: followedOrTop(athletes, userProfile?.followedAthletes, (item) => item.goalPlacePoints),
    teams: followedOrTop(teams, userProfile?.followedTeams, pointsForTeam),
    leagues: followedOrTop(leagues, userProfile?.followedLeagues, (item) => indexSortValue(item.goalPlaceIndex)),
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
        {searching ? (
          <CatalogueResults search={search} query={query} />
        ) : browseEntity ? (
          <BrowseResults page={page} query={query}>
            {tab === 'Athletes' ? <AthleteGrid items={onPage<Athlete>(page.items, query, athleteText)} /> : null}
            {tab === 'Teams' ? <TeamGrid items={onPage<Team>(page.items, query, nameText)} leagueById={leagueById} leagueSnapshots={leagueSnapshots} /> : null}
            {tab === 'Leagues' ? <LeagueGrid items={onPage<League>(page.items, query, nameText)} leagueSnapshots={leagueSnapshots} /> : null}
            {tab === 'Matches' ? <MatchGrid items={onPage<Match>(page.items, query, venueText)} teamById={teamById} /> : null}
          </BrowseResults>
        ) : null}
        {tab === 'Challenges' ? <ChallengeGrid items={filteredChallenges} athletes={athletes} leagueById={leagueById} /> : null}
      </div>
    </div>
  );
}

/**
 * Narrow the loaded page by the text box.
 *
 * Deliberately page-local, and `BrowseResults` says so on screen. Firestore cannot do
 * substring matching, and `/api/search` already answers text queries against the server-built
 * `searchIndex` — the only structure in this database that can. Reimplementing that here would
 * mean a second, worse search that disagrees with the first, so the text box refines what is
 * loaded and the page points at real search for the rest of the catalogue.
 */
function onPage<T>(items: unknown[], query: string, text: (item: T) => string): T[] {
  const typed = items as T[];
  if (!query.trim()) return typed;
  const needle = query.toLowerCase();
  return typed.filter((item) => text(item).toLowerCase().includes(needle));
}

const nameText = (item: { name?: string; city?: string }) => `${item.name ?? ''} ${item.city ?? ''}`;
const athleteText = (item: Athlete) =>
  `${item.legalName ?? item.name ?? ''} ${item.registeredPosition ?? item.position ?? ''} ${item.city ?? ''}`;
const venueText = (item: Match) => `${item.venue ?? ''} ${item.city ?? ''}`;

/**
 * The states a paged browse tab can be in, in one place.
 *
 * Every one of them is a real state a visitor reaches, and the old page had none of them: it
 * rendered a grid over a fixed slice and had no way to be loading, empty because of a filter,
 * broken, or partway through a catalogue.
 */
/**
 * Results from the catalogue search, rather than from the loaded page.
 *
 * A deliberately plain list. The search index carries a title, a meta line and an href — not
 * the full entity — so this cannot render the rich cards the browse grids use, and inventing a
 * card from a partial record would show a club with no crest, no record and no points beside
 * cards that have all three.
 */
function CatalogueResults({
  search,
  query,
}: {
  search: ReturnType<typeof useCatalogueSearch>;
  query: string;
}) {
  if (search.loading) return <DiscoverSkeleton />;

  if (search.error) {
    return <EmptyState icon={MagnifyingGlass} title="Search is unavailable" description={search.error} />;
  }

  if (!search.results.length) {
    return (
      <EmptyState
        icon={MagnifyingGlass}
        title={`Nothing matches "${query}"`}
        description="Search covers the whole catalogue, so this is not on the platform under that name. Check the spelling, or browse with the filters instead."
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Said plainly, because the filters above are still on screen and still set. */}
      <p className="text-xs text-muted" role="status">
        {search.results.length} {search.results.length === 1 ? 'result' : 'results'} from the whole
        catalogue. Sport and region filters apply to browsing, not to search.
      </p>
      <ul className="grid gap-2">
        {search.results.map((result) => (
          <li key={`${result.type}-${result.entityId}`}>
            <Link
              href={result.href ?? '#'}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-1 px-4 py-3 transition-colors hover:border-border-strong"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-text-strong">{result.title}</span>
                <span className="block truncate text-xs text-muted">{result.meta}</span>
              </span>
              <CaretRight className="h-4 w-4 shrink-0 text-subtle" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BrowseResults({
  page,
  query,
  children,
}: {
  page: ReturnType<typeof useDiscoveryPage>;
  query: string;
  children: React.ReactNode;
}) {
  if (page.loading) return <DiscoverSkeleton />;

  if (page.error) {
    return (
      <ErrorState
        description={page.error}
        onRetry={page.retry}
      />
    );
  }

  if (!page.items.length) {
    return (
      <EmptyState
        icon={MagnifyingGlass}
        title="Nothing matches those filters"
        description="Try a different sport or region, or clear the filters to see everything."
      />
    );
  }

  return (
    <div className="space-y-4">
      {children}

      {query.trim() ? (
        // Said plainly rather than implied. Filtering the loaded page and presenting it as a
        // catalogue search is the same class of quiet wrongness as a truncated league table.
        <p className="text-xs text-muted" role="status">
          Filtering the {page.items.length} results loaded here.{' '}
          <Link href={`/search?q=${encodeURIComponent(query)}`} className="text-brand underline underline-offset-2">
            Search the full catalogue
          </Link>
          .
        </p>
      ) : null}

      {page.hasMore ? (
        <div className="flex justify-center pt-1">
          <Button variant="secondary" onClick={page.loadMore} disabled={page.loadingMore}>
            {page.loadingMore ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      ) : (
        <p className="pt-1 text-center text-xs text-subtle">That is everything matching these filters.</p>
      )}
    </div>
  );
}

function useLeagueSnapshots(
  leagues: League[],
  teams: Team[],
  matches: Match[],
  seasons: Season[],
  standings: StoredStanding[],
) {
  return useMemo(() => new Map(
    leagues.map((league) => [
      league.id,
      buildLeagueTableSnapshot(league, teams, matches, seasons, standings),
    ]),
  ), [leagues, matches, seasons, teams, standings]);
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
                <span className="mt-1 block text-xs text-muted">{athlete?.legalName ?? 'Athlete'} / {leagueById.get(item.leagueId)?.name ?? 'League'}</span>
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
