'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Clock, UserCircle, Warning } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { openReports, pendingApprovals } from '@/lib/platform/platformContext';
import { applicationEvidence, leagueVerificationEvidence, trustEvidence } from '@/lib/platform/caseEvidence';
import { orderPlatformCases, type PlatformCase, type PlatformCaseAction, type PlatformCaseKind } from '@/lib/platform/platformCases';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, PlatformAdminHeader, PlatformStatGrid, StatusChip } from '@/components/platform/PlatformAdminPrimitives';
import { PlatformCommandButton } from '@/components/platform/commands/PlatformCommandButton';
import { ConsequenceSheet } from '@/components/platform/commands/ConsequenceSheet';
import { usePlatformCommand, useRegistryCommand } from '@/components/platform/commands/usePlatformCommand';
import { WorkspaceTabs } from '@/components/platform/WorkspaceTabs';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'all', label: 'All', href: '/admin?tab=all' },
  { id: 'mine', label: 'Mine', href: '/admin?tab=mine' },
  { id: 'applications', label: 'Applications', href: '/admin?tab=applications' },
  { id: 'integrity', label: 'Integrity', href: '/admin?tab=integrity' },
  { id: 'trust', label: 'Trust', href: '/admin?tab=trust' },
  { id: 'money', label: 'Money', href: '/admin?tab=money' },
  { id: 'history', label: 'History', href: '/admin?tab=history' },
];

type DeskPayload = {
  generatedAt: string;
  total: number;
  counts: Record<string, number>;
  items: PlatformCase[];
  nextCursor: string | null;
};

function demoCase(input: Pick<PlatformCase, 'id' | 'kind' | 'title' | 'summary' | 'status' | 'consequence' | 'href' | 'sourceCollection' | 'sourceId'> & Partial<PlatformCase>): PlatformCase {
  return {
    createdAt: new Date().toISOString(),
    deadlineAt: null,
    waitingOn: 'Platform operator',
    assignedToUserId: null,
    actions: [],
    ...input,
  };
}

/**
 * Evidence for an approval case, from whichever record actually backs it.
 *
 * A real application record is the best source. Where there is none, the case is a league
 * asking for verification, so the league's own counts are the facts that decide it.
 */
function deskEvidence(
  kind: string,
  application: unknown,
  data: ReturnType<typeof useGoalPlaceData>,
  approvalId: string,
) {
  if (application) {
    const evidence = applicationEvidence(application as Record<string, unknown>);
    return evidence ? { evidence } : {};
  }
  if (kind === 'athlete') return {};
  const league = data.leagues.find((entry) => entry.id === approvalId);
  if (!league) return {};
  const evidence = leagueVerificationEvidence({
    sport: league.sport,
    city: league.city,
    status: league.status,
    teamCount: data.teams.filter((team) => team.leagueId === league.id).length,
    athleteCount: data.athletes.filter((athlete) => athlete.leagueId === league.id).length,
  });
  return evidence ? { evidence } : {};
}

function demoDesk(data: ReturnType<typeof useGoalPlaceData>, filter: string, actorUserId: string): DeskPayload {
  const items: PlatformCase[] = [];
  for (const approval of pendingApprovals(data.leagues, data.athletes)) {
    const application = data.leagueAdminApplications.find((item) => item.id === approval.id);
    const kind: PlatformCaseKind = approval.kind === 'athlete' ? 'athlete_verification' : 'application';
    items.push(demoCase({
      id: `${kind}:${approval.id}`,
      kind,
      title: approval.title,
      summary: approval.subtitle,
      status: application?.status ?? 'pending',
      consequence: 'normal',
      createdAt: application?.createdAt ?? new Date().toISOString(),
      waitingOn: 'Platform reviewer',
      ...deskEvidence(approval.kind, application, data, approval.id),
      href: kind === 'application' ? `/admin/network/applications/${approval.id}` : `/admin/network/athletes/${approval.id}`,
      actions: kind === 'application' ? [
        { commandId: 'application.approve_and_invite', label: 'Approve and invite' },
        { commandId: 'application.review', label: 'Request information' },
      ] : [],
      sourceCollection: kind === 'application' ? 'leagueAdminApplications' : 'athletes',
      sourceId: approval.id,
    }));
  }
  for (const report of openReports(data.reports)) {
    items.push(demoCase({
      id: `trust:${report.id}`,
      kind: 'trust',
      title: report.summary,
      summary: report.affectedEntity ?? report.reportedEntity ?? 'Trust report',
      status: report.status,
      consequence: report.severity === 'Critical' ? 'critical' : report.severity === 'High' ? 'high' : 'normal',
      createdAt: report.createdAt,
      waitingOn: 'Trust reviewer',
      // The demo path builds its own cases, so it has to attach evidence itself or the
      // console demonstrates a Desk that cannot show why anything is on it.
      ...(trustEvidence(report as unknown as Record<string, unknown>)
        ? { evidence: trustEvidence(report as unknown as Record<string, unknown>) }
        : {}),
      href: `/admin/integrity/trust/${report.id}`,
      actions: [{ commandId: 'trust.report.resolve', label: 'Resolve' }],
      sourceCollection: 'reports',
      sourceId: report.id,
    }));
  }
  for (const finalization of data.finalizations.filter((item) => item.status === 'failed')) {
    items.push(demoCase({
      id: `job:${finalization.id}`,
      kind: 'failed_job',
      title: `Failed finalization · ${finalization.matchId}`,
      summary: 'An idempotent finalization job needs investigation.',
      status: 'failed',
      consequence: 'critical',
      createdAt: finalization.appliedAt,
      waitingOn: 'Platform reliability',
      href: `/admin/integrity/matches/${finalization.matchId}?tab=provenance`,
      sourceCollection: 'finalizations',
      sourceId: finalization.id,
    }));
  }
  const ordered = orderPlatformCases(items).filter((item) => {
    if (filter === 'mine') return item.assignedToUserId === actorUserId;
    if (filter === 'applications') return item.kind === 'application' || item.kind === 'athlete_verification';
    if (filter === 'integrity') return item.kind === 'operational_exception' || item.kind === 'reconciliation_exception' || item.kind === 'failed_job';
    if (filter === 'trust') return item.kind === 'trust';
    if (filter === 'money') return item.kind === 'payee' || item.kind === 'held_settlement';
    if (filter === 'history') return false;
    return true;
  });
  const counts = items.reduce<Record<string, number>>((result, item) => {
    result[item.kind] = (result[item.kind] ?? 0) + 1;
    return result;
  }, {});
  return { generatedAt: new Date().toISOString(), total: ordered.length, counts, items: ordered, nextCursor: null };
}

/** Whole days between a stored timestamp and the payload's own generation time. */
function ageInDays(createdAt: string, now: string) {
  const opened = Date.parse(createdAt);
  const reference = Date.parse(now);
  if (!Number.isFinite(opened) || !Number.isFinite(reference)) return 0;
  return Math.max(0, Math.floor((reference - opened) / 86_400_000));
}

function oldestCaseAge(data: DeskPayload | null) {
  if (!data?.items.length) return null;
  return Math.max(...data.items.map((item) => ageInDays(item.createdAt, data.generatedAt)));
}

function oldestAgeLabel(data: DeskPayload | null) {
  const days = oldestCaseAge(data);
  if (days === null) return '—';
  return days === 0 ? 'today' : `${days}d`;
}

/**
 * States the queue rather than describing how it was sorted.
 *
 * "Cases are ordered by consequence, stored escalation deadline, then age" told the operator
 * about the algorithm. What they need on arrival is how much is waiting and how bad the
 * worst of it has got.
 */
function deskSummary(data: DeskPayload | null) {
  if (!data) return 'Loading the queue.';
  if (!data.total) return 'Nothing is waiting. Cleared work moves to History.';
  const days = oldestCaseAge(data);
  const decisions = `${data.total} ${data.total === 1 ? 'decision' : 'decisions'} waiting.`;
  if (days === null || days === 0) return `${decisions} All opened today.`;
  return `${decisions} Oldest has been open ${days} ${days === 1 ? 'day' : 'days'}.`;
}

/**
 * Path segments a registry endpoint may address by URL.
 *
 * Derived from the case rather than hardcoded per action, so a case type that gains a
 * match- or exception-scoped command does not also have to remember to carry its own id.
 */
function pathParamsFor(item: PlatformCase): Record<string, string> {
  return {
    ...(item.matchId ? { matchId: item.matchId } : {}),
    ...(item.kind === 'operational_exception' || item.kind === 'reconciliation_exception'
      ? { exceptionId: item.sourceId }
      : {}),
    ...(item.kind === 'application' ? { applicationId: item.sourceId } : {}),
  };
}

export function PlatformDesk({ initialFilter = 'all' }: { initialFilter?: string }) {
  const router = useRouter();
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const demoData = useGoalPlaceData({
    collections: isDemoMode ? ['leagues', 'teams', 'athletes', 'leagueAdminApplications', 'reports', 'finalizations'] : [],
    recordLimit: 500,
  });
  const [payload, setPayload] = useState<DeskPayload | null>(null);
  const [loading, setLoading] = useState(!isDemoMode);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deferCase, setDeferCase] = useState<PlatformCase | null>(null);
  const [activeAction, setActiveAction] = useState<{ item: PlatformCase; action: PlatformCaseAction } | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const actorUserId = currentUser?.uid ?? userProfile?.uid ?? '';
  const deferCommand = usePlatformCommand('/api/platform/desk/defer');
  const caseCommand = useRegistryCommand();
  const assignCommand = useRegistryCommand();

  const demoPayload = useMemo(
    () => demoDesk(demoData, initialFilter, actorUserId),
    [actorUserId, demoData, initialFilter],
  );

  useEffect(() => {
    if (isDemoMode) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = await currentUser?.getIdToken();
        if (!token) throw new Error('Sign in again to load the Platform Desk.');
        const response = await fetch(`/api/platform/desk?filter=${encodeURIComponent(initialFilter)}&limit=30`, {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? 'The Platform Desk is unavailable.');
        if (!cancelled) setPayload(body);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'The Platform Desk is unavailable.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [currentUser, initialFilter, isDemoMode]);

  const data = isDemoMode ? demoPayload : payload;
  const items = data?.items ?? [];
  const activeIndex = Math.min(selectedIndex, Math.max(0, items.length - 1));

  async function loadMore() {
    if (!data?.nextCursor || !currentUser) return;
    setLoadingMore(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`/api/platform/desk?filter=${encodeURIComponent(initialFilter)}&limit=30&cursor=${encodeURIComponent(data.nextCursor)}`, {
        headers: { authorization: `Bearer ${token}` }, cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'More cases could not be loaded.');
      setPayload((current) => current ? { ...body, items: [...current.items, ...body.items] } : body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'More cases could not be loaded.');
    } finally {
      setLoadingMore(false);
    }
  }

  function openCase(item: PlatformCase) {
    router.push(item.href);
  }

  /**
   * Runs a case decision without leaving the queue.
   *
   * A Desk action used to push the operator to the entity page with `?command=`, which meant
   * every routine approval cost a page load and lost their place in the queue. The
   * consequence sheet already knows how to preview, collect a reason and confirm; the only
   * thing missing was letting it run against the case in front of you.
   */
  function startAction(item: PlatformCase, actionIndex: number) {
    const action = item.actions[actionIndex];
    if (!action || action.disabledReason) return;
    setActiveAction({ item, action });
  }

  /**
   * Claims or releases a case in place.
   *
   * The card updates from the server's answer rather than optimistically, because a claim is
   * contended: if another operator took it first, the operator needs to see that, not a
   * button that looked like it worked.
   */
  async function assignCase(item: PlatformCase, action: 'claim' | 'release') {
    const ok = await assignCommand.run('desk.case.assign', {
      caseId: item.id,
      sourceCollection: item.sourceCollection,
      sourceId: item.sourceId,
      action,
    }, action === 'claim' ? 'Case claimed.' : 'Case released.');
    if (!ok) return;
    setPayload((current) => current
      ? {
        ...current,
        items: current.items.map((entry) => entry.id === item.id
          ? { ...entry, assignedToUserId: action === 'claim' ? actorUserId : null }
          : entry),
      }
      : current);
  }

  function removeCase(caseId: string) {
    setPayload((current) => current
      ? { ...current, total: Math.max(0, current.total - 1), items: current.items.filter((entry) => entry.id !== caseId) }
      : current);
  }

  return (
    <section
      ref={sectionRef}
      tabIndex={0}
      aria-label="Platform Desk"
      className="space-y-5 outline-none"
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
        if (event.key.toLowerCase() === 'j') { event.preventDefault(); setSelectedIndex((index) => Math.min(items.length - 1, index + 1)); }
        else if (event.key.toLowerCase() === 'k') { event.preventDefault(); setSelectedIndex((index) => Math.max(0, index - 1)); }
        else if (event.key === 'Enter' && items[activeIndex]) { event.preventDefault(); openCase(items[activeIndex]); }
        else if (/^[1-4]$/.test(event.key) && items[activeIndex]) { event.preventDefault(); startAction(items[activeIndex], Number(event.key) - 1); }
        else if (event.key.toLowerCase() === 'd' && items[activeIndex] && initialFilter !== 'history') { event.preventDefault(); setDeferCase(items[activeIndex]); }
        else if (event.key.toLowerCase() === 'c' && items[activeIndex] && initialFilter !== 'history') {
          event.preventDefault();
          const item = items[activeIndex];
          void assignCase(item, item.assignedToUserId === actorUserId ? 'release' : 'claim');
        }
      }}
    >
      <WorkspaceTabs label="Desk filters" tabs={TABS} active={initialFilter} />
      <PlatformAdminHeader
        eyebrow="Desk"
        title={initialFilter === 'history' ? 'Decision history' : 'What needs a decision'}
        description={initialFilter === 'history'
          ? 'Every resolved decision, with the audit record it wrote.'
          : deskSummary(data)}
      />
      {/*
        The keyboard contract is printed where it can be used. On a phone it was four lines
        of viewport describing shortcuts no touch operator can press, pushing the first
        actual decision below the fold.
      */}
      <p className="hidden text-sm text-subtle md:block">
        J and K move, Enter opens, 1–4 run the visible actions, C claims, D defers with a reason.
        Ordered by consequence, then stored escalation deadline, then age.
      </p>

      {loading || (isDemoMode && demoData.loading) ? <DeskSkeleton /> : null}
      {error ? <Card className="border-[color-mix(in_srgb,var(--state-error),transparent_45%)] p-4 text-sm text-[var(--state-error)]">{error}</Card> : null}

      {!loading && data ? (
        <>
          {/*
            Counts of what needs deciding, plus how long the worst case has waited. The
            previous "visible cases" tile reported the size of the list, which is a fact
            about the query rather than a signal to act on.
          */}
          <PlatformStatGrid items={[
            { label: 'Escalated', value: (data.counts.operational_exception ?? 0) + (data.counts.reconciliation_exception ?? 0), tone: (data.counts.operational_exception ?? 0) ? 'warn' : 'default' },
            { label: 'Applications', value: (data.counts.application ?? 0) + (data.counts.athlete_verification ?? 0) },
            { label: 'Trust', value: data.counts.trust ?? 0 },
            { label: 'Money', value: (data.counts.payee ?? 0) + (data.counts.held_settlement ?? 0) },
            { label: 'Failed jobs', value: data.counts.failed_job ?? 0, tone: (data.counts.failed_job ?? 0) ? 'bad' : 'default' },
            { label: 'Oldest', value: oldestAgeLabel(data), tone: 'warn' },
          ]} />

          {items.length ? (
            <div className="space-y-2.5">
              {items.map((item, index) => (
                <DeskCaseCard
                  key={item.id}
                  item={item}
                  now={data.generatedAt}
                  selected={index === activeIndex}
                  mine={Boolean(actorUserId) && item.assignedToUserId === actorUserId}
                  onOpen={() => openCase(item)}
                  onAction={(actionIndex) => startAction(item, actionIndex)}
                  onDefer={initialFilter === 'history' ? undefined : () => setDeferCase(item)}
                  onAssign={initialFilter === 'history' ? undefined : (action) => void assignCase(item, action)}
                />
              ))}
              {data.nextCursor ? (
                <div className="pt-2 text-center">
                  <PlatformCommandButton commandId="integrity.case.transition" label={loadingMore ? 'Loading…' : 'Load more cases'} disabled={loadingMore} onClick={() => void loadMore()} />
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState title={initialFilter === 'history' ? 'No resolved cases yet' : 'Desk clear'}>
              {initialFilter === 'history'
                ? 'Resolved decisions appear here with their immutable audit trail.'
                : 'No cases are waiting in this view. The platform has no hidden newest-first backlog.'}
            </EmptyState>
          )}
        </>
      ) : null}
      <ConsequenceSheet
        open={Boolean(activeAction)}
        commandId={activeAction?.action.commandId ?? 'desk.case.defer'}
        targetId={activeAction?.item.sourceId}
        inputs={activeAction ? {
          sourceCollection: activeAction.item.sourceCollection,
          sourceId: activeAction.item.sourceId,
          ...(activeAction.item.leagueId ? { leagueId: activeAction.item.leagueId } : {}),
          ...(activeAction.item.matchId ? { matchId: activeAction.item.matchId } : {}),
          ...(activeAction.action.inputs ?? {}),
        } : {}}
        title={activeAction ? `${activeAction.action.label} · ${activeAction.item.title}` : undefined}
        submitLabel={activeAction?.action.label}
        fields={activeAction?.action.fields}
        running={caseCommand.running}
        error={caseCommand.error}
        onClose={() => { setActiveAction(null); caseCommand.reset(); }}
        onSubmit={async (values, reason) => {
          if (!activeAction) return;
          const { item, action } = activeAction;
          const ok = await caseCommand.run(
            action.commandId,
            {
              ...(action.inputs ?? {}),
              ...values,
              reason,
              ...(item.leagueId ? { leagueId: item.leagueId } : {}),
              ...(item.matchId ? { matchId: item.matchId } : {}),
            },
            action.successMessage ?? `${action.label} completed.`,
            { ...(action.pathParams ?? {}), ...pathParamsFor(item) },
          );
          if (ok) {
            // Cleared work leaves the Desk immediately; the record lives in History.
            removeCase(item.id);
            setActiveAction(null);
          }
        }}
      />
      <ConsequenceSheet
        open={Boolean(deferCase)}
        commandId="desk.case.defer"
        targetId={deferCase?.id}
        inputs={deferCase ? { caseId: deferCase.id, sourceCollection: deferCase.sourceCollection, sourceId: deferCase.sourceId } : {}}
        title={deferCase ? `Defer ${deferCase.title}` : 'Defer case'}
        submitLabel="Defer case"
        fields={[{
          name: 'hours', label: 'Return to Desk', kind: 'select', required: true, defaultValue: '24',
          options: [
            { value: '1', label: 'In 1 hour' },
            { value: '24', label: 'Tomorrow' },
            { value: '72', label: 'In 3 days' },
            { value: '168', label: 'In 7 days' },
          ],
        }]}
        running={deferCommand.running}
        error={deferCommand.error}
        onClose={() => { setDeferCase(null); deferCommand.reset(); }}
        onSubmit={async (values, reason) => {
          if (!deferCase) return;
          const ok = await deferCommand.run({
            caseId: deferCase.id,
            sourceCollection: deferCase.sourceCollection,
            sourceId: deferCase.sourceId,
            hours: Number(values.hours),
            reason,
          }, 'Case deferred.');
          if (ok) {
            setPayload((current) => current ? { ...current, total: Math.max(0, current.total - 1), items: current.items.filter((item) => item.id !== deferCase.id) } : current);
            setDeferCase(null);
          }
        }}
      />
    </section>
  );
}

function DeskCaseCard({ item, now, selected, mine, onOpen, onAction, onDefer, onAssign }: {
  item: PlatformCase;
  now: string;
  selected: boolean;
  /** True when the signed-in operator holds this case. */
  mine: boolean;
  onOpen: () => void;
  onAction: (index: number) => void;
  onDefer?: () => void;
  onAssign?: (action: 'claim' | 'release') => void;
}) {
  const overdue = Boolean(item.deadlineAt && Date.parse(item.deadlineAt) <= Date.parse(now));
  return (
    <article className={cn(
      'rounded-[var(--radius-lg)] border bg-surface-1 p-4 transition',
      selected ? 'border-brand/55 shadow-[var(--glow-brand)]' : 'border-border hover:border-border-strong',
    )}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip label={item.consequence} tone={item.consequence === 'critical' ? 'bad' : item.consequence === 'high' ? 'warn' : 'neutral'} />
            <span className="text-xs font-medium text-muted">{item.kind.replaceAll('_', ' ')}</span>
            <span className="text-xs text-subtle">{item.status.replaceAll('_', ' ')}</span>
          </div>
          <button type="button" onClick={onOpen} className="mt-2 block text-left text-base font-semibold text-text-strong transition hover:text-brand">
            {item.title}
          </button>
          {/*
            Some sources use the same sentence for the case title and its evidence headline.
            Printing it twice reads as a rendering bug and costs a line of a card whose whole
            job is density.
          */}
          {(() => {
            const lead = item.evidence?.headline ?? item.summary;
            return lead.trim() === item.title.trim()
              ? null
              : <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{lead}</p>;
          })()}
          {item.evidence ? <CaseEvidence evidence={item.evidence} /> : null}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
            <span className="inline-flex items-center gap-1.5"><UserCircle className="h-4 w-4" /> Waiting on {item.waitingOn}</span>
            {item.assignedToUserId ? (
              <span className={cn('inline-flex items-center gap-1.5', mine && 'text-brand')}>
                <UserCircle className="h-4 w-4" weight="fill" />
                {mine ? 'You have this' : 'Claimed by another operator'}
              </span>
            ) : null}
            <span className={cn('inline-flex items-center gap-1.5', overdue && 'text-[var(--state-error)]')}>
              <Clock className="h-4 w-4" /> {item.deadlineAt ? `${overdue ? 'Overdue' : 'Due'} ${new Date(item.deadlineAt).toLocaleString()}` : `Opened ${new Date(item.createdAt).toLocaleDateString()}`}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2 lg:max-w-80 lg:justify-end">
          {item.actions.slice(0, 4).map((action, index) => (
            <PlatformCommandButton
              key={`${action.commandId}-${action.label}`}
              commandId={action.commandId}
              label={action.label}
              shortcut={String(index + 1)}
              size="sm"
              disabledReason={action.disabledReason}
              onClick={() => onAction(index)}
            />
          ))}
          {onAssign ? (
            <PlatformCommandButton
              commandId="desk.case.assign"
              label={mine ? 'Release' : item.assignedToUserId ? 'Take over' : 'Claim'}
              shortcut="C"
              size="sm"
              onClick={() => onAssign(mine ? 'release' : 'claim')}
            />
          ) : null}
          {onDefer ? <PlatformCommandButton commandId="desk.case.defer" label="Defer" shortcut="D" size="sm" onClick={onDefer} /> : null}
          <Link href={item.href} className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-semibold text-brand hover:underline">
            Open <ArrowRight className="h-4 w-4" weight="bold" />
          </Link>
        </div>
      </div>
    </article>
  );
}

/**
 * The facts that decide the case, on the card the operator is already reading.
 *
 * Every value here is a stored measurement. Nothing is computed for display, so a number that
 * looks wrong on this card is a number that is wrong in the record.
 */
function CaseEvidence({ evidence }: { evidence: NonNullable<PlatformCase['evidence']> }) {
  return (
    <div className="mt-3 space-y-2">
      {evidence.facts.length ? (
        <dl className="flex flex-wrap gap-x-5 gap-y-1.5">
          {evidence.facts.map((fact, index) => (
            <div key={`${fact.label}-${index}`} className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wide text-subtle">{fact.label}</dt>
              <dd className={cn(
                'text-sm font-semibold tabular-nums',
                fact.tone === 'bad' && 'text-[var(--state-error)]',
                fact.tone === 'warn' && 'text-[var(--state-pending)]',
                fact.tone === 'good' && 'text-brand',
                (!fact.tone || fact.tone === 'neutral') && 'text-text-strong',
              )}>
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {evidence.proposal ? (
        <p className="text-sm text-text">
          <span className="font-semibold text-text-strong">{evidence.proposal.by} proposed:</span>{' '}
          {evidence.proposal.resolution}
        </p>
      ) : null}
      {evidence.conflict ? (
        <p className="flex items-start gap-1.5 text-sm text-[var(--state-pending)]">
          <Warning className="mt-0.5 h-4 w-4 shrink-0" weight="fill" />
          <span>{evidence.conflict}</span>
        </p>
      ) : null}
    </div>
  );
}

function DeskSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-hidden">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 min-w-44 flex-1" />)}</div>
      {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-44 w-full rounded-[var(--radius-lg)]" />)}
    </div>
  );
}
