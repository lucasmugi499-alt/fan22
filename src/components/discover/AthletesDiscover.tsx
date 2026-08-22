'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users } from '@phosphor-icons/react';
import { adaptAthlete } from '@/lib/firebase/useGoalPlaceData';
import { dataProvider } from '@/data/dataProvider';
import { GradientBanner } from '@/components/premium/GradientBanner';
import { AthleteCard } from '@/components/core/EntityCards';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/EmptyState';
import type { Athlete } from '@/types';
import { SnapRow } from '@/components/ui/ScrollRail';

const SPORTS = ['All', 'Football', 'Basketball', 'Rugby'] as const;
type SportFilter = (typeof SPORTS)[number];

export function AthletesDiscover({ initialAthletes = [] }: { initialAthletes?: Athlete[] }) {
  const [athletes, setAthletes] = useState<Athlete[]>(initialAthletes);
  const [loading, setLoading] = useState(!initialAthletes.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error>();
  const [sport, setSport] = useState<SportFilter>('All');
  const pageSize = 48;

  const loadPage = useCallback(async (afterId?: string) => {
    if (afterId) setLoadingMore(true);
    else setLoading(true);
    setError(undefined);
    try {
      const page = (await dataProvider.getAthletes({ limit: pageSize, afterId })).map(adaptAthlete);
      setAthletes((current) => afterId
        ? [...new Map([...current, ...page].map((athlete) => [athlete.id, athlete])).values()]
        : page);
      setHasMore(page.length === pageSize);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('Athletes could not be loaded.'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPage(), 0);
    return () => window.clearTimeout(timer);
  }, [loadPage]);

  const list = useMemo(() => {
    const sorted = [...athletes].sort((a, b) => (b.totalSupport ?? 0) - (a.totalSupport ?? 0));
    if (sport === 'All') return sorted;
    return sorted.filter((a) => String(a.sport).toLowerCase() === sport.toLowerCase());
  }, [athletes, sport]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-[var(--radius-lg)]" />)}
      </div>
    );
  }
  if (error && !athletes.length) return <ErrorState description={error.message} onRetry={() => void loadPage()} />;

  return (
    <div className="space-y-4">
      <GradientBanner title="Players" subtitle="Back the athletes building their careers." variant="gold" />

      <SnapRow className="-mx-[var(--gutter)] px-[var(--gutter)] md:mx-0 md:px-0">
        {SPORTS.map((s) => (
          <button
            key={s}
            onClick={() => setSport(s)}
            className={cn(
              'snap-item rounded-[var(--radius-pill)] border px-4 py-2 text-sm font-medium transition-colors',
              sport === s ? 'border-brand bg-brand-subtle text-brand' : 'border-border bg-surface-1 text-muted hover:text-text-strong'
            )}
          >
            {s}
          </button>
        ))}
      </SnapRow>

      {list.length ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {list.map((a) => <AthleteCard key={a.id} athlete={a} />)}
          </div>
          {hasMore ? (
            <div className="flex justify-center pt-2">
              <Button variant="secondary" disabled={loadingMore} onClick={() => void loadPage(athletes.at(-1)?.id)}>
                {loadingMore ? 'Loading...' : 'Load more athletes'}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={Users}
          title="No athletes in this loaded page"
          description={hasMore ? 'Load more records to continue exploring this sport.' : 'Try a different sport, or check back as more athletes join.'}
          action={hasMore ? <Button size="sm" variant="secondary" onClick={() => void loadPage(athletes.at(-1)?.id)}>Load more</Button> : undefined}
        />
      )}
    </div>
  );
}
