'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

import React, { useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserGroupIcon, SecurityCheckIcon, ArrowUpRight01Icon } from 'hugeicons-react';
import { Users } from '@phosphor-icons/react';
import { Athlete } from '@/types';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { AthleteCard } from '@/components/ui/athlete-card';
import { EmptyState, ImpactStatCard, PageContainer, SectionHeader, StickyFilterBar } from '@/components/ui/product';
import { SupportModal } from '@/components/modals/app-modals';

const filters = ['All Sports', 'Football', 'Basketball', 'Rugby', 'Top Supported', 'Verified Only', 'Rising'];

function AthletesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leagueId = searchParams?.get('league');
  const { athletes } = useGoalPlaceData();
  const [activeFilter, setActiveFilter] = useState('All Sports');
  const [supportAthlete, setSupportAthlete] = useState<Athlete | null>(null);

  const filteredAthletes = useMemo(() => {
    return athletes.filter((athlete) => {
      if (leagueId && athlete.leagueId !== leagueId) return false;
      if (activeFilter === 'All Sports') return true;
      if (['Football', 'Basketball', 'Rugby'].includes(activeFilter)) return athlete.sport === activeFilter;
      if (activeFilter === 'Verified Only') return athlete.verified;
      if (activeFilter === 'Top Supported') return athlete.supportersCount >= 120;
      if (activeFilter === 'Rising') return athlete.supportersCount < 100 || !athlete.verified;
      return true;
    });
  }, [activeFilter, athletes]);

  return (
    <PageContainer compact>
      <SectionHeader
        eyebrow="Athlete Hub"
        title="Discover athletes"
        description="Follow verified football, basketball, and rugby athletes across Uganda, then support the people building the game."
      />

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <ImpactStatCard label="Athletes" value={String(athletes.length)} icon={Users} />
        <ImpactStatCard label="Verified" value={String(athletes.filter((athlete) => athlete.verified).length)} icon={SecurityCheckIcon} tone="gold" />
        <ImpactStatCard label="Supporters" value={athletes.reduce((sum, athlete) => sum + athlete.supportersCount, 0).toLocaleString()} icon={UserGroupIcon} tone="blue" />
        <ImpactStatCard label="Rising" value={String(athletes.filter((athlete) => athlete.supportersCount < 100).length)} icon={ArrowUpRight01Icon} tone="orange" />
      </div>

      <StickyFilterBar filters={filters} active={activeFilter} onChange={setActiveFilter} />

      {filteredAthletes.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredAthletes.map((athlete) => (
            <AthleteCard
              key={athlete.id}
              athlete={athlete}
              onSupport={() => setSupportAthlete(athlete)}
              onView={() => router.push(`/athletes/${athlete.id}`)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No athletes found"
          description="Reset filters to discover verified athletes and rising talent across GoalPlace256."
          onReset={() => setActiveFilter('All Sports')}
        />
      )}

      <SupportModal athlete={supportAthlete} open={Boolean(supportAthlete)} onOpenChange={(open) => !open && setSupportAthlete(null)} />
    </PageContainer>
  );
}

export default function AthletesPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading athletes...</div>}>
        <AthletesPageContent />
      </Suspense>
    </ProtectedRoute>
  );
}
