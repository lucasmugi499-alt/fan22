'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle, HandHeart, ShieldCheck } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { SupportSheet } from '@/components/fan/SupportSheet';
import type { SupportNeed } from '@/types';

function ugx(value: number) {
  return `UGX ${value.toLocaleString()}`;
}

export function SupportHub() {
  const { supportNeeds, athletes, teams, loading, retry } = useGoalPlaceData({
    collections: ['supportNeeds', 'athletes', 'teams'],
  });
  const [active, setActive] = useState<SupportNeed>();
  const sorted = useMemo(
    () => supportNeeds
      .filter((need) =>
        need.verificationStatus === 'verified' &&
        need.approvalStatus === 'league_approved'
      )
      .sort((a, b) => (a.status === 'open' ? -1 : 1) - (b.status === 'open' ? -1 : 1)),
    [supportNeeds],
  );

  if (loading) return <div className="space-y-3"><Skeleton className="h-10 w-52" />{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-56 w-full rounded-[var(--radius-lg)]" />)}</div>;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-text-strong">Community support</h1>
        <p className="mt-1 text-sm text-muted">See the need, the verified recipient, the progress, and the evidence after completion.</p>
      </header>
      {sorted.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {sorted.map((need) => {
            const athlete = athletes.find((item) => item.id === need.athleteId);
            const team = teams.find((item) => item.id === need.teamId);
            const progress = Math.min(100, Math.round(need.raisedAmount / need.targetAmount * 100));
            return (
              <Card key={need.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-brand"><ShieldCheck className="h-3.5 w-3.5" weight="fill" /> Team verified · League approved</p>
                    <h2 className="mt-1 text-lg font-semibold text-text-strong">{need.title}</h2>
                    <p className="text-sm text-muted">{athlete?.name ?? team?.name ?? 'League development need'}</p>
                  </div>
                  {need.status === 'funded' || need.status === 'completed' ? <CheckCircle className="h-6 w-6 shrink-0 text-verified" weight="fill" /> : null}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted">{need.story}</p>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-text-strong">{ugx(need.raisedAmount)}</span>
                    <span className="text-muted">of {ugx(need.targetAmount)}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-brand transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
                </div>
                {need.recipientUpdates.length ? (
                  <div className="mt-4 border-l-2 border-brand pl-3">
                    <p className="text-[11px] font-semibold uppercase text-subtle">Latest recipient update</p>
                    <p className="mt-1 text-sm text-muted">{need.recipientUpdates[0].message}</p>
                    {need.recipientUpdates[0].evidenceUrl ? <a href={need.recipientUpdates[0].evidenceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand">View evidence <ArrowRight className="h-3 w-3" /></a> : null}
                  </div>
                ) : null}
                <div className="mt-4 flex gap-2">
                  {athlete ? <Link href={`/athletes/${athlete.id}`} className="inline-flex h-10 flex-1 items-center justify-center rounded-[var(--radius-md)] border border-border text-sm font-semibold text-muted">View athlete</Link> : null}
                  {athlete && need.status === 'open' ? <Button className="flex-1" icon={HandHeart} onClick={() => setActive(need)}>Support need</Button> : null}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={HandHeart} title="No support needs published" description="Verified athlete and team development needs will appear here." />
      )}
      {active?.athleteId ? (
        <SupportSheet
          open
          onClose={() => { setActive(undefined); retry(); }}
          athlete={athletes.find((item) => item.id === active.athleteId)!}
          need={active}
        />
      ) : null}
    </div>
  );
}
