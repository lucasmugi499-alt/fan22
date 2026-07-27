'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bank, Clock, ShieldWarning, Wallet } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import type { Allocation, ComplianceCase } from '@/types/money';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { DemoDataNote } from '@/components/ui/DemoDataNote';

export function FinancialOperations() {
  const { isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [cases, setCases] = useState<ComplianceCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([provider.getAllocations(), provider.getComplianceCases()])
      .then(([nextAllocations, nextCases]) => {
        if (cancelled) return;
        setAllocations(nextAllocations);
        setCases(nextCases);
        setError(false);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [attempt, provider]);

  const pending = useMemo(
    () => allocations.filter((allocation) =>
      ['pending_review', 'eligible_for_payout', 'payout_scheduled'].includes(allocation.status)
    ),
    [allocations],
  );
  const openCases = cases.filter((item) => item.status === 'open' || item.status === 'reviewing');

  if (loading) return <div className="space-y-3"><Skeleton className="h-10 w-64" /><Skeleton className="h-56 w-full rounded-[var(--radius-lg)]" /></div>;
  if (error) return <ErrorState onRetry={() => {
    setLoading(true);
    setAttempt((value) => value + 1);
  }} />;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-text-strong">Financial operations</h1>
        <p className="text-sm text-muted">Provider settlement, recipient allocation, and compliance review. GoalPlace256 does not hold a user wallet.</p>
      </header>
      <DemoDataNote />
      <Card className="flex items-start gap-3 border-[color:var(--state-pending)]/40 p-4">
        <ShieldWarning className="mt-0.5 h-5 w-5 shrink-0 text-[var(--state-pending)]" weight="duotone" />
        <div>
          <p className="text-sm font-semibold text-text-strong">Real payout actions are disabled</p>
          <p className="mt-1 text-sm text-muted">This desk is read-only until a licensed PSP, KYC operations, refund controls, legal approvals, and reconciliation tests are complete.</p>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Metric icon={Wallet} label="Allocations" value={allocations.length} />
        <Metric icon={Clock} label="Pending payout" value={pending.length} />
        <Metric icon={ShieldWarning} label="Open reviews" value={openCases.length} />
        <Metric icon={Bank} label="Stored wallets" value={0} />
      </div>
      <section className="space-y-2.5">
        <h2 className="text-[15px] font-semibold text-text-strong">Allocation queue</h2>
        {pending.length ? pending.map((allocation) => (
          <Card key={allocation.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text-strong">{allocation.recipientType} · {allocation.recipientId}</p>
              <p className="mt-1 text-xs capitalize text-muted">{allocation.status.replaceAll('_', ' ')} · {allocation.destinationType?.replaceAll('_', ' ') ?? 'destination review required'}</p>
            </div>
            <p className="shrink-0 text-sm font-bold tabular-nums text-text-strong">UGX {allocation.amountMinor.toLocaleString()}</p>
          </Card>
        )) : <EmptyState icon={Bank} title="No pending allocations" description="PSP-settled recipient allocations will appear here for controlled payout review." />}
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Bank; label: string; value: number }) {
  return (
    <Card className="p-3.5">
      <span className="mb-2 grid h-8 w-8 place-items-center rounded-full bg-surface-3 text-muted"><Icon className="h-4 w-4" weight="bold" /></span>
      <p className="text-2xl font-bold tabular-nums text-text-strong">{value}</p>
      <p className="text-[11px] font-medium uppercase text-subtle">{label}</p>
    </Card>
  );
}
