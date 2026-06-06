'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, CheckCircle2, Radio, Trophy } from 'lucide-react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { EmptyState, ImpactStatCard, PageContainer, SectionHeader, StickyFilterBar } from '@/components/ui/product';
import { MatchCard } from '@/components/ui/match-card';
import { Button } from '@/components/ui/button';

const filters = ['All', 'Football', 'Basketball', 'Rugby', 'Live', 'Upcoming', 'Completed', 'Following'];

export default function MatchesPage() {
  const router = useRouter();
  const { matches } = useGoalPlaceData();
  const [activeFilter, setActiveFilter] = useState('All');

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      if (activeFilter === 'All') return true;
      if (['Football', 'Basketball', 'Rugby'].includes(activeFilter)) return match.sport === activeFilter;
      if (['Live', 'Upcoming', 'Completed'].includes(activeFilter)) return match.status === activeFilter;
      if (activeFilter === 'Following') return ['m1', 'm2', 'm3'].includes(match.id);
      return true;
    });
  }, [activeFilter, matches]);

  const liveMatches = filteredMatches.filter((match) => match.status === 'Live');
  const upcomingMatches = filteredMatches.filter((match) => match.status === 'Upcoming');
  const completedMatches = filteredMatches.filter((match) => match.status === 'Completed');

  return (
    <ProtectedRoute>
      
    <PageContainer compact>
      <SectionHeader
        eyebrow="Match Center"
        title="Match Center"
        description="Live action, upcoming fixtures, completed results, active challenges, and verified match context."
        action={<Button variant="outline" onClick={() => router.push('/feed')}>Open Feed</Button>}
      />

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <ImpactStatCard label="Live now" value={String(matches.filter((match) => match.status === 'Live').length)} icon={Radio} />
        <ImpactStatCard label="Upcoming" value={String(matches.filter((match) => match.status === 'Upcoming').length)} icon={CalendarClock} tone="gold" />
        <ImpactStatCard label="Verified results" value={String(matches.filter((match) => match.verificationStatus === 'Verified').length)} icon={CheckCircle2} tone="blue" />
      </div>

      <StickyFilterBar filters={filters} active={activeFilter} onChange={setActiveFilter} />

      {filteredMatches.length === 0 ? (
        <EmptyState
          title="No matches found"
          description="Try a different sport or status filter to browse the full GoalPlace256 match center."
          onReset={() => setActiveFilter('All')}
        />
      ) : (
        <div className="space-y-10">
          {liveMatches.length > 0 && (
            <section>
              <SectionHeader eyebrow="Live Now" title="Live match wall" className="mb-4" />
              <div className="hide-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:overflow-visible md:px-0">
                {liveMatches.map((match) => (
                  <div key={match.id} className="w-[86vw] shrink-0 snap-start md:w-auto">
                    <MatchCard match={match} onView={() => router.push(`/matches/${match.id}`)} />
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionHeader eyebrow="Fixtures" title="Upcoming fixtures" className="mb-4" />
            {upcomingMatches.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {upcomingMatches.map((match) => (
                  <MatchCard key={match.id} match={match} onView={() => router.push(`/matches/${match.id}`)} />
                ))}
              </div>
            ) : (
              <EmptyState title="No upcoming fixtures here" description="Reset filters or check completed results." onReset={() => setActiveFilter('All')} />
            )}
          </section>

          <section>
            <SectionHeader eyebrow="Results" title="Completed results" className="mb-4" />
            {completedMatches.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {completedMatches.map((match) => (
                  <MatchCard key={match.id} match={match} onView={() => router.push(`/matches/${match.id}`)} />
                ))}
              </div>
            ) : (
              <div className="glass-panel rounded-xl p-5 text-sm text-slate-300">
                <Trophy className="mb-3 size-6 text-[var(--goal-gold)]" />
                Completed results matching this filter will appear here after verification.
              </div>
            )}
          </section>
        </div>
      )}
    </PageContainer>
  
    </ProtectedRoute>
);
}
