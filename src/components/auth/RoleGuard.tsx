'use client';

import React from 'react';
import { useAuth } from '@/context/AuthProvider';
import { ProtectedRoute } from './ProtectedRoute';
import { AppRole } from '@/types';
import Link from 'next/link';
import { AuthState, hasAnyRole, getDefaultRouteForRole } from '@/lib/auth/permissions';

export function RoleGuard({ allowedRoles, children }: { allowedRoles: AppRole[]; children: React.ReactNode }) {
  const auth = useAuth();

  return (
    <ProtectedRoute>
      <RoleGuardInner auth={auth} allowedRoles={allowedRoles}>
        {children}
      </RoleGuardInner>
    </ProtectedRoute>
  );
}

function RoleGuardInner({ auth, allowedRoles, children }: { auth: AuthState; allowedRoles: AppRole[]; children: React.ReactNode }) {
  if (auth.authStatus === 'loading') return null;

  if (!hasAnyRole(auth, allowedRoles)) {
    const defaultRoute = getDefaultRouteForRole(auth.role);

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-4 text-center">
        <div className="mb-6 flex size-16 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.15)]">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <h1 className="font-display text-2xl font-black text-white md:text-3xl">Restricted Area</h1>
        <p className="mt-3 max-w-md text-sm text-slate-300">
          This section is restricted to <span className="font-bold text-[var(--goal-gold)]">{allowedRoles.map(r => r.replace('_', ' ')).join(', ')}</span> accounts.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          You are currently previewing as a <span className="font-bold text-white">{auth.role?.replace('_', ' ')}</span>.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Link href={defaultRoute} className="rounded-lg bg-[var(--goal-emerald)] px-6 py-2.5 text-sm font-bold text-[#05070A] transition-colors hover:bg-[#00E67A]">
            Go to My Dashboard
          </Link>
          <Link href="/register" className="rounded-lg bg-white/10 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-white/20">
            Switch Demo Role
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
