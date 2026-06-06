'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Shield01Icon, UserIcon } from 'hugeicons-react';
import { Medal, Trophy } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { LeagueIntegrityNote, LeagueStatusRoadmap } from '@/components/ui/league';
import { PageContainer, SectionHeader, TrustNote } from '@/components/ui/product';
import { registerAccount, routeForAppRole } from '@/lib/firebase/auth';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { AppRole } from '@/types';
import { cn } from '@/lib/utils';

const roles = [
  { slug: 'fan', label: 'Fan', icon: UserIcon, detail: 'Create a fan account to follow matches, support athletes, earn GoalPlace Points, and track your community impact.' },
  { slug: 'athlete', label: 'Athlete', icon: Trophy, detail: 'Create an athlete account to build your profile, receive support, post highlights, and track verified challenges.' },
  { slug: 'league_admin', label: 'League Admin', icon: Shield01Icon, detail: 'Create a league admin account to manage teams, athletes, fixtures, results, verifications, challenges, and league operations.' },
] satisfies Array<{ slug: AppRole; label: string; icon: React.ComponentType<{ className?: string }>; detail: string }>;

function normalizeInitialRole(role: string): AppRole {
  const normalized = role.replaceAll('-', '_');
  if (roles.some((item) => item.slug === normalized)) return normalized as AppRole;
  return 'fan';
}

export default function RegisterClient({ initialRole }: { initialRole: string }) {
  const router = useRouter();
  const [role, setRole] = useState<AppRole>(normalizeInitialRole(initialRole));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isFirebaseConfigured) {
      toast.error('Firebase is not configured yet. Add NEXT_PUBLIC_FIREBASE_* env vars.');
      return;
    }

    setSubmitting(true);
    try {
      await registerAccount({ email, password, name, role });
      toast.success(role === 'fan' ? 'Account created' : 'Account created and marked pending review');
      router.push(routeForAppRole(role));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (initialRole === 'platform-admin' || initialRole === 'platform_admin' || initialRole === 'super-admin' || initialRole === 'super_admin') {
    return (
      <PageContainer compact>
        <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
          <Shield01Icon className="mb-6 size-16 text-slate-500" />
          <h1 className="font-display text-3xl font-black text-white">Platform Admin Access</h1>
          <p className="mt-4 max-w-md text-slate-400">
            Platform Admin accounts are invite-only. Please contact GoalPlace256 support for administrative access.
          </p>
          <Button className="mt-6" onClick={() => router.push('/login')}>Go to Login</Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer compact>
      <SectionHeader
        eyebrow="Register"
        title="Join GoalPlace256"
        description="Choose the role that fits how you want to support, play, organize, or discover Ugandan sport."
      />

      <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {roles.map((item) => {
              const Icon = item.icon;
              const active = role === item.slug;
              return (
                <button
                  type="button"
                  key={item.slug}
                  className={cn(
                    'glass-panel min-h-44 rounded-xl p-5 text-left transition-all hover:-translate-y-1',
                    active && 'border-[var(--goal-emerald)]/45 shadow-[0_0_36px_rgba(0,196,106,0.16)]'
                  )}
                  onClick={() => setRole(item.slug)}
                >
                  <div className={cn('mb-5 flex size-11 items-center justify-center rounded-xl border', active ? 'border-[var(--goal-emerald)]/35 bg-[var(--goal-emerald)]/14 text-[var(--goal-mint)]' : 'border-white/10 bg-white/6 text-slate-300')}>
                    <Icon className="size-5" />
                  </div>
                  <h3 className="font-display text-xl font-black text-white">{item.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</p>
                </button>
              );
            })}
          </div>
          {role === 'league_admin' && (
            <div className="mt-5 grid gap-4">
              <LeagueIntegrityNote />
              <LeagueStatusRoadmap activeStatus="draft" className="md:grid-cols-1 xl:grid-cols-5" />
            </div>
          )}
        </div>

        <div className="glass-panel h-fit rounded-xl p-5 md:p-6">
          <div className="mb-6 flex items-center gap-3">
            <Medal className="size-7 text-[var(--goal-gold)]" />
            <div>
              <h2 className="font-display text-2xl font-black text-white">Create Demo Account</h2>
              <p className="text-sm text-slate-400">Creates Firebase Auth user and Firestore profile.</p>
            </div>
          </div>
          <div className="grid gap-4">
            <input className="h-12 rounded-lg border border-white/10 bg-white/6 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500" placeholder="Full name" value={name} onChange={(event) => setName(event.target.value)} required />
            <input className="h-12 rounded-lg border border-white/10 bg-white/6 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500" placeholder="Email address" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <input className="h-12 rounded-lg border border-white/10 bg-white/6 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500" placeholder="Phone or organization contact" value={phone} onChange={(event) => setPhone(event.target.value)} />
            <input className="h-12 rounded-lg border border-white/10 bg-white/6 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500" placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required />
            <Button size="lg" type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Submit Registration'}</Button>
            <Button variant="outline" type="button" onClick={() => router.push('/login')}>Already Have Account</Button>
          </div>
          <div className="mt-6">
            <TrustNote compact />
          </div>
        </div>
      </form>
    </PageContainer>
  );
}
