'use client';

import { ArrowsClockwise, CheckCircle, Clock, HandHeart, ShieldCheck } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useUserContributions } from '@/lib/firebase/useGoalPlaceData';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { DemoDataNote } from '@/components/ui/DemoDataNote';

const STATUS_COPY = {
  created: 'Created',
  payment_pending: 'Awaiting PSP',
  payment_processing: 'Processing',
  settled: 'PSP settled',
  allocated: 'Allocated',
  payout_pending: 'Payout scheduled',
  paid: 'Paid',
  failed: 'Failed',
  cancelled: 'Cancelled',
  refund_pending: 'Refund pending',
  refunded: 'Refunded',
  chargeback: 'Chargeback',
  held_for_review: 'Held for review',
} as const;

export function ContributionActivity() {
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const userId = currentUser?.uid ?? userProfile?.uid;
  const { items, loading } = useUserContributions(userId);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-text-strong">Support activity</h1>
        <p className="text-sm text-muted">Payment-provider status and recipient allocations. This is not a stored-value wallet.</p>
      </header>

      <Card className="flex items-start gap-3 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" weight="duotone" />
        <div>
          <p className="text-sm font-semibold text-text-strong">Money stays with licensed payment partners</p>
          <p className="mt-1 text-sm text-muted">GoalPlace256 records each instruction, settlement, allocation, fee, and payout without offering deposits, transfers, cash-out, or a reusable balance.</p>
        </div>
      </Card>

      {isDemoMode ? <DemoDataNote /> : null}

      <h2 className="text-[15px] font-semibold text-text-strong">Contributions</h2>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-16 w-full rounded-[var(--radius-md)]" />)}</div>
      ) : items.length ? (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-1">
          {items.map((item) => {
            const completed = ['settled', 'allocated', 'paid'].includes(item.status);
            const Icon = completed ? CheckCircle : item.status === 'payment_pending' ? Clock : HandHeart;
            return (
              <div key={item.id} className="flex items-center gap-3 border-b border-border p-3.5 last:border-0">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-subtle text-brand"><Icon className="h-4 w-4" weight="bold" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-strong">{item.purpose.replaceAll('_', ' ')}</p>
                  <p className="text-xs text-subtle">{STATUS_COPY[item.status]} · UGX {item.supportAmountMinor.toLocaleString()} support · UGX {item.platformFeeMinor.toLocaleString()} service fee</p>
                </div>
                <span data-numeric className="shrink-0 text-sm font-bold tabular-nums text-text-strong">UGX {item.totalAmountMinor.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={ArrowsClockwise} title="No support activity yet" description="Each PSP-backed contribution and its allocation status will appear here." />
      )}
    </div>
  );
}
