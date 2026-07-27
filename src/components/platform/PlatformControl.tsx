'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { CheckCircle, Flag, Warning, Buildings, ShieldCheck } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { pendingApprovals, openReports, disputedMatches } from '@/lib/platform/platformContext';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { QueueItem } from '@/components/core/QueueItem';
import { STATE } from '@/lib/statusSystem';
import { cn } from '@/lib/utils';

export function PlatformControl() {
  const { leagues, athletes, matches, reports, loading } = useGoalPlaceData({
    collections: ['leagues', 'athletes', 'matches', 'reports'],
  });

  const approvals = useMemo(() => pendingApprovals(leagues, athletes), [leagues, athletes]);
  const reportsOpen = useMemo(() => openReports(reports), [reports]);
  const disputes = useMemo(() => disputedMatches(matches), [matches]);

  if (loading) return <ControlSkeleton />;

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-[var(--radius-md)] bg-brand text-on-brand shadow-[var(--glow-brand)]">
          <ShieldCheck className="h-6 w-6" weight="fill" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-strong">Governance</h1>
          <p className="text-sm text-muted">Trust and safety across the whole platform.</p>
        </div>
      </header>

      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">Today</p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Metric icon={CheckCircle} label="Approvals" value={approvals.length} tone={approvals.length ? 'pending' : 'default'} />
        <Metric icon={Flag} label="Open reports" value={reportsOpen.length} tone={reportsOpen.length ? 'disputed' : 'default'} />
        <Metric icon={Warning} label="Disputes" value={disputes.length} tone={disputes.length ? 'pending' : 'default'} />
        <Metric icon={Buildings} label="Leagues" value={leagues.length} />
      </div>

      <Section title="Awaiting approval" href="/admin/approvals">
        {approvals.length ? (
          <div className="space-y-2.5">
            {approvals.slice(0, 3).map((a) => (
              <QueueItem key={`${a.kind}-${a.id}`} state={STATE.pending} title={a.title} subtitle={a.subtitle} />
            ))}
          </div>
        ) : (
          <Card className="p-4 text-sm text-muted">Nothing awaiting approval.</Card>
        )}
      </Section>

      <Section title="Open reports" href="/admin/trust">
        {reportsOpen.length ? (
          <div className="space-y-2.5">
            {reportsOpen.slice(0, 3).map((r) => (
              <QueueItem key={r.id} state={STATE.disputed} title={r.summary} subtitle={`${r.type.replace(/_/g, ' ')} · ${r.severity ?? 'unrated'}`} />
            ))}
          </div>
        ) : (
          <Card className="p-4 text-sm text-muted">No open reports.</Card>
        )}
      </Section>
    </div>
  );
}

function Section({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-text-strong">{title}</h2>
        <Link href={href} className="text-sm font-medium text-brand hover:underline">View all</Link>
      </div>
      {children}
    </section>
  );
}

function Metric({ icon: Icon, label, value, tone = 'default' }: { icon: typeof Flag; label: string; value: number; tone?: 'default' | 'pending' | 'disputed' }) {
  const color = tone === 'pending' ? 'text-[var(--state-pending)]' : tone === 'disputed' ? 'text-[var(--state-disputed)]' : 'text-text-strong';
  return (
    <Card className="p-3.5">
      <span className="mb-2 inline-grid h-8 w-8 place-items-center rounded-full bg-surface-3 text-muted"><Icon className="h-4 w-4" weight="bold" /></span>
      <p data-numeric className={cn('tabular text-2xl font-bold tabular-nums', color)}>{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</p>
    </Card>
  );
}

function ControlSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-12 w-52" />
      <div className="grid grid-cols-4 gap-2.5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-[var(--radius-lg)]" />)}</div>
      <Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" />
    </div>
  );
}
