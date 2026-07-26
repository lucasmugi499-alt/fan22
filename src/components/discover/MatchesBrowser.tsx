'use client';

import { useMemo, useState } from 'react';
import { CalendarBlank } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { isUpcomingMatch } from '@/lib/status';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { GradientBanner } from '@/components/premium/GradientBanner';
import { MatchCard } from '@/components/core/MatchCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Match } from '@/types';

const TABS = ['Live', 'Upcoming', 'Results'] as const;
type Tab = (typeof TABS)[number];

export function MatchesBrowser() {
  const { matches, teams, loading } = useGoalPlaceData({
    collections: ['matches', 'teams'],
  });
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {list.map((m) => (
              <MatchCard key={m.id} match={m} home={teamById.get(m.homeTeamId)} away={teamById.get(m.awayTeamId)} href={`/matches/${m.id}`} />
            ))}
          </div>
        ) : (
          <EmptyState icon={CalendarBlank} title={`No ${tab.toLowerCase()} matches`} description={tab === 'Live' ? 'No matches are being played right now. Check the upcoming fixtures.' : 'Nothing here yet. Check back soon.'} />
        )}
      </div>
    </div>
  );
}
