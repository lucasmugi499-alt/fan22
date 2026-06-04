'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Lock, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageContainer, SectionHeader, TrustNote } from '@/components/ui/product';

export default function LoginPage() {
  const router = useRouter();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    toast.success('Logged in demo mode');
    router.push('/dashboard');
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
              <h1 className="font-heading text-2xl font-black text-white">Demo Login</h1>
              <p className="text-sm text-slate-400">No real authentication yet.</p>
            </div>
          </div>
          <label className="mb-4 block">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Email</span>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/10 bg-white/6 px-3">
              <Mail className="size-4 text-slate-500" />
              <input className="h-12 w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-slate-500" placeholder="you@example.com" type="email" />
            </div>
          </label>
          <label className="mb-6 block">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Password</span>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/10 bg-white/6 px-3">
              <Lock className="size-4 text-slate-500" />
              <input className="h-12 w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-slate-500" placeholder="Demo password" type="password" />
            </div>
          </label>
          <Button className="w-full" size="lg" type="submit">Login</Button>
          <Button className="mt-3 w-full" variant="outline" type="button" onClick={() => router.push('/register?role=fan')}>Create Fan Account</Button>
        </form>
      </div>
    </PageContainer>
  );
}
