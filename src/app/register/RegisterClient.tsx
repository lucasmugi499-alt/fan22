'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Building2, Eye, Medal, Shield, Trophy, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LeagueIntegrityNote, LeagueStatusRoadmap } from '@/components/ui/league';
import { PageContainer, SectionHeader, TrustNote } from '@/components/ui/product';
import { cn } from '@/lib/utils';

const roles = [
  { slug: 'fan', label: 'Fan', icon: User, detail: 'Follow sport, support athletes, earn GoalPlace Points.' },
  { slug: 'athlete', label: 'Athlete', icon: Trophy, detail: 'Build your profile, challenges, highlights, and support base.' },
  { slug: 'team-admin', label: 'Team Admin', icon: Users, detail: 'Manage team presence, rosters, and support activity.' },
  { slug: 'league-admin', label: 'League Admin', icon: Shield, detail: 'Create a Draft League, verify fixtures, confirm results, and manage payouts.' },
  { slug: 'sponsor', label: 'Sponsor', icon: Building2, detail: 'Support athletes, teams, leagues, youth, and women and youth sport.' },
  { slug: 'scout', label: 'Scout', icon: Eye, detail: 'Track rising talent and verified performance history.' },
];

function routeForRole(role: string) {
  if (role === 'athlete') return '/athlete-dashboard';
  if (role === 'league-admin' || role === 'team-admin') return '/league-admin';
  if (role === 'sponsor') return '/sponsors';
  return '/dashboard';
}

export default function RegisterClient({ initialRole }: { initialRole: string }) {
  const router = useRouter();
  const [role, setRole] = useState(initialRole);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    toast.success('Account created in demo mode');
    router.push(routeForRole(role));
  };

  return (
    <PageContainer compact>
      <SectionHeader
        eyebrow="Register"
        title="Join GoalPlace256"
        description="Choose the role that fits how you want to support, play, organize, sponsor, or discover Ugandan sport."
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
                  <h3 className="font-heading text-xl font-black text-white">{item.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</p>
                </button>
              );
            })}
          </div>
          {role === 'league-admin' && (
            <div className="mt-5 grid gap-4">
              <LeagueIntegrityNote />
              <LeagueStatusRoadmap activeStatus="Draft League" className="md:grid-cols-1 xl:grid-cols-5" />
            </div>
          )}
        </div>

        <div className="glass-panel h-fit rounded-xl p-5 md:p-6">
          <div className="mb-6 flex items-center gap-3">
            <Medal className="size-7 text-[var(--goal-gold)]" />
            <div>
              <h2 className="font-heading text-2xl font-black text-white">Create Demo Account</h2>
              <p className="text-sm text-slate-400">No real authentication yet.</p>
            </div>
          </div>
          <div className="grid gap-4">
            <input className="h-12 rounded-lg border border-white/10 bg-white/6 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500" placeholder="Full name" />
            <input className="h-12 rounded-lg border border-white/10 bg-white/6 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500" placeholder="Email address" type="email" />
            <input className="h-12 rounded-lg border border-white/10 bg-white/6 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500" placeholder="Phone or organization contact" />
            <Button size="lg" type="submit">Submit Registration</Button>
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
