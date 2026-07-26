'use client';

import { useMemo } from 'react';
import { ArrowDown, ArrowUp, Wallet, ArrowsClockwise, HandHeart } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData, useUserWalletTransactions } from '@/lib/firebase/useGoalPlaceData';
import { useAppStore } from '@/lib/store';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

const INFLOW = new Set(['deposit', 'refund', 'payout']);

export function WalletScreen() {
  const { userProfile } = useAuth();
  const userId = userProfile?.id ?? userProfile?.uid ?? '';
  const { items, loading } = useUserWalletTransactions(userProfile?.id ?? userProfile?.uid);
  const { athletes } = useGoalPlaceData({ collections: ['athletes'] });
  const { demoPledges, demoWalletSpent } = useAppStore();

  const balance = (userProfile?.walletBalance ?? 0) - (demoWalletSpent[userId] ?? 0);
  const myPledges = useMemo(() => demoPledges.filter((p) => p.fanId === userId), [demoPledges, userId]);
  const athleteName = useMemo(() => new Map(athletes.map((a) => [a.id, a.name])), [athletes]);

  const hasActivity = myPledges.length > 0 || items.length > 0;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-text-strong">Wallet</h1>

      <Card className="relative overflow-hidden p-5">
        <span className="absolute inset-x-0 top-0 h-1 bg-brand" aria-hidden />
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-subtle">
          <Wallet className="h-3.5 w-3.5" /> Balance
        </p>
        <p data-numeric className="mt-1 tabular text-3xl font-bold tabular-nums text-text-strong">
          UGX {balance.toLocaleString()}
        </p>
      </Card>

      <h2 className="text-[15px] font-semibold text-text-strong">Recent activity</h2>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-[var(--radius-md)]" />)}</div>
      ) : hasActivity ? (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core">
          {myPledges.map((p) => (
            <div key={p.id} className="flex items-center gap-3 border-b border-border p-3.5 last:border-0">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-subtle text-brand">
                <HandHeart className="h-4 w-4" weight="bold" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-strong">
                  Backed {athleteName.get(p.athleteId ?? '') ?? 'an athlete'}
                </p>
                <p className="text-xs text-subtle">
                  <span className="capitalize">{p.status}</span> · UGX {p.netAmount.toLocaleString()} to the athlete
                </p>
              </div>
              <span data-numeric className="shrink-0 text-sm font-bold tabular-nums text-text-strong">
                -UGX {p.amount.toLocaleString()}
              </span>
            </div>
          ))}
          {items.map((t) => {
            const inflow = INFLOW.has(t.type);
            return (
              <div key={t.id} className="flex items-center gap-3 border-b border-border p-3.5 last:border-0">
                <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full', inflow ? 'bg-[var(--state-verified-bg)] text-[var(--state-verified)]' : 'bg-surface-3 text-muted')}>
                  {inflow ? <ArrowDown className="h-4 w-4" weight="bold" /> : <ArrowUp className="h-4 w-4" weight="bold" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-strong">{t.label || t.description}</p>
                  <p className="text-xs capitalize text-subtle">{t.type} · {t.status}</p>
                </div>
                <span data-numeric className={cn('shrink-0 text-sm font-bold tabular-nums', inflow ? 'text-[var(--state-verified)]' : 'text-text-strong')}>
                  {inflow ? '+' : '-'}UGX {Math.abs(t.amount).toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={ArrowsClockwise} title="No transactions yet" description="Deposits, support you send, and payouts you receive will appear here." />
      )}
    </div>
  );
}
