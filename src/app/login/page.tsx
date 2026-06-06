'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { LogIn, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthProvider';
import { Button } from '@/components/ui/button';
import { demoAccounts, login, routeForAppRole } from '@/lib/firebase/auth';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { AppRole } from '@/types';

const demoRoles: AppRole[] = [
  'fan',
  'athlete',
  'team_admin',
  'league_admin',
  'sponsor',
  'platform_admin',
  'super_admin',
];

function roleLabel(role: AppRole) {
  return role
    .split('_')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function AuthContent() {
  const { authStatus, setDemoRole } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const nextRoute = searchParams.get('next') || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authStatus === 'logged_in' && nextRoute) {
      router.push(nextRoute);
    }
  }, [authStatus, nextRoute, router]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isFirebaseConfigured) {
      toast.error('Firebase is not configured yet. Use a demo role or add NEXT_PUBLIC_FIREBASE_* env vars.');
      return;
    }

    setSubmitting(true);
    try {
      await login(email, password);
      toast.success('Logged in');
      router.push(nextRoute || '/dashboard');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const chooseDemoRole = (role: AppRole) => {
    setDemoRole(role);
    const demo = demoAccounts.find((account) => account.role === role);
    toast.success(`Demo login: ${demo?.email ?? roleLabel(role)}`);
    router.push(routeForAppRole(role));
  };

  return (
    <main className="flex min-h-[80vh] items-center justify-center p-4">
      <div className="w-full max-w-5xl rounded-2xl border border-white/10 bg-[#0A0D14] p-5 shadow-2xl md:p-8">
        <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
          <section>
            <div className="mb-6 flex size-12 items-center justify-center rounded-xl border border-[var(--goal-emerald)]/30 bg-[var(--goal-emerald)]/12 text-[var(--goal-mint)]">
              <LogIn className="size-6" />
            </div>
            <h1 className="font-heading text-3xl font-black text-white md:text-4xl">Login</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Sign in with Firebase Auth or jump into a demo role for QA.
            </p>

            <form onSubmit={submit} className="mt-6 grid gap-4">
              <label className="grid gap-2">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="fan@goalplace256.com"
                  className="h-12 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-[var(--goal-emerald)]"
                  required
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  className="h-12 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-[var(--goal-emerald)]"
                  required
                />
              </label>
              <Button type="submit" size="lg" disabled={submitting}>
                <Mail className="size-4" />
                {submitting ? 'Logging in...' : 'Login'}
              </Button>
            </form>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <button
                type="button"
                onClick={() => toast.info('Password reset will be enabled after Firebase email templates are configured.')}
                className="font-bold text-[var(--goal-mint)] hover:text-white"
              >
                Forgot password?
              </button>
              <Link href="/register" className="font-bold text-slate-300 hover:text-white">
                Create account
              </Link>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
            <div className="mb-5 flex items-center gap-3">
              <ShieldCheck className="size-6 text-[var(--goal-mint)]" />
              <div>
                <h2 className="font-heading text-2xl font-black text-white">Demo Users</h2>
                <p className="text-sm text-slate-400">Pick a role and route into the matching dashboard.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {demoRoles.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => chooseDemoRole(role)}
                  className="rounded-xl border border-white/10 bg-white/5 p-4 text-left transition-colors hover:border-[var(--goal-emerald)]/35 hover:bg-[var(--goal-emerald)]/10"
                >
                  <p className="font-heading text-base font-black text-white">Continue as {roleLabel(role)}</p>
                  <p className="mt-1 text-xs text-slate-400">{routeForAppRole(role)}</p>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <AuthContent />
    </Suspense>
  );
}
