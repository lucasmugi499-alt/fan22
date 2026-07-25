'use client';

import { useMemo } from 'react';
import { SoccerBall } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { TeamCard } from '@/components/core/EntityCards';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

export function TeamsDiscover() {
  const { teams, loading } = useGoalPlaceData();
  const list = useMemo(() => [...teams].sort((a, b) => (b.totalSupport ?? 0) - (a.totalSupport ?? 0)), [teams]);

  if (loading) {
    return <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-[var(--radius-lg)]" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text-strong">Teams</h1>
        <p className="text-sm text-muted">Every record here reflects verified, official results.</p>
      </div>
      {list.length ? (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {list.map((t) => <TeamCard key={t.id} team={t} />)}
        </div>
      ) : (
        <EmptyState icon={SoccerBall} title="No teams yet" description="Teams appear here as they join their leagues." />
      )}
    </div>
  );
}
