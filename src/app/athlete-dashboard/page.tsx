'use client';

import React from 'react';
import { HeartHandshake, ShieldCheck, Trophy } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { PageContainer, SectionHeader, ImpactStatCard, SportBadge } from '@/components/ui/product';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { formatUGX } from '@/lib/sportThemes';

export default function AthleteDashboardPage() {
  const { athletes, challenges } = useGoalPlaceData();
  const athlete = athletes[0];
  const athleteChallenges = athlete ? challenges.filter((challenge) => challenge.athleteId === athlete.id) : [];

  return (
    <RoleGuard allowedRoles={['athlete', 'platform_admin', 'super_admin']}>
      <PageContainer compact>
        <SectionHeader eyebrow="Athlete Dashboard" title={athlete ? athlete.name : 'Athlete profile'} />
        <div className="grid gap-3 md:grid-cols-3">
          <ImpactStatCard label="Support" value={formatUGX(athlete?.totalEarnings ?? athlete?.totalSupport ?? 0)} icon={HeartHandshake} />
          <ImpactStatCard label="Challenges" value={String(athleteChallenges.length)} icon={Trophy} tone="gold" />
          <ImpactStatCard label="Verified" value={athlete?.verified ? 'Yes' : 'No'} icon={ShieldCheck} tone="blue" />
        </div>
        {athlete && <div className="glass-panel mt-6 rounded-xl p-5"><SportBadge sport={athlete.sport} /></div>}
      </PageContainer>
    </RoleGuard>
  );
}
