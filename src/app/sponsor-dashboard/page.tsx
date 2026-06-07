'use client';

import React, { useEffect } from 'react';
import { UserGroupIcon } from 'hugeicons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { buttonVariants } from '@/components/ui/button';
import { PageContainer } from '@/components/ui/product';
import { useAuth } from '@/context/AuthProvider';

export default function SponsorDashboardPage() {
  const router = useRouter();
  const { loading, role } = useAuth();
  const canPreviewFutureModule = role === 'platform_admin' || role === 'super_admin';

  useEffect(() => {
    if (!loading && role && !canPreviewFutureModule) {
      router.replace('/sponsors');
    }
  }, [canPreviewFutureModule, loading, role, router]);

  if (!loading && role && !canPreviewFutureModule) {
    return null;
  }

  return (
    <ProtectedRoute>
      <PageContainer compact>
        <div className="mx-auto flex min-h-[56vh] max-w-xl flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] p-8 text-center">
          <UserGroupIcon className="mb-6 size-16 text-slate-500" />
          <h1 className="font-display text-3xl font-black text-white">Sponsor Dashboard Future Module</h1>
          <p className="mt-4 max-w-md text-slate-400">
            Sponsorship is currently managed through public packages and direct inquiry. This dedicated sponsor operating console is reserved for future platform-admin preview.
          </p>
          <Link className={buttonVariants({ className: 'mt-6' })} href="/sponsors">Go to Sponsors Page</Link>
        </div>
      </PageContainer>
    </ProtectedRoute>
  );
}
