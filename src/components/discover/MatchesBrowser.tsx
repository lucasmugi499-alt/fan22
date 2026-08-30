'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarBlank } from '@phosphor-icons/react';
import { adaptMatch, adaptTeam } from '@/lib/firebase/useGoalPlaceData';
import { dataProvider } from '@/data/dataProvider';
import { isStillToPlay } from '@/lib/status';
import { useNow } from '@/lib/useNow';
import { sportDisplayName, sportKey, type SportKey } from '@/lib/sportPresentation';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { ScrollRail } from '@/components/ui/ScrollRail';
import { GradientBanner } from '@/components/premium/GradientBanner';
import { MatchCard } from '@/components/core/MatchCard';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import type { Match, Team } from '@/types';

const TABS = ['Live', 'Upcoming', 'Results'] as const;
type Tab = (typeof TABS)[number];
const SPORT_FILTERS = ['all', 'football', 'basketball', 'rugby'] as const;
type SportFilter = (typeof SPORT_FILTERS)[number];

export function MatchesBrowser({
  initialMatches = [],
  initialTeams = [],
}: {
  initialMatches?: Match[];
  initialTeams?: Team[];
}) {
  const now = useNow();
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [teams, setTeams] = useState<Team[]>(initialTeams);
  const [loading, setLoading] = useState(!initialMatches.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error>();
  const [sportFilter, setSportFilter] = useState<SportFilter>('all');
  const pageSize = 120;
  const loadPage = useCallback(async (afterId?: string) => {
    if (afterId) setLoadingMore(true);
    else setLoading(true);
    setError(undefined);
    try {
      const [page, teamPage] = await Promise.all([
        dataProvider.getMatches({ limit: pageSize, afterId }),
        afterId ? Promise.resolve([]) : dataProvider.getTeams({ limit: 100 }),
      ]);
      const adapted = page.map(adaptMatch);
      setMatches((current) => afterId
        ? [...new Map([...current, ...adapted].map((match) => [match.id, match])).values()]
        : adapted);
      if (teamPage.length) setTeams(teamPage.map(adaptTeam));
      setHasMore(page.length === pageSize);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('Matches could not be loaded.'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);
  useEffect(() => {
    if (initialMatches.length) return undefined;
    const timer = window.setTimeout(() => void loadPage(), 0);
    return () => window.clearTimeout(timer);
  }, [initialMatches.length, loadPage]);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const buckets = useMemo(() => {
    return {
      Live: matches.filter((m) => m.status === 'live'),
      Upcoming: matches.filter((m) => isStillToPlay(m, now)).filter((m) => m.status !== 'live').sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt)),
      Results: matches.filter((m) => m.status === 'completed').sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt)),
    } as Record<Tab, Match[]>;
  }, [matches, now]);

  const [tab, setTab] = useState<Tab>(buckets.Live.length ? 'Live' : 'Upcoming');
  const sportCounts = useMemo(() => {
    const counts: Record<SportKey, number> = { football: 0, basketball: 0, rugby: 0 };
    for (const match of buckets[tab]) counts[sportKey(String(match.sport))] += 1;
    return counts;
  }, [buckets, tab]);

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-28 w-full rounded-[var(--radius-lg)]" /><Skeleton className="h-28 w-full rounded-[var(--radius-lg)]" /></div>;
  }
  if (error && !matches.length) return <ErrorState description={error.message} onRetry={() => void loadPage()} />;
  const list = buckets[tab];
  const filteredList = sportFilter === 'all'
    ? list
    : list.filter((match) => sportKey(String(match.sport)) === sportFilter);
  const groupedList = SPORT_FILTERS
    .filter((sport): sport is SportKey => sport !== 'all')
    .map((sport) => ({
      sport,
      label: sportDisplayName(sport),
      matches: filteredList.filter((match) => sportKey(String(match.sport)) === sport),
    }))
    .filter((group) => group.matches.length);

  return (
    <div className="-mx-[var(--gutter)] md:mx-0">
      <div className="mb-4">
        <div className="px-[var(--gutter)] pb-4 md:px-0">
          <GradientBanner title="Matches" subtitle="Every result carries its verification status." variant="broadcast" />
        </div>
        <SegmentedTabs tabs={TABS} active={tab} onChange={setTab} className="md:px-0" />
      </div>
      <div className="px-[var(--gutter)] md:px-0">
        <ScrollRail wrapperClassName="mb-4" className="flex gap-2 pb-1" role="group" aria-label="Filter matches by sport">
          {SPORT_FILTERS.map((sport) => {
            const active = sportFilter === sport;
            const count = sport === 'all' ? list.length : sportCounts[sport];
            return (
              <button
                key={sport}
                type="button"
                aria-pressed={active}
                onClick={() => setSportFilter(sport)}
                className={[
                  'min-h-11 shrink-0 rounded-[var(--radius-pill)] border px-4 text-sm font-semibold transition-[background,border-color,color,transform] duration-[var(--dur-micro)] active:scale-[0.98]',
                  active
                    ? 'border-brand bg-brand text-on-brand shadow-[var(--glow-brand)]'
                    : 'border-border bg-surface-1 text-muted hover:border-border-strong hover:text-text-strong',
                ].join(' ')}
              >
                {sport === 'all' ? 'All sports' : sportDisplayName(sport)}
                <span data-numeric className="ml-2 tabular-nums opacity-75">{count}</span>
              </button>
            );
          })}
        </ScrollRail>

        {filteredList.length ? (
          <>
            {sportFilter === 'all' ? (
              <div className="space-y-6">
                {groupedList.map((group) => (
                  <section key={group.sport} className="space-y-3" aria-labelledby={`matches-${tab}-${group.sport}`}>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <h2 id={`matches-${tab}-${group.sport}`} className="text-base font-semibold text-text-strong">{group.label}</h2>
                        <p className="text-xs text-muted">
                          <span data-numeric className="tabular-nums">{group.matches.length}</span> {tab.toLowerCase()} matches
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {group.matches.map((m) => (
                        <MatchCard key={m.id} match={m} home={teamById.get(m.homeTeamId)} away={teamById.get(m.awayTeamId)} href={`/matches/${m.id}`} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {filteredList.map((m) => (
                  <MatchCard key={m.id} match={m} home={teamById.get(m.homeTeamId)} away={teamById.get(m.awayTeamId)} href={`/matches/${m.id}`} />
                ))}
              </div>
            )}
            {hasMore ? (
              <div className="flex justify-center pt-4">
                <Button variant="secondary" disabled={loadingMore} onClick={() => void loadPage(matches.at(-1)?.id)}>
                  {loadingMore ? 'Loading...' : 'Load more matches'}
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon={CalendarBlank}
            title={`No ${sportFilter === 'all' ? '' : `${sportDisplayName(sportFilter).toLowerCase()} `}${tab.toLowerCase()} matches in this page`}
            description={hasMore ? 'Load more fixtures to continue browsing this category.' : tab === 'Live' ? 'No matches are being played right now. Check the upcoming fixtures.' : 'Nothing here yet. Check back soon.'}
            action={hasMore ? <Button size="sm" variant="secondary" onClick={() => void loadPage(matches.at(-1)?.id)}>Load more</Button> : undefined}
          />
        )}
      </div>
    </div>
  );
}
