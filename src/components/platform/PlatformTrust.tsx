'use client';

import { useMemo, useState } from 'react';
import { ShieldCheck, Flag, CheckCircle, XCircle, Warning, PaperPlaneTilt, Gavel } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { openReports } from '@/lib/platform/platformContext';
import { QueueItem } from '@/components/core/QueueItem';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { AuditTimeline, type AuditStep } from '@/components/core/AuditTimeline';
import { STATE } from '@/lib/statusSystem';
import type { Report } from '@/types';
import { useAuth } from '@/context/AuthProvider';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { ChallengeWorkflow } from '@/components/core/ChallengeWorkflow';

const SEVERITY_STATE = { Critical: STATE.disputed, High: STATE.disputed, Medium: STATE.overdue, Low: STATE.pending } as const;

export function PlatformTrust() {
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const { reports, loading, retry } = useGoalPlaceData({ collections: ['reports'] });
  const list = useMemo(() => openReports(reports), [reports]);
  const [active, setActive] = useState<Report | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function decide(decision: 'resolved' | 'dismissed') {
    const actorUserId = currentUser?.uid ?? userProfile?.uid;
    if (!active || !actorUserId) {
      toast.error('Your Platform Admin account is not ready.');
      return;
    }
    setSaving(true);
    try {
      await provider.resolveReport({
        reportId: active.id,
        actorUserId,
        decision,
        note: note.trim() || undefined,
      });
      toast.success(decision === 'resolved' ? 'Case resolved.' : 'Case dismissed.');
      setActive(null);
      setNote('');
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'The case decision could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-16 w-full rounded-[var(--radius-lg)]" /><Skeleton className="h-16 w-full rounded-[var(--radius-lg)]" /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text-strong">Trust and safety</h1>
        <p className="text-sm text-muted">Every case carries its full provenance. Decisions are logged.</p>
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
      ) : (
        <EmptyState icon={ShieldCheck} title="No open cases" description="Reports and escalations appear here with their full history." />
      )}

      <ChallengeWorkflow scope="platform" />

      {active ? (
        <Sheet
          open
          onClose={() => setActive(null)}
          title="Review case"
          description={active.summary}
          footer={
            <div className="flex gap-2">
              <Button block variant="secondary" icon={XCircle} onClick={() => decide('dismissed')} disabled={saving}>Dismiss</Button>
              <Button block icon={CheckCircle} onClick={() => decide('resolved')} disabled={saving}>Resolve</Button>
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
            <label className="block text-xs font-semibold uppercase text-subtle">
              Decision note
              <textarea className="field mt-2 min-h-24 py-3 normal-case" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reason for the decision and any follow-up." />
            </label>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
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
