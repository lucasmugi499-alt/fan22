'use client';

import { useMemo, useState } from 'react';
import { CalendarBlank } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyLeague, matchesInLeague } from '@/lib/league/leagueContext';
import { isUpcomingMatch } from '@/lib/status';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { MatchCard } from '@/components/core/MatchCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Match } from '@/types';

const TABS = ['Upcoming', 'Results'] as const;
type Tab = (typeof TABS)[number];

export function LeagueFixtures() {
  const { userProfile } = useAuth();
  const { leagues, teams, matches, loading } = useGoalPlaceData();
  const [tab, setTab] = useState<Tab>('Upcoming');

  const league = useMemo(() => resolveMyLeague(userProfile, leagues, matches), [userProfile, leagues, matches]);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const buckets = useMemo(() => {
    if (!league) return { Upcoming: [], Results: [] } as Record<Tab, Match[]>;
    const all = matchesInLeague(league.id, matches);
    return {
      Upcoming: all.filter(isUpcomingMatch).sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt)),
      Results: all.filter((m) => m.status === 'completed').sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt)),
    } as Record<Tab, Match[]>;
  }, [league, matches]);

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-28 w-full rounded-[var(--radius-lg)]" /></div>;
  }
  const list = buckets[tab];

  return (
    <div className="-mx-[var(--gutter)] md:mx-0">
      <div className="mb-4">
        <h1 className="px-[var(--gutter)] pb-3 text-xl font-semibold text-text-strong md:px-0">Fixtures</h1>
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
          <EmptyState icon={CalendarBlank} title={tab === 'Upcoming' ? 'No upcoming fixtures' : 'No results yet'} description={tab === 'Upcoming' ? 'Scheduled matches across the league appear here.' : 'Played matches appear here, each with its verification status.'} />
        )}
      </div>
    </div>
  );
}
