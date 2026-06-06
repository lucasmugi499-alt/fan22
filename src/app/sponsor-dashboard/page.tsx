import React from 'react';
import { Handshake } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { PageContainer } from '@/components/ui/product';

export default function SponsorDashboardPage() {
  return (
    <RoleGuard allowedRoles={['sponsor', 'platform_admin', 'super_admin']}>
      <PageContainer compact>
        <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
          <Handshake className="mb-6 size-16 text-slate-500" />
          <h1 className="font-heading text-3xl font-black text-white">Sponsor Module</h1>
          <p className="mt-4 max-w-md text-slate-400">
            Sponsorship is currently managed through a direct inquiry process. This dedicated sponsor dashboard is a future module.
          </p>
        </div>
      </PageContainer>
    </RoleGuard>
  );
}
