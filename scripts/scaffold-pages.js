/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');

const pages = [
  {
    path: 'src/app/dashboard/page.tsx',
    title: 'Fan Dashboard',
    guard: 'ProtectedRoute',
    importGuard: 'import { ProtectedRoute } from "@/components/auth/ProtectedRoute";',
    wrapperOpen: '<ProtectedRoute>',
    wrapperClose: '</ProtectedRoute>',
  },
  {
    path: 'src/app/athlete-dashboard/page.tsx',
    title: 'Athlete Dashboard',
    guard: 'RoleGuard',
    importGuard: 'import { RoleGuard } from "@/components/auth/RoleGuard";',
    wrapperOpen: '<RoleGuard allowedRoles={["athlete", "platform_admin", "super_admin"]}>',
    wrapperClose: '</RoleGuard>',
  },
  {
    path: 'src/app/team-admin/page.tsx',
    title: 'Team Admin',
    guard: 'RoleGuard',
    importGuard: 'import { RoleGuard } from "@/components/auth/RoleGuard";',
    wrapperOpen: '<RoleGuard allowedRoles={["team_admin", "platform_admin", "super_admin"]}>',
    wrapperClose: '</RoleGuard>',
  },
  {
    path: 'src/app/league-admin/page.tsx',
    title: 'League Admin',
    guard: 'RoleGuard',
    importGuard: 'import { RoleGuard } from "@/components/auth/RoleGuard";',
    wrapperOpen: '<RoleGuard allowedRoles={["league_admin", "platform_admin", "super_admin"]}>',
    wrapperClose: '</RoleGuard>',
  },
  {
    path: 'src/app/sponsor-dashboard/page.tsx',
    title: 'Sponsor Dashboard',
    guard: 'RoleGuard',
    importGuard: 'import { RoleGuard } from "@/components/auth/RoleGuard";',
    wrapperOpen: '<RoleGuard allowedRoles={["sponsor", "platform_admin", "super_admin"]}>',
    wrapperClose: '</RoleGuard>',
  },
  {
    path: 'src/app/admin/page.tsx',
    title: 'Platform Admin',
    guard: 'RoleGuard',
    importGuard: 'import { RoleGuard } from "@/components/auth/RoleGuard";',
    wrapperOpen: '<RoleGuard allowedRoles={["platform_admin", "super_admin"]}>',
    wrapperClose: '</RoleGuard>',
  },
  {
    path: 'src/app/wallet/page.tsx',
    title: 'Wallet',
    guard: 'ProtectedRoute',
    importGuard: 'import { ProtectedRoute } from "@/components/auth/ProtectedRoute";',
    wrapperOpen: '<ProtectedRoute>',
    wrapperClose: '</ProtectedRoute>',
  },
];

pages.forEach(p => {
  const content = `'use client';

import React from 'react';
${p.importGuard}

export default function Page() {
  return (
    ${p.wrapperOpen}
      <main className="min-h-screen pt-24 pb-32">
        <div className="mx-auto max-w-4xl px-4 md:px-8">
          <div className="rounded-2xl border border-white/10 bg-[#0A0D14] p-8 shadow-2xl">
            <h1 className="font-heading text-3xl font-black text-white">{p.title}</h1>
            <p className="mt-2 text-slate-400">Welcome to your ${p.title.toLowerCase()}. Development is in progress.</p>
          </div>
        </div>
      </main>
    ${p.wrapperClose}
  );
}
`;
  fs.writeFileSync(p.path, content);
});

// Write login and register pages separately as they are public
const authContent = (title) => `'use client';

import React, { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthProvider';
import Link from 'next/link';

function AuthContent() {
  const { authStatus } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const nextRoute = searchParams.get('next') || '/';

  useEffect(() => {
    if (authStatus === 'logged_in') {
      router.push(nextRoute);
    }
  }, [authStatus, router, nextRoute]);

  return (
    <main className="flex min-h-[80vh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0A0D14] p-8 shadow-2xl">
        <h1 className="mb-2 text-center font-heading text-3xl font-black text-white">${title}</h1>
        <p className="mb-8 text-center text-sm text-slate-400">
          Use the floating Demo Roles switcher in the bottom left to instantly test different user roles without a password!
        </p>
        
        <div className="flex flex-col gap-4">
          <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-3 font-bold text-white transition-colors hover:bg-white/10">
            <svg className="size-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>
          
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
            <div className="relative bg-[#0A0D14] px-4 text-xs font-bold uppercase text-slate-500">Or</div>
          </div>
          
          <input type="email" placeholder="Email Address" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-[var(--goal-emerald)] focus:outline-none focus:ring-1 focus:ring-[var(--goal-emerald)]" />
          <input type="password" placeholder="Password" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-[var(--goal-emerald)] focus:outline-none focus:ring-1 focus:ring-[var(--goal-emerald)]" />
          
          <button className="w-full rounded-xl bg-[var(--goal-emerald)] py-3 font-bold text-[#05070A] transition-colors hover:bg-[#00E67A]">${title}</button>
        </div>
      </div>
    </main>
  );
}

export default function Page() {
  return <Suspense><AuthContent /></Suspense>;
}
`;

fs.writeFileSync('src/app/login/page.tsx', authContent('Login'));
fs.writeFileSync('src/app/register/page.tsx', authContent('Create Account'));

console.log('Pages generated successfully!');
