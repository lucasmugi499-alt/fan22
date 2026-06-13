'use client';

import React from 'react';
import { SecurityCheckIcon, UserIcon, Wallet01Icon } from 'hugeicons-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { DataCard, DashboardStatGrid, ImpactStatCard, PageContainer, SectionHeader, StatusExplainerChip } from '@/components/ui/product';
import { useAuth } from '@/context/AuthProvider';
import { formatUGX } from '@/lib/sportThemes';

export default function ProfilePage() {
  const { userProfile, role } = useAuth();
  const activeRole = role ?? 'fan';
  const roleLabel = activeRole.replace('_', ' ');
  const roleCopy: Record<string, { title: string; details: string[]; action: string }> = {
    fan: {
      title: 'Fan preferences',
      details: ['Followed athletes, teams, and leagues personalize your home feed.', 'Wallet and support history stay visible only to you.'],
      action: 'Update Fan Preferences',
    },
    athlete: {
      title: 'Athlete portfolio',
      details: ['Keep bio, team, stats, media, and support needs current.', 'Verification improves trust but does not change match results.'],
      action: 'Update Athlete Portfolio',
    },
    team_admin: {
      title: 'Team admin permissions',
      details: ['Manage roster, team profile, support needs, and result submissions.', 'League Admins verify final results before standings update.'],
      action: 'Open Team Console',
    },
    league_admin: {
      title: 'League admin permissions',
      details: ['Manage fixtures, standings, teams, athletes, and verification queues.', 'Paid tools never affect sporting rankings.'],
      action: 'Open League Operations',
    },
    platform_admin: {
      title: 'Platform admin permissions',
      details: ['Review approvals, disputes, reports, payouts, and system health.', 'Custom claims control admin actions in Firebase mode.'],
      action: 'Open Control Center',
    },
    super_admin: {
      title: 'Platform owner permissions',
      details: ['Full override access for system administration.', 'Every admin decision should remain auditable.'],
      action: 'Open Control Center',
    },
  };
  const panel = roleCopy[activeRole] ?? roleCopy.fan;

  return (
    <ProtectedRoute>
      <PageContainer compact className="space-y-6">
        <SectionHeader eyebrow="Profile" title={userProfile?.name ?? 'GoalPlace256 profile'} description={`Active profile: ${roleLabel}`} />
        <div className="glass-panel rounded-xl p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-xl border border-[var(--goal-emerald)]/30 bg-[var(--goal-emerald)]/12 text-[var(--goal-mint)]">
              <UserIcon className="size-7" />
            </div>
            <div>
              <p className="font-display text-2xl font-black text-white">{userProfile?.name ?? 'Demo User'}</p>
              <p className="mt-1 text-sm text-slate-400">{userProfile?.email ?? 'demo@goalplace256.com'} - {roleLabel}</p>
            </div>
            </div>
            <StatusExplainerChip domain={activeRole === 'team_admin' ? 'team' : activeRole === 'league_admin' ? 'league' : activeRole === 'athlete' ? 'athlete' : 'system'} status={userProfile?.status === 'pending' ? 'Pending Verification' : 'Verified'} />
          </div>
        </div>

        <DashboardStatGrid>
          <ImpactStatCard label="GoalPlace Points" value={(userProfile?.points ?? 0).toLocaleString()} detail="Earned from demo engagement." />
          <ImpactStatCard label="Wallet Balance" value={formatUGX(userProfile?.walletBalance ?? 0)} detail="Real payments are not enabled yet." icon={Wallet01Icon} tone="gold" />
          <ImpactStatCard label="Following" value={String((userProfile?.followedAthletes?.length ?? 0) + (userProfile?.followedTeams?.length ?? 0) + (userProfile?.followedLeagues?.length ?? 0))} detail="Athletes, teams, and leagues." />
          <ImpactStatCard label="Trust Status" value={userProfile?.status ?? 'active'} detail="Role access and profile state." icon={SecurityCheckIcon} tone="blue" />
        </DashboardStatGrid>

        <DataCard>
          <h2 className="font-display text-xl font-black text-white">{panel.title}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {panel.details.map((detail) => (
              <div key={detail} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm leading-6 text-slate-300">
                {detail}
              </div>
            ))}
          </div>
          <Button className="mt-5" variant="outline">{panel.action}</Button>
        </DataCard>
      </PageContainer>
    </ProtectedRoute>
  );
}
