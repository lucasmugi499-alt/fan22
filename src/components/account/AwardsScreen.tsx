'use client';

import { useMemo } from 'react';
import { Trophy, SealCheck } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { DemoDataNote } from '@/components/ui/DemoDataNote';
import { cn } from '@/lib/utils';

export function AwardsScreen() {
  const { athletes, loading } = useGoalPlaceData();
  const ranked = useMemo(
    () => [...athletes].sort((a, b) => (b.goalPlacePoints ?? 0) - (a.goalPlacePoints ?? 0)).slice(0, 20),
    [athletes]
  );

  if (loading) return <div className="space-y-3"><Skeleton className="h-8 w-40" /><Skeleton className="h-72 w-full rounded-[var(--radius-lg)]" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="h-6 w-6 text-[var(--brand-2)]" weight="fill" />
        <h1 className="text-xl font-semibold text-text-strong">GoalPlace Points</h1>
      </div>
      <DemoDataNote />

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core">
        {ranked.map((a, i) => {
          const rank = i + 1;
          return (
            <div key={a.id} className="flex items-center gap-3 border-b border-border p-3 last:border-0">
              <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-bold tabular-nums', rank <= 3 ? 'bg-[var(--brand-2-subtle)] text-[var(--brand-2)]' : 'text-muted')}>{rank}</span>
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate text-sm font-medium text-text-strong">{a.name}</span>
                {a.verified ? <SealCheck className="h-3.5 w-3.5 shrink-0 text-[var(--state-verified)]" weight="fill" /> : null}
              </div>
              <span data-numeric className="shrink-0 text-sm font-bold tabular-nums text-brand">{(a.goalPlacePoints ?? 0).toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
