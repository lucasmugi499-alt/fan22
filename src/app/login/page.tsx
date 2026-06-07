'use client';

import React, { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthProvider';
import Link from 'next/link';
import { canAccessRoute, getDefaultRouteForRole } from '@/lib/auth/permissions';
import { PageContainer } from '@/components/ui/product';
import { Shield01Icon, UserIcon, SecurityCheckIcon } from 'hugeicons-react';
import { Trophy } from '@phosphor-icons/react';
import { AppRole } from '@/types';
import { toast } from 'sonner';

function AuthContent() {
  const { authStatus, role, setDemoRole, userProfile } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const nextRoute = searchParams.get('next');

  useEffect(() => {
    if (authStatus === 'logged_in') {
      if (nextRoute && canAccessRoute({ authStatus, role, userProfile }, nextRoute)) {
        router.push(nextRoute);
      } else {
        router.push(getDefaultRouteForRole(role));
      }
    }
  }, [authStatus, role, router, nextRoute, userProfile]);

  const handleDemoLogin = (selectedRole: AppRole) => {
    setDemoRole(selectedRole);
    toast.success(`Logged in as ${selectedRole.replace('_', ' ')}`);
  };

  const demoRoles: { id: AppRole; label: string; description: string; icon: React.ElementType }[] = [
    { id: 'fan', label: 'Continue as Fan', description: 'Follow matches, support athletes, and earn GoalPlace Points.', icon: UserIcon },
    { id: 'athlete', label: 'Continue as Athlete', description: 'Manage your profile, view supporters, and post highlights.', icon: Trophy },
    { id: 'league_admin', label: 'Continue as League Admin', description: 'Manage teams, athletes, fixtures, and verify results.', icon: Shield01Icon },
    { id: 'platform_admin', label: 'Continue as Platform Admin', description: 'Approve leagues, moderate content, and oversee the platform.', icon: SecurityCheckIcon },
  ];

  return (
    <div className="w-full overflow-hidden pb-24 pt-10 md:pt-16">
      <PageContainer>
        <div className="mx-auto flex max-w-[440px] flex-col items-center justify-center">
          <Link href="/" className="mb-8 flex items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-lg border border-[var(--goal-emerald)]/50 bg-gradient-to-br from-[var(--goal-emerald)] to-[var(--goal-emerald-dark)] shadow-[0_0_28px_rgba(0,196,106,0.32)]">
              <span className="text-sm font-black tracking-tighter text-white">GP<span className="text-emerald-100">256</span></span>
            </div>
            <span className="font-display text-xl font-black tracking-tight text-white">GoalPlace<span className="text-[var(--goal-mint)]">256</span></span>
          </Link>

          <div className="w-full rounded-2xl border border-white/10 bg-[#0A0D14] p-8 shadow-2xl">
            <h1 className="mb-2 text-center font-display text-3xl font-black text-white">Welcome Back</h1>
            <p className="mb-8 text-center text-sm text-slate-400">
              Sign in to your GoalPlace256 account
            </p>
            
            <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); toast.error('Firebase Auth not yet connected. Use Demo Login.'); }}>
              <input type="email" placeholder="Email Address" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-[var(--goal-emerald)] focus:outline-none focus:ring-1 focus:ring-[var(--goal-emerald)]" required />
              <input type="password" placeholder="Password" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-[var(--goal-emerald)] focus:outline-none focus:ring-1 focus:ring-[var(--goal-emerald)]" required />
              
              <button type="submit" className="w-full rounded-xl bg-[var(--goal-emerald)] py-3 font-bold text-[#05070A] transition-colors hover:bg-[#00E67A]">Login</button>
            </form>

            <div className="mt-6 flex items-center justify-center text-sm">
              <span className="text-slate-400">Don&apos;t have an account? </span>
              <Link href="/register" className="ml-1 font-bold text-[var(--goal-mint)] hover:underline">
                Create Account
              </Link>
            </div>

            <div className="relative my-8 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
              <div className="relative bg-[#0A0D14] px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Demo Login Mode</div>
            </div>

            <div className="flex flex-col gap-2">
              {demoRoles.map((role) => {
                const Icon = role.icon;
                return (
                  <button
                    key={role.id}
                    onClick={() => handleDemoLogin(role.id)}
                    className="flex w-full flex-col items-start gap-1 rounded-xl border border-white/10 bg-white/5 p-4 text-left transition-colors hover:bg-white/10"
                  >
                    <div className="flex items-center gap-2 font-bold text-white">
                      <Icon className="size-4 text-[var(--goal-mint)]" />
                      {role.label}
                    </div>
                    <p className="text-xs text-slate-400">{role.description}</p>
                  </button>
                );
              })}
              <button
                onClick={() => handleDemoLogin('team_admin')}
                className="mt-2 text-center text-xs font-bold text-slate-500 hover:text-[var(--goal-mint)] hover:underline"
              >
                Preview Team Admin Console
              </button>
            </div>
            
            <p className="mt-6 text-center text-xs text-slate-500">
              Firebase Auth is currently in mock mode. Select a role above to explore the app instantly.
            </p>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><AuthContent /></Suspense>;
}
