'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarBlank } from '@phosphor-icons/react';
import { adaptMatch, adaptTeam } from '@/lib/firebase/useGoalPlaceData';
import { dataProvider } from '@/data/dataProvider';
import { isUpcomingMatch } from '@/lib/status';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { GradientBanner } from '@/components/premium/GradientBanner';
import { MatchCard } from '@/components/core/MatchCard';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import type { Match, Team } from '@/types';

const TABS = ['Live', 'Upcoming', 'Results'] as const;
type Tab = (typeof TABS)[number];

export function MatchesBrowser({
  initialMatches = [],
  initialTeams = [],
}: {
  initialMatches?: Match[];
  initialTeams?: Team[];
}) {
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [teams, setTeams] = useState<Team[]>(initialTeams);
  const [loading, setLoading] = useState(!initialMatches.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error>();
  const pageSize = 48;
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
    const timer = window.setTimeout(() => void loadPage(), 0);
    return () => window.clearTimeout(timer);
  }, [loadPage]);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const buckets = useMemo(() => {
    return {
      Live: matches.filter((m) => m.status === 'live'),
      Upcoming: matches.filter(isUpcomingMatch).filter((m) => m.status !== 'live').sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt)),
      Results: matches.filter((m) => m.status === 'completed').sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt)),
    } as Record<Tab, Match[]>;
  }, [matches]);

  const [tab, setTab] = useState<Tab>(buckets.Live.length ? 'Live' : 'Upcoming');

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-28 w-full rounded-[var(--radius-lg)]" /><Skeleton className="h-28 w-full rounded-[var(--radius-lg)]" /></div>;
  }
  if (error && !matches.length) return <ErrorState description={error.message} onRetry={() => void loadPage()} />;
  const list = buckets[tab];

  return (
    <div className="-mx-[var(--gutter)] md:mx-0">
      <div className="mb-4">
        <div className="px-[var(--gutter)] pb-4 md:px-0">
          <GradientBanner title="Matches" subtitle="Every result carries its verification status." variant="broadcast" />
        </div>
        <SegmentedTabs tabs={TABS} active={tab} onChange={setTab} className="md:px-0" />
      </div>
      <div className="px-[var(--gutter)] md:px-0">
        {list.length ? (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {list.map((m) => (
                <MatchCard key={m.id} match={m} home={teamById.get(m.homeTeamId)} away={teamById.get(m.awayTeamId)} href={`/matches/${m.id}`} />
              ))}
            </div>
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
            title={`No ${tab.toLowerCase()} matches in this page`}
            description={hasMore ? 'Load more fixtures to continue browsing this category.' : tab === 'Live' ? 'No matches are being played right now. Check the upcoming fixtures.' : 'Nothing here yet. Check back soon.'}
            action={hasMore ? <Button size="sm" variant="secondary" onClick={() => void loadPage(matches.at(-1)?.id)}>Load more</Button> : undefined}
          />
        )}
      </div>
    </div>
  );
}
