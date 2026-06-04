'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HeartHandshake, ShieldCheck, TrendingUp, Users } from 'lucide-react';
import { Athlete } from '@/lib/types';
import { mockAthletes } from '@/lib/mockData';
import { AthleteCard } from '@/components/ui/athlete-card';
import { EmptyState, ImpactStatCard, PageContainer, SectionHeader, StickyFilterBar } from '@/components/ui/product';
import { SupportModal } from '@/components/modals/app-modals';

const filters = ['All Sports', 'Football', 'Basketball', 'Rugby', 'Top Supported', 'Verified Only', 'Rising'];

export default function AthletesPage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState('All Sports');
  const [supportAthlete, setSupportAthlete] = useState<Athlete | null>(null);

  const filteredAthletes = useMemo(() => {
    return mockAthletes.filter((athlete) => {
      if (activeFilter === 'All Sports') return true;
      if (['Football', 'Basketball', 'Rugby'].includes(activeFilter)) return athlete.sport === activeFilter;
      if (activeFilter === 'Verified Only') return athlete.verified;
      if (activeFilter === 'Top Supported') return athlete.supportersCount >= 120;
      if (activeFilter === 'Rising') return athlete.supportersCount < 100 || !athlete.verified;
      return true;
    });
  }, [activeFilter]);

  return (
    <PageContainer compact>
      <SectionHeader
        eyebrow="Athlete Hub"
        title="Discover athletes"
        description="Follow verified football, basketball, and rugby athletes across Uganda, then support the people building the game."
      />

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <ImpactStatCard label="Athletes" value={String(mockAthletes.length)} icon={Users} />
        <ImpactStatCard label="Verified" value={String(mockAthletes.filter((athlete) => athlete.verified).length)} icon={ShieldCheck} tone="gold" />
        <ImpactStatCard label="Supporters" value={mockAthletes.reduce((sum, athlete) => sum + athlete.supportersCount, 0).toLocaleString()} icon={HeartHandshake} tone="blue" />
        <ImpactStatCard label="Rising" value={String(mockAthletes.filter((athlete) => athlete.supportersCount < 100).length)} icon={TrendingUp} tone="orange" />
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
