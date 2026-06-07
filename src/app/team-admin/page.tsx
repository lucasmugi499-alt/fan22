'use client';

import React from 'react';
import { Building03Icon } from 'hugeicons-react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { PageContainer } from '@/components/ui/product';
import { buttonVariants } from '@/components/ui/button';
import Link from 'next/link';

export default function TeamAdminPage() {
  return (
    <RoleGuard allowedRoles={['league_admin', 'platform_admin', 'super_admin']}>
      <PageContainer compact>
        <div className="mx-auto flex min-h-[56vh] max-w-xl flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] p-8 text-center">
          <Building03Icon className="mb-6 size-16 text-slate-500" />
          <h1 className="font-display text-3xl font-black text-white">Team Operations Future Module</h1>
          <p className="mt-4 max-w-md text-slate-400">
            For the MVP, team management responsibilities are handled within the League Admin dashboard. This dedicated team portal is a future module.
          </p>
          <Link className={buttonVariants({ className: 'mt-6' })} href="/league-admin">Go to League Admin</Link>
        </div>
      </PageContainer>
    </RoleGuard>
  );
}
