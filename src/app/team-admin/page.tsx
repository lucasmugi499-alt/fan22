'use client';

import React from 'react';
import { Building2, ShieldCheck, Trophy } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { PageContainer, SectionHeader, ImpactStatCard, SportBadge } from '@/components/ui/product';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';

export default function TeamAdminPage() {
  const { teams, athletes } = useGoalPlaceData();
  const team = teams[0];
  const roster = team ? athletes.filter((athlete) => athlete.teamId === team.id) : [];

  return (
    <RoleGuard allowedRoles={['team_admin', 'platform_admin', 'super_admin']}>
      <PageContainer compact>
        <SectionHeader eyebrow="Team Admin" title={team ? team.name : 'Team workspace'} />
        <div className="grid gap-3 md:grid-cols-3">
          <ImpactStatCard label="Roster" value={String(roster.length)} icon={Trophy} />
          <ImpactStatCard label="Support pool" value={team?.supportPool?.toLocaleString() ?? '0'} icon={Building2} tone="gold" />
          <ImpactStatCard label="Verified" value={team?.verified ? 'Yes' : 'No'} icon={ShieldCheck} tone="blue" />
        </div>
        {team && <div className="glass-panel mt-6 rounded-xl p-5"><SportBadge sport={team.sport} /></div>}
      </PageContainer>
    </RoleGuard>
  );
}
