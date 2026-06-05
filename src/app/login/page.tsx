'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Lock, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageContainer, SectionHeader, TrustNote } from '@/components/ui/product';
import { demoAccounts, getUserProfile, getUserRole, login, routeForAppRole } from '@/lib/firebase/auth';
import { isFirebaseConfigured } from '@/lib/firebase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const redirectAfterLogin = async (uid: string, user: Parameters<typeof getUserRole>[0]) => {
    const next = new URLSearchParams(window.location.search).get('next');
    const profile = await getUserProfile(uid);
    const role = await getUserRole(user, profile);
    router.push(next || routeForAppRole(role));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isFirebaseConfigured) {
      toast.error('Firebase is not configured yet. Add NEXT_PUBLIC_FIREBASE_* env vars.');
      return;
    }

    setSubmitting(true);
    try {
      const credential = await login(email, password);
      toast.success('Logged in to GoalPlace256');
      await redirectAfterLogin(credential.user.uid, credential.user);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const loginDemo = async (demoEmail: string) => {
    const demoPassword = process.env.NEXT_PUBLIC_FIREBASE_DEMO_PASSWORD;
    if (!demoPassword) {
      toast.error('Set NEXT_PUBLIC_FIREBASE_DEMO_PASSWORD locally to use demo login buttons.');
      return;
    }

    setEmail(demoEmail);
    setPassword(demoPassword);
    setSubmitting(true);
    try {
      const credential = await login(demoEmail, demoPassword);
      toast.success(`Logged in as ${demoEmail}`);
      await redirectAfterLogin(credential.user.uid, credential.user);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Demo login failed. Run the seed script first.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer compact className="max-w-5xl">
      <div className="grid min-h-[calc(100dvh-12rem)] gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <SectionHeader
            eyebrow="Login"
            title="Welcome back to GoalPlace256"
            description="Pick up your fan activity, athlete support, league updates, wallet history, and Annual Awards progress."
          />
          <TrustNote compact />
        </div>
        <form onSubmit={submit} className="glass-panel rounded-xl p-5 md:p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl border border-[var(--goal-emerald)]/25 bg-[var(--goal-emerald)]/10 text-[var(--goal-mint)]">
              <ShieldCheck className="size-6" />
            </div>
            <div>
              <h1 className="font-heading text-2xl font-black text-white">Firebase Login</h1>
              <p className="text-sm text-slate-400">Email/password auth with seeded demo accounts.</p>
            </div>
          </div>
          <label className="mb-4 block">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Email</span>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/10 bg-white/6 px-3">
              <Mail className="size-4 text-slate-500" />
              <input
                className="h-12 w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-slate-500"
                placeholder="you@example.com"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
          </label>
          <label className="mb-6 block">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Password</span>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/10 bg-white/6 px-3">
              <Lock className="size-4 text-slate-500" />
              <input
                className="h-12 w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-slate-500"
                placeholder="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
          </label>
          <Button className="w-full" size="lg" type="submit" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Login'}
          </Button>
          <Button className="mt-3 w-full" variant="outline" type="button" onClick={() => router.push('/register?role=fan')}>Create Fan Account</Button>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {demoAccounts.map((account) => (
              <Button
                key={account.email}
                size="sm"
                variant="outline"
                type="button"
                disabled={submitting}
                onClick={() => loginDemo(account.email)}
              >
                {account.label}
              </Button>
            ))}
          </div>
        </form>
      </div>
    </PageContainer>
  );
}
