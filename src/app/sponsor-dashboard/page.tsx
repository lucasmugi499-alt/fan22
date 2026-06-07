import React from 'react';
import { UserGroupIcon } from 'hugeicons-react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { buttonVariants } from '@/components/ui/button';
import { PageContainer } from '@/components/ui/product';

export default function SponsorDashboardPage() {
  return (
    <ProtectedRoute>
      <PageContainer compact>
        <div className="mx-auto flex min-h-[56vh] max-w-xl flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] p-8 text-center">
          <UserGroupIcon className="mb-6 size-16 text-slate-500" />
          <h1 className="font-display text-3xl font-black text-white">Sponsor Dashboard Future Module</h1>
          <p className="mt-4 max-w-md text-slate-400">
            Sponsorship is currently managed through a direct inquiry process. This dedicated sponsor dashboard is a future module.
          </p>
          <Link className={buttonVariants({ className: 'mt-6' })} href="/sponsors">Go to Sponsors Page</Link>
        </div>
      </PageContainer>
    </ProtectedRoute>
  );
}
