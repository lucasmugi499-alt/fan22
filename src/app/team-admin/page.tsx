'use client';

import React from 'react';
import { Building03Icon } from 'hugeicons-react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { PageContainer } from '@/components/ui/product';

export default function TeamAdminPage() {
  return (
    <RoleGuard allowedRoles={['team_admin', 'league_admin', 'platform_admin', 'super_admin']}>
      <PageContainer compact>
        <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
          <Building03Icon className="mb-6 size-16 text-slate-500" />
          <h1 className="font-display text-3xl font-black text-white">Team Admin Module</h1>
          <p className="mt-4 max-w-md text-slate-400">
            For the MVP, team management responsibilities are handled within the League Admin dashboard. This dedicated team portal is a future module.
          </p>
        </div>
      </PageContainer>
    </RoleGuard>
  );
}
