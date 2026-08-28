'use client';

import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Flag, Warning, PaperPlaneTilt, Gavel, Pulse, ClockCountdown } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { openReports } from '@/lib/platform/platformContext';
import { QueueItem } from '@/components/core/QueueItem';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Sheet } from '@/components/ui/Sheet';
import { AuditTimeline, type AuditStep } from '@/components/core/AuditTimeline';
import { STATE } from '@/lib/statusSystem';
import type { Report, ResultSubmission } from '@/types';
import type { ComplianceCase } from '@/types/money';
import { useAuth } from '@/context/AuthProvider';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { ChallengeWorkflow } from '@/components/core/ChallengeWorkflow';
import { ConsequenceSheet } from '@/components/platform/commands/ConsequenceSheet';
import { PlatformCommandButton } from '@/components/platform/commands/PlatformCommandButton';
import { usePlatformCommand } from '@/components/platform/commands/usePlatformCommand';

const SEVERITY_STATE = { Critical: STATE.disputed, High: STATE.disputed, Medium: STATE.overdue, Low: STATE.pending } as const;

export function PlatformTrust() {
  const { isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const { reports, leagues, matches, finalizations, adminAuditEvents, loading, retry } = useGoalPlaceData({
    collections: ['reports', 'leagues', 'matches', 'finalizations', 'adminAuditEvents'],
    recordLimit: 500,
  });
  const list = useMemo(() => openReports(reports), [reports]);
  const [active, setActive] = useState<Report | null>(null);
  const [decision, setDecision] = useState<'resolved' | 'dismissed' | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const command = usePlatformCommand('/api/admin/actions');
  const [submissions, setSubmissions] = useState<ResultSubmission[]>([]);
  const [complianceCases, setComplianceCases] = useState<ComplianceCase[]>([]);
  const [operationsError, setOperationsError] = useState<string>();
  const [renderedAt] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      Promise.all(leagues.map((league) => provider.getLeagueResultExceptions(league.id))),
      provider.getComplianceCases(),
    ]).then(([queues, cases]) => {
      if (cancelled) return;
      setSubmissions([...new Map(queues.flat().map((item) => [item.id, item])).values()]);
      setComplianceCases(cases);
      setOperationsError(undefined);
    }).catch(() => {
      if (!cancelled) {
        setSubmissions([]);
        setComplianceCases([]);
        setOperationsError('Operational queues could not be loaded. Counts are unavailable, not zero.');
      }
    });
    return () => { cancelled = true; };
  }, [leagues, provider]);

  const overdueConfirmations = submissions.filter((item) =>
    item.status === 'confirmation_overdue'
    || (
      item.status === 'pending_confirmation'
      && Boolean(item.confirmationDeadline)
      && Date.parse(item.confirmationDeadline!) < renderedAt
    ),
  );
  const disputedSubmissions = submissions.filter((item) => item.status === 'disputed');
  const failedFinalizations = finalizations.filter((item) => item.status === 'failed');
  const highRiskCases = complianceCases.filter((item) =>
    item.status !== 'cleared' && ['enhanced', 'high_value'].includes(item.riskTier),
  );
  const officialMatches = matches.filter((match) => match.verificationStatus === 'verified').length;
  const playedMatches = matches.filter((match) => match.status === 'completed').length;

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-16 w-full rounded-[var(--radius-lg)]" /><Skeleton className="h-16 w-full rounded-[var(--radius-lg)]" /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text-strong">Trust command centre</h1>
        <p className="text-sm text-muted">Authoritative workflow queues, network health, and server-written audit history.</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <TrustMetric label="Disputed submissions" value={operationsError ? 'Unavailable' : disputedSubmissions.length} tone="error" />
        <TrustMetric label="Overdue confirmations" value={operationsError ? 'Unavailable' : overdueConfirmations.length} tone="warning" />
        <TrustMetric label="Failed finalizations" value={failedFinalizations.length} tone="error" />
        <TrustMetric label="High-risk support" value={operationsError ? 'Unavailable' : highRiskCases.length} tone="warning" />
      </div>

      {operationsError ? (
        <div role="alert" className="rounded-[var(--radius-md)] border border-[color:var(--state-error)] bg-[color:var(--state-error-subtle)] p-3 text-sm text-text-strong">
          {operationsError}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface-1 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-text-strong"><Pulse className="h-4 w-4 text-brand" /> Network health</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <HealthStat label="Active leagues" value={leagues.filter((league) => league.status !== 'draft').length} />
            <HealthStat label="Official rate" value={playedMatches ? `${Math.round(officialMatches / playedMatches * 100)}%` : '0%'} />
            <HealthStat label="Open workflows" value={operationsError ? 'Unavailable' : submissions.length} />
          </div>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface-1 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-text-strong"><ClockCountdown className="h-4 w-4 text-brand" /> Immutable audit stream</p>
          <div className="mt-3 space-y-2">
            {adminAuditEvents.slice(0, 4).map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-muted">{event.action.replaceAll('_', ' ')} / {event.targetCollection}</span>
                <span className="shrink-0 text-subtle">{event.createdAt ? new Date(event.createdAt).toLocaleDateString('en-GB') : 'Server'}</span>
              </div>
            ))}
            {!adminAuditEvents.length ? <p className="text-xs text-muted">Trusted actions will appear here after the server records them.</p> : null}
          </div>
        </div>
      </div>

      {list.length ? (
        <div className="space-y-2.5">
          {list.map((r) => (
            <QueueItem
              key={r.id}
              state={SEVERITY_STATE[r.severity ?? 'Low'] ?? STATE.pending}
              title={r.summary}
              subtitle={`${r.type.replace(/_/g, ' ')} · ${r.severity ?? 'unrated'}`}
              meta={r.affectedEntity || r.reportedEntity}
              onClick={() => setActive(r)}
            />
          ))}
        </div>
      ) : operationsError ? (
        <EmptyState icon={Warning} title="Trust queue unavailable" description="Reconnect or retry before making operational decisions." />
      ) : (
        <EmptyState icon={ShieldCheck} title="No open cases" description="Reports and escalations appear here with their full history." />
      )}

      <ChallengeWorkflow scope="platform" />

      {success ? <p role="status" className="text-sm text-[var(--state-success)]">{success}</p> : null}

      {active && !decision ? (
        <Sheet
          open
          onClose={() => { setActive(null); command.reset(); }}
          title="Review case"
          description={active.summary}
          footer={
            <div className="flex gap-2">
              <PlatformCommandButton commandId="trust.report.resolve" label="Dismiss" block onClick={() => setDecision('dismissed')} />
              <PlatformCommandButton commandId="trust.report.resolve" label="Resolve" block onClick={() => setDecision('resolved')} />
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <Tag label={active.type.replace(/_/g, ' ')} />
              {active.severity ? <Tag label={active.severity} /> : null}
              <Tag label={active.status} />
            </div>
            {active.reasonFlagged ? <p className="text-sm text-muted">{active.reasonFlagged}</p> : null}
            <div>
              <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">
                <Flag className="h-3.5 w-3.5" weight="bold" /> Provenance
              </p>
              <AuditTimeline steps={reportProvenance(active)} />
            </div>
          </div>
        </Sheet>
      ) : null}
      <ConsequenceSheet
        open={Boolean(active && decision)}
        commandId="trust.report.resolve"
        targetId={active?.id}
        inputs={{ action: 'resolve_report', reportId: active?.id, decision }}
        title={active && decision ? `${decision === 'resolved' ? 'Resolve' : 'Dismiss'} ${active.summary}` : 'Review trust decision'}
        submitLabel={decision === 'resolved' ? 'Resolve case' : 'Dismiss case'}
        running={command.running}
        error={command.error}
        onClose={() => { setDecision(null); command.reset(); }}
        onSubmit={async (_values, reason) => {
          if (!active || !decision) return;
          const label = decision === 'resolved' ? 'Case resolved.' : 'Case dismissed.';
          const ok = await command.run({ action: 'resolve_report', reportId: active.id, decision, note: reason }, label);
          if (ok) {
            setSuccess(label);
            setDecision(null);
            setActive(null);
            retry();
          }
        }}
      />
    </div>
  );
}

function TrustMetric({ label, value, tone }: { label: string; value: number | string; tone: 'error' | 'warning' }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface-1 p-3">
      <p className={`${typeof value === 'number' ? 'text-2xl' : 'text-sm'} font-semibold tabular-nums ${tone === 'error' ? 'text-[var(--state-error)]' : 'text-[var(--state-warning)]'}`}>{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

function HealthStat({ label, value }: { label: string; value: number | string }) {
  return <div><p className="text-lg font-semibold text-text-strong tabular-nums">{value}</p><p className="text-[11px] text-muted">{label}</p></div>;
}

function Tag({ label }: { label: string }) {
  return <span className="rounded-[var(--radius-pill)] border border-border bg-surface-2 px-2.5 py-1 font-medium capitalize text-muted">{label}</span>;
}

function reportProvenance(r: Report): AuditStep[] {
  const steps: AuditStep[] = [
    { label: 'Reported', actor: r.reporterName || 'A platform member', timestamp: r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB') : undefined, icon: PaperPlaneTilt, tone: 'neutral' },
  ];
  if (r.actionHistory?.length) {
    for (const h of r.actionHistory) steps.push({ label: h, actor: r.assignedReviewer || 'Platform admin', icon: Gavel, tone: 'pending' });
  } else {
    steps.push({ label: 'Awaiting review', actor: r.assignedReviewer || 'Unassigned', icon: Warning, tone: 'pending' });
  }
  return steps;
}
