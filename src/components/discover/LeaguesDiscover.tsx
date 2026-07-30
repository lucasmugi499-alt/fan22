'use client';

import { useMemo } from 'react';
import { Buildings } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { GradientBanner } from '@/components/premium/GradientBanner';
import { LeagueCard } from '@/components/core/EntityCards';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import type { League } from '@/types';

export function LeaguesDiscover({ initialLeagues = [] }: { initialLeagues?: League[] }) {
  const { leagues, loading } = useGoalPlaceData({ collections: ['leagues'] });
  const records = leagues.length ? leagues : initialLeagues;
  const list = useMemo(() => [...records].sort((a, b) => (b.goalPlaceIndex ?? 0) - (a.goalPlaceIndex ?? 0)), [records]);

  if (loading && !initialLeagues.length) {
    return <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-[var(--radius-lg)]" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <GradientBanner title="Leagues" subtitle="Standings are built from official results only." variant="pitch" />
      {list.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((l) => <LeagueCard key={l.id} league={l} />)}
        </div>
      ) : (
        <EmptyState icon={Buildings} title="No leagues yet" description="Leagues appear here as they join GoalPlace256." />
      )}
    </div>
  );
}
