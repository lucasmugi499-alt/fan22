'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthProvider';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { authStatus } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (authStatus === 'logged_out') {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [authStatus, pathname, router]);

  if (authStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#05070A]">
        <div className="size-8 animate-spin rounded-full border-4 border-white/10 border-t-[var(--goal-emerald)]"></div>
      </div>
    );
  }

  if (authStatus === 'logged_out') {
    return null; // Will redirect
  }

  return <>{children}</>;
}
