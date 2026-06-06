'use client';

import React from 'react';
import { Award, HeartHandshake, Wallet } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/context/AuthProvider';
import { PageContainer, SectionHeader, ImpactStatCard } from '@/components/ui/product';
import { formatUGX } from '@/lib/sportThemes';

export default function DashboardPage() {
  const { userProfile } = useAuth();

  return (
    <ProtectedRoute>
      <PageContainer compact>
        <SectionHeader eyebrow="Fan Dashboard" title={`Welcome${userProfile?.name ? `, ${userProfile.name.split(' ')[0]}` : ''}`} />
        <div className="grid gap-3 md:grid-cols-3">
          <ImpactStatCard label="Wallet" value={formatUGX(userProfile?.walletBalance ?? 0)} icon={Wallet} />
          <ImpactStatCard label="GoalPlace Points" value={String(userProfile?.points ?? 0)} icon={Award} tone="gold" />
          <ImpactStatCard label="Following" value={String(userProfile?.followedAthletes?.length ?? 0)} icon={HeartHandshake} tone="blue" />
        </div>
      </PageContainer>
    </ProtectedRoute>
  );
}
