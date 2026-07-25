'use client';

import { useMemo } from 'react';
import { Coins, ShieldCheck, Users, SealCheck, Broadcast } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { isOfficialMatch } from '@/lib/status';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { DemoDataNote } from '@/components/ui/DemoDataNote';
import { AthleteCard } from '@/components/core/EntityCards';

function ugx(n: number): string {
  if (n >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `UGX ${(n / 1_000).toFixed(0)}k`;
  return `UGX ${n}`;
}

/**
 * Sponsor impact and proof. No competition controls. Everything shown is backed by verified
 * activity, which is the entire reason a sponsor can trust the reach numbers.
 */
export function SponsorReport() {
  const { teams, athletes, matches, loading } = useGoalPlaceData();
  const data = useMemo(() => {
    const played = matches.filter((m) => m.status === 'completed');
    const official = played.filter(isOfficialMatch).length;
    const support = teams.reduce((s, t) => s + (t.totalSupport ?? 0), 0);
    const supporters = teams.reduce((s, t) => s + (t.supportersCount ?? 0), 0);
    const topAthletes = [...athletes].filter((a) => a.verified).sort((a, b) => (b.totalSupport ?? 0) - (a.totalSupport ?? 0)).slice(0, 4);
    return { official, rate: played.length ? Math.round((official / played.length) * 100) : 0, support, supporters, topAthletes };
  }, [teams, athletes, matches]);

  if (loading) return <div className="space-y-3"><Skeleton className="h-8 w-40" /><Skeleton className="h-48 w-full rounded-[var(--radius-lg)]" /></div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text-strong">Sponsor impact</h1>
        <p className="text-sm text-muted">Proof of reach, built entirely on verified activity.</p>
      </div>

      <DemoDataNote />

      <div className="grid grid-cols-2 gap-2.5">
        <Big icon={Coins} label="Support directed" value={ugx(data.support)} accent="text-[var(--brand-2)]" />
        <Big icon={Users} label="Supporters reached" value={String(data.supporters)} />
        <Big icon={ShieldCheck} label="Verified results" value={`${data.rate}%`} accent="text-[var(--state-verified)]" />
        <Big icon={Broadcast} label="Official matches" value={String(data.official)} />
      </div>

      <Card className="p-4">
        <p className="text-sm font-semibold text-text-strong">Why this is trustworthy</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          A sponsor cannot fake reach here. Every figure derives from results that both teams
          confirmed and GoalPlace256 finalized. Unverified claims are excluded by design.
        </p>
      </Card>

      <section className="space-y-2.5">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-text-strong">
          <SealCheck className="h-4 w-4 text-[var(--state-verified)]" weight="fill" /> Verified athletes to feature
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {data.topAthletes.map((a) => <AthleteCard key={a.id} athlete={a} />)}
        </div>
      </section>
    </div>
  );
}

function Big({ icon: Icon, label, value, accent = 'text-text-strong' }: { icon: typeof Coins; label: string; value: string; accent?: string }) {
  return (
    <Card className="p-4">
      <span className="mb-2 inline-grid h-9 w-9 place-items-center rounded-full bg-surface-3 text-muted"><Icon className="h-5 w-5" weight="bold" /></span>
      <p data-numeric className={`tabular text-xl font-bold tabular-nums ${accent}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</p>
    </Card>
  );
}
