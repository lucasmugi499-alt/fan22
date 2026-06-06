'use client';

import React from 'react';
import { ShieldCheck, ClipboardCheck, Users } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { PageContainer, SectionHeader, ImpactStatCard } from '@/components/ui/product';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';

export default function AdminPage() {
  const { leagues, matches, athletes } = useGoalPlaceData();
  const pendingMatches = matches.filter((match) => match.verificationStatus === 'Pending' || match.verificationStatus === 'pending').length;

  return (
    <RoleGuard allowedRoles={['platform_admin', 'super_admin']}>
      <PageContainer compact>
        <SectionHeader eyebrow="Platform Admin" title="GoalPlace256 operations" />
        <div className="grid gap-3 md:grid-cols-3">
          <ImpactStatCard label="Leagues" value={String(leagues.length)} icon={ShieldCheck} />
          <ImpactStatCard label="Pending reviews" value={String(pendingMatches)} icon={ClipboardCheck} tone="gold" />
          <ImpactStatCard label="Athletes" value={String(athletes.length)} icon={Users} tone="blue" />
        </div>
      </PageContainer>
    </RoleGuard>
  );
}
