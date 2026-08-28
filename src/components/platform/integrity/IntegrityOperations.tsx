'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Clock, Gauge, Pulse as Activity, ShieldWarning, UserCircle } from '@phosphor-icons/react';
import { ConsequenceSheet } from '@/components/platform/commands/ConsequenceSheet';
import { PlatformCommandButton } from '@/components/platform/commands/PlatformCommandButton';
import { usePlatformCommand } from '@/components/platform/commands/usePlatformCommand';
import { EmptyState, PlatformAdminHeader, PlatformStatGrid, StatusChip } from '@/components/platform/PlatformAdminPrimitives';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthProvider';

type LiveCard = {
  id: string;
  label: string;
  leagueId: string;
  scheduledAt: string | null;
  matchStatus: string;
  clockState: string;
  period: string;
  currentGeneration: number;
  operatorLabel: string;
  assignmentStatus: string;
  reportStatus: string;
  lastObservedAt: string | null;
  freshnessSource: string;
  measuredConditions: string[];
  exceptions: Array<{ id: string; code: string; status: string; blocking: boolean }>;
};

type Escalation = {
  id: string;
  matchId: string;
  leagueId: string;
  code: string;
  status: string;
  blocking: boolean;
  createdAt: string;
  deadlineAt: string;
  deadlineSource: 'stored' | 'seven_day_liveness';
  overdue: boolean;
  hasProposal: boolean;
};

type Payload =
  | { view: 'live'; generatedAt: string; cards: LiveCard[] }
  | { view: 'escalations'; total: number; items: Escalation[] }
  | { view: 'quality'; distribution: { total: number; gold: number; silver: number; bronze: number; legacy: number; ungraded: number }; policyFloor: string; policyVersion: number; provenance: string };

export function IntegrityOperations({ view }: { view: 'live' | 'escalations' | 'quality' }) {
  const { currentUser, isDemoMode } = useAuth();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [takeover, setTakeover] = useState<LiveCard | null>(null);
  const [ratify, setRatify] = useState<Escalation | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const takeoverCommand = usePlatformCommand(`/api/matches/${encodeURIComponent(takeover?.id ?? 'missing')}/takeover`);
  const ratifyCommand = usePlatformCommand(`/api/exceptions/${encodeURIComponent(ratify?.id ?? 'missing')}/ratify`);
  const policyCommand = usePlatformCommand('/api/platform/capture-policy-floor');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      await Promise.resolve();
      if (isDemoMode) {
        if (!cancelled) {
          setPayload(view === 'live' ? { view, generatedAt: new Date().toISOString(), cards: [] }
            : view === 'escalations' ? { view, total: 0, items: [] }
              : { view, distribution: { total: 0, gold: 0, silver: 0, bronze: 0, legacy: 0, ungraded: 0 }, policyFloor: 'POST_MATCH_ALLOWED', policyVersion: 0, provenance: 'finalizations.dataQuality.tier' });
          setLoading(false);
        }
        return;
      }
      if (!currentUser || typeof currentUser.getIdToken !== 'function') {
        if (!cancelled) { setError('Sign in again to load Integrity operations.'); setLoading(false); }
        return;
      }
      if (!cancelled) { setLoading(true); setError(null); }
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/platform/integrity?view=${view}`, { headers: { authorization: `Bearer ${token}` } });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? 'Integrity operations could not be loaded.');
        if (!cancelled) setPayload(body as Payload);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Integrity operations could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [currentUser, isDemoMode, refresh, view]);

  if (loading) return <Skeleton className="h-[560px] rounded-[var(--radius-lg)]" />;
  if (error || !payload) return <Card className="p-5"><p role="alert" className="text-sm text-[var(--state-error)]">{error ?? 'Integrity operations unavailable.'}</p><Button className="mt-3" variant="secondary" onClick={() => setRefresh((value) => value + 1)}>Try again</Button></Card>;
  const nextPolicyFloor = payload.view === 'quality' && payload.policyFloor === 'POST_MATCH_ALLOWED'
    ? 'FIELD_PREFERRED'
    : 'FIELD_REQUIRED';

  return (
    <section className="space-y-5">
      {payload.view === 'live' ? <LiveView payload={payload} onTakeover={(card) => { setSuccess(null); setTakeover(card); }} /> : null}
      {payload.view === 'escalations' ? <EscalationView payload={payload} onRatify={(item) => { setSuccess(null); setRatify(item); }} /> : null}
      {payload.view === 'quality' ? <QualityView payload={payload} onPolicy={() => { setSuccess(null); setPolicyOpen(true); }} /> : null}
      {success ? <Card className="p-3"><p role="status" className="text-sm text-brand">{success}</p></Card> : null}

      <ConsequenceSheet open={Boolean(takeover)} commandId="integrity.match.force_takeover" targetId={takeover?.id} inputs={{ matchId: takeover?.id }} title={takeover ? `Start fenced takeover for ${takeover.label}` : 'Start fenced takeover'} submitLabel="Start takeover" running={takeoverCommand.running} error={takeoverCommand.error} onClose={() => { setTakeover(null); takeoverCommand.reset(); }} onSubmit={async (_values, reason) => { if (!takeover) return; const ok = await takeoverCommand.run({ reason }, 'A new attributed session generation was created.'); if (ok) { setTakeover(null); setSuccess('A new attributed session generation was created; the prior generation is fenced.'); setRefresh((value) => value + 1); } }} />
      <ConsequenceSheet
        open={Boolean(ratify)}
        commandId="integrity.exception.ratify"
        targetId={ratify?.id}
        inputs={{ exceptionId: ratify?.id }}
        title={ratify ? `Ratify ${ratify.code.replaceAll('_', ' ')}` : 'Ratify exception'}
        submitLabel="Ratify resolution"
        fields={[
          { name: 'decision', label: 'Decision', kind: 'select', required: true, defaultValue: 'accept_proposal', options: [{ value: 'accept_proposal', label: 'Accept proposal' }, { value: 'override', label: 'Override with resolution below' }] },
          { name: 'resolution', label: 'Override resolution', kind: 'textarea', maxLength: 2000, placeholder: 'Required only when overriding the proposal.' },
        ]}
        running={ratifyCommand.running}
        error={ratifyCommand.error}
        onClose={() => { setRatify(null); ratifyCommand.reset(); }}
        onSubmit={async (values, reason) => { if (!ratify) return; const ok = await ratifyCommand.run({ decision: values.decision, ...(values.resolution ? { resolution: values.resolution } : {}), note: reason }, 'Exception ratified.'); if (ok) { setRatify(null); setSuccess('Exception ratified by an unconflicted operator.'); setRefresh((value) => value + 1); } }}
      />
      <ConsequenceSheet
        open={policyOpen && payload.view === 'quality'}
        commandId="integrity.capture_policy_floor.set"
        targetId="global"
        inputs={payload.view === 'quality' ? { proposedFloor: nextPolicyFloor, expectedVersion: payload.policyVersion } : {}}
        title="Tighten capture-policy floor"
        submitLabel="Set policy floor"
        fields={[{ name: 'proposedFloor', label: 'New minimum', kind: 'select', required: true, defaultValue: nextPolicyFloor, options: [{ value: nextPolicyFloor, label: nextPolicyFloor === 'FIELD_PREFERRED' ? 'Field preferred' : 'Field required' }] }]}
        running={policyCommand.running}
        error={policyCommand.error}
        onClose={() => { setPolicyOpen(false); policyCommand.reset(); }}
        onSubmit={async (values, reason) => {
          if (payload.view !== 'quality') return;
          const ok = await policyCommand.run({ proposedFloor: values.proposedFloor, expectedVersion: payload.policyVersion, reason, typedConfirmation: values.typedConfirmation }, 'Capture-policy floor tightened.');
          if (ok) { setPolicyOpen(false); setSuccess('Capture-policy floor tightened for future fixture bindings. Existing fixtures were unchanged.'); setRefresh((value) => value + 1); }
        }}
      />
    </section>
  );
}

function LiveView({ payload, onTakeover }: { payload: Extract<Payload, { view: 'live' }>; onTakeover: (card: LiveCard) => void }) {
  const withConditions = payload.cards.filter((card) => card.measuredConditions.length || card.exceptions.some((item) => item.blocking)).length;
  return <>
    <PlatformAdminHeader eyebrow="Integrity · Live" title="Live operations" description="Stored clock anchors, attributed assignments, session generations, reports, and exceptions. Freshness names its source; no card invents an online presence state." />
    <PlatformStatGrid items={[{ label: 'Live matches', value: payload.cards.length }, { label: 'Measured conditions', value: withConditions, tone: withConditions ? 'warn' : 'good' }, { label: 'Takeovers present', value: payload.cards.filter((card) => card.currentGeneration > 1).length }, { label: 'Blocking exceptions', value: payload.cards.reduce((sum, card) => sum + card.exceptions.filter((item) => item.blocking).length, 0), tone: payload.cards.some((card) => card.exceptions.some((item) => item.blocking)) ? 'bad' : 'good' }]} />
    {payload.cards.length ? <div className="grid gap-4 xl:grid-cols-2">{payload.cards.map((card) => <Card key={card.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><Link href={`/admin/integrity/matches/${encodeURIComponent(card.id)}`} className="font-semibold text-text-strong hover:text-brand">{card.label}</Link><p className="mt-1 text-xs text-muted">{card.leagueId} · {card.scheduledAt ? new Date(card.scheduledAt).toLocaleString() : 'Schedule not recorded'}</p></div><StatusChip label={card.clockState} tone={card.clockState === 'running' ? 'good' : 'warn'} /></div><dl className="mt-4 grid gap-3 sm:grid-cols-2"><Fact icon={Clock} label="Clock anchor" value={`${card.period} · ${card.clockState}`} /><Fact icon={Gauge} label="Session generation" value={String(card.currentGeneration)} /><Fact icon={UserCircle} label="Attributed operator" value={`${card.operatorLabel} · ${card.assignmentStatus}`} /><Fact icon={Activity} label="Last observation" value={card.lastObservedAt ? `${new Date(card.lastObservedAt).toLocaleString()} · ${card.freshnessSource}` : `Not recorded · ${card.freshnessSource}`} /></dl>{card.measuredConditions.length ? <ul className="mt-4 space-y-1 rounded-[var(--radius-md)] bg-[var(--state-warning-bg)] p-3 text-xs leading-5 text-[var(--state-warning)]">{card.measuredConditions.map((condition) => <li key={condition}>{condition}</li>)}</ul> : null}<div className="mt-4"><PlatformCommandButton commandId="integrity.match.force_takeover" label="Start fenced takeover" onClick={() => onTakeover(card)} disabledReason={card.clockState === 'full_time' ? 'This match is already full time; use post-match governance.' : undefined} /></div></Card>)}</div> : <EmptyState title="No matches in progress">No match currently has the stored <code>live</code> lifecycle state.</EmptyState>}
  </>;
}

function EscalationView({ payload, onRatify }: { payload: Extract<Payload, { view: 'escalations' }>; onRatify: (item: Escalation) => void }) {
  return <>
    <PlatformAdminHeader eyebrow="Integrity · Escalations" title="Escalation liveness" description="Stored deadlines take precedence. Cases without one use the governed seven-day liveness deadline and say so explicitly." />
    <PlatformStatGrid items={[{ label: 'Open escalations', value: payload.total }, { label: 'Overdue', value: payload.items.filter((item) => item.overdue).length, tone: payload.items.some((item) => item.overdue) ? 'bad' : 'good' }, { label: 'Blocking', value: payload.items.filter((item) => item.blocking).length, tone: payload.items.some((item) => item.blocking) ? 'bad' : 'good' }, { label: 'With proposal', value: payload.items.filter((item) => item.hasProposal).length }]} />
    <div className="space-y-3">{payload.items.length ? payload.items.map((item) => <Card key={item.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><Link href={`/admin/integrity/matches/${encodeURIComponent(item.matchId)}?tab=exceptions`} className="font-semibold text-text-strong hover:text-brand">{item.code.replaceAll('_', ' ')}</Link><p className="mt-1 text-xs text-muted">{item.matchId} · {item.leagueId}</p></div><div className="flex gap-2"><StatusChip label={item.status} /><StatusChip label={item.overdue ? 'overdue' : 'within deadline'} tone={item.overdue ? 'bad' : 'good'} /></div></div><p className="mt-3 text-xs text-muted">Due {new Date(item.deadlineAt).toLocaleString()} · {item.deadlineSource === 'stored' ? 'stored escalation deadline' : 'seven-day liveness rule'}</p><div className="mt-3"><PlatformCommandButton commandId="integrity.exception.ratify" label="Ratify proposal" onClick={() => onRatify(item)} disabledReason={!item.hasProposal ? 'No proposed resolution exists. Record a proposal before ratification.' : undefined} /></div></Card>) : <EmptyState title="No open escalations">No operational exception is waiting on the liveness queue.</EmptyState>}</div>
  </>;
}

function QualityView({ payload, onPolicy }: { payload: Extract<Payload, { view: 'quality' }>; onPolicy: () => void }) {
  const distribution = payload.distribution;
  return <>
    <PlatformAdminHeader eyebrow="Integrity · Quality" title="Computed data quality" description="Every tier below is read from the immutable finalization ledger. There is no control that sets a match quality tier." />
    <PlatformStatGrid items={[{ label: 'Gold', value: distribution.gold, tone: 'good' }, { label: 'Silver', value: distribution.silver }, { label: 'Bronze', value: distribution.bronze, tone: distribution.bronze ? 'warn' : 'default' }, { label: 'Legacy / ungraded', value: distribution.legacy + distribution.ungraded }]} />
    <div className="grid gap-4 lg:grid-cols-2"><Card className="p-4"><div className="flex items-center gap-2"><Gauge className="h-5 w-5 text-brand" /><h2 className="text-sm font-semibold text-text-strong">Distribution provenance</h2></div><p className="mt-2 text-sm leading-6 text-muted">{distribution.total} immutable finalization record(s). Source: <code>{payload.provenance}</code>.</p><p className="mt-2 text-xs leading-5 text-subtle">Gold {distribution.gold} · Silver {distribution.silver} · Bronze {distribution.bronze} · Legacy {distribution.legacy} · Ungraded {distribution.ungraded}</p></Card><Card className="p-4"><div className="flex items-center gap-2"><ShieldWarning className="h-5 w-5 text-[var(--state-warning)]" /><h2 className="text-sm font-semibold text-text-strong">Capture-policy floor</h2></div><p className="mt-2 text-2xl font-semibold text-text-strong">{payload.policyFloor.replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-muted">Settings version {payload.policyVersion}. Existing fixture bindings remain frozen.</p><div className="mt-4"><PlatformCommandButton commandId="integrity.capture_policy_floor.set" onClick={onPolicy} disabledReason={payload.policyFloor === 'FIELD_REQUIRED' ? 'The strictest supported floor is already active.' : undefined} /></div></Card></div>
  </>;
}

function Fact({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return <div className="rounded-[var(--radius-md)] bg-surface-2 p-3"><dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-subtle"><Icon className="h-3.5 w-3.5" /> {label}</dt><dd className="mt-1 break-words text-xs leading-5 text-text">{value}</dd></div>;
}
