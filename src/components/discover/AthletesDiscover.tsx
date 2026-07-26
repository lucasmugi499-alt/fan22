'use client';

import { useMemo, useState } from 'react';
import { Users } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { GradientBanner } from '@/components/premium/GradientBanner';
import { AthleteCard } from '@/components/core/EntityCards';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

const SPORTS = ['All', 'Football', 'Basketball', 'Rugby'] as const;
type SportFilter = (typeof SPORTS)[number];

export function AthletesDiscover() {
  const { athletes, loading } = useGoalPlaceData({ collections: ['athletes'] });
  const [sport, setSport] = useState<SportFilter>('All');

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

  return (
    <div className="space-y-4">
      <GradientBanner title="Players" subtitle="Back the athletes building their careers." variant="gold" />

      <div className="snap-row -mx-[var(--gutter)] px-[var(--gutter)] md:mx-0 md:px-0">
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
      </div>

      {list.length ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {list.map((a) => <AthleteCard key={a.id} athlete={a} />)}
        </div>
      ) : (
        <EmptyState icon={Users} title="No athletes here yet" description="Try a different sport, or check back as more athletes join." />
      )}
    </div>
  );
}
