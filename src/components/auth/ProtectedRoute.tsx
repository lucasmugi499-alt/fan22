'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthProvider';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, firebaseReady, loading } = useAuth();

  useEffect(() => {
    if (!firebaseReady || loading || currentUser) return;
    router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [currentUser, firebaseReady, loading, pathname, router]);

  if (!firebaseReady) {
    return <>{children}</>;
  }

  if (loading) {
    return <RouteGuardLoading label="Checking session" />;
  }

  if (!currentUser) {
    return <RouteGuardLoading label="Redirecting to login" />;
  }

  return <>{children}</>;
}

export function RouteGuardLoading({ label }: { label: string }) {
  return (
    <div className="page-shell page-safe flex min-h-[60dvh] items-center justify-center">
      <div className="glass-panel rounded-xl p-6 text-center">
        <ShieldCheck className="mx-auto mb-3 size-7 text-[var(--goal-mint)]" />
        <p className="font-heading text-xl font-black text-white">{label}</p>
        <p className="mt-2 text-sm text-slate-400">GoalPlace256 is loading your secure session.</p>
      </div>
    </div>
  );
}
