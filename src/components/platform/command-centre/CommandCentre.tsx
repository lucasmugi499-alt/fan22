'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ClipboardText,
  Database,
  ClockCounterClockwise,
  Pulse,
  ShieldWarning,
} from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { pendingApprovals, openReports, disputedMatches } from '@/lib/platform/platformContext';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

type CommandCentrePayload = {
  generatedAt: string;
  environment: string;
  projectId: string;
  databaseId: string;
  statusStrip: Array<{ label: string; value: string | number; tone: 'good' | 'warning' | 'critical' | 'muted'; note?: string }>;
  workQueue: Array<{
    id: string;
    type: string;
    title: string;
    organization: string;
    priority: 'critical' | 'warning' | 'normal';
    stage: string;
    nextAction: string;
    href: string;
    createdAt?: string;
  }>;
  networkHealth: Array<{ label: string; value: string | number }>;
  recentActivity: Array<{
    id: string;
    action: string;
    actorUserId: string;
    target: string;
    note?: string;
    createdAt?: string;
  }>;
  quickCommands: Array<{ label: string; href: string; count: number }>;
};

const toneClass = {
  good: 'border-brand/35 bg-brand-subtle/35 text-brand',
  warning: 'border-[color-mix(in_srgb,var(--state-pending),transparent_45%)] bg-[color-mix(in_srgb,var(--state-pending),transparent_88%)] text-[var(--state-pending)]',
  critical: 'border-[color-mix(in_srgb,var(--state-error),transparent_40%)] bg-[color-mix(in_srgb,var(--state-error),transparent_88%)] text-[var(--state-error)]',
  muted: 'border-border bg-surface-2 text-muted',
};

function dateLabel(value?: string) {
  if (!value) return 'No timestamp';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function buildDemoPayload(data: ReturnType<typeof useGoalPlaceData>): CommandCentrePayload {
  const approvals = pendingApprovals(data.leagues, data.athletes);
  const reports = openReports(data.reports);
  const disputes = disputedMatches(data.matches);
  const failedFinalizations = data.finalizations.filter((item) => item.status === 'failed').length;
  const suspendedLeagues = data.leagues.filter((item) => item.status === 'suspended').length;
  const suspendedTeams = data.teams.filter((item) => item.verificationStatus === 'rejected').length;
  const suspendedAccounts = data.users.filter((item) => ['suspended', 'disabled', 'deletion_pending'].includes(item.accountStatus ?? '')).length;
  const officialMatches = data.matches.filter((item) => item.verificationStatus === 'verified' || item.status === 'completed').length;

  return {
    generatedAt: new Date().toISOString(),
    environment: 'demo',
    projectId: 'mock',
    databaseId: 'local',
    statusStrip: [
      { label: 'System status', value: failedFinalizations ? 'Attention' : 'Operational', tone: failedFinalizations ? 'warning' : 'good' },
      { label: 'Failed finalizations', value: failedFinalizations, tone: failedFinalizations ? 'critical' : 'good' },
      { label: 'Security incidents', value: reports.filter((item) => item.severity === 'Critical').length, tone: reports.some((item) => item.severity === 'Critical') ? 'critical' : 'good' },
      { label: 'Payment exceptions', value: 0, tone: 'muted', note: 'Real payment authority disabled' },
      { label: 'Suspended orgs', value: suspendedLeagues + suspendedTeams, tone: suspendedLeagues + suspendedTeams ? 'warning' : 'good' },
    ],
    workQueue: [
      ...approvals.slice(0, 4).map((item) => ({
        id: `${item.kind}-${item.id}`,
        type: item.kind === 'league' ? 'League approval' : 'Athlete verification',
        title: item.title,
        organization: item.subtitle,
        priority: 'normal' as const,
        stage: 'pending',
        nextAction: 'Review evidence and decide',
        href: '/admin/applications',
      })),
      ...disputes.slice(0, 4).map((item) => ({
        id: item.id,
        type: 'Result dispute',
        title: `${item.homeTeamId} vs ${item.awayTeamId}`,
        organization: item.venue,
        priority: 'critical' as const,
        stage: 'disputed',
        nextAction: 'Inspect submissions and evidence',
        href: '/admin/competition',
      })),
      ...reports.slice(0, 4).map((item) => ({
        id: item.id,
        type: item.type.replace(/_/g, ' '),
        title: item.summary,
        organization: item.affectedEntity ?? item.reportedEntity ?? 'Platform',
        priority: item.severity === 'Critical' || item.severity === 'High' ? 'critical' as const : 'warning' as const,
        stage: item.status,
        nextAction: 'Open investigation workspace',
        href: `/admin/trust/${item.id}`,
        createdAt: item.createdAt,
      })),
    ],
    networkHealth: [
      { label: 'Active leagues', value: data.leagues.length - suspendedLeagues },
      { label: 'Active teams', value: data.teams.length - suspendedTeams },
      { label: 'Registered athletes', value: data.athletes.length },
      { label: 'Official matches', value: officialMatches },
      { label: 'Verified-result rate', value: `${Math.round((officialMatches / Math.max(1, data.matches.length)) * 100)}%` },
      { label: 'Results disputed', value: disputes.length },
      { label: 'Data-completeness rate', value: `${Math.round((data.athletes.filter((item) => item.teamId).length / Math.max(1, data.athletes.length)) * 100)}%` },
      { label: 'Suspended accounts', value: suspendedAccounts },
    ],
    recentActivity: data.adminAuditEvents.slice(0, 8).map((item) => ({
      id: item.id,
      action: item.action,
      actorUserId: item.actorUserId,
      target: `${item.targetCollection}/${item.targetId}`,
      note: item.note,
      createdAt: item.createdAt,
    })),
    quickCommands: [
      { label: 'Review next application', href: '/admin/applications', count: approvals.length },
      { label: 'Create organization', href: '/admin/organizations', count: data.leagues.length },
      { label: 'Find person or organization', href: '/admin/people', count: data.users.length },
      { label: 'Open failed finalizations', href: '/admin/competition', count: failedFinalizations },
      { label: 'Open active incident', href: '/admin/trust', count: reports.length },
    ],
  };
}

export function CommandCentre() {
  const { currentUser, isDemoMode } = useAuth();
  const demoData = useGoalPlaceData({
    collections: isDemoMode
      ? ['leagues', 'teams', 'athletes', 'matches', 'reports', 'leagueAdminApplications', 'adminAuditEvents', 'finalizations', 'users']
      : [],
    recordLimit: 240,
  });
  const [payload, setPayload] = useState<CommandCentrePayload | null>(null);
  const [loading, setLoading] = useState(!isDemoMode);
  const [error, setError] = useState<string | null>(null);

  const demoPayload = useMemo(() => buildDemoPayload(demoData), [demoData]);

  useEffect(() => {
    let cancelled = false;
    if (isDemoMode) {
      return;
    }
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = await currentUser?.getIdToken();
        if (!token) throw new Error('Sign in again to load Platform Command Centre.');
        const response = await fetch('/api/platform/command-centre', {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const body = await response.json().catch(() => ({})) as CommandCentrePayload & { error?: string };
        if (!response.ok) throw new Error(body.error ?? 'Command Centre is unavailable.');
        if (!cancelled) setPayload(body);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Command Centre is unavailable.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [currentUser, isDemoMode]);

  const data = isDemoMode ? demoPayload : payload;
  const visibleError = isDemoMode ? null : error;

  if (!isDemoMode && loading) return <CommandCentreSkeleton />;

  if (visibleError || !data) {
    return (
      <section className="space-y-4">
        <PlatformHeader />
        <Card className="border-[color-mix(in_srgb,var(--state-error),transparent_55%)] p-5">
          <p className="text-sm font-semibold text-text-strong">Command Centre could not load.</p>
          <p className="mt-1 text-sm text-muted">{visibleError ?? 'No command-centre payload was returned.'}</p>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <PlatformHeader meta={`${data.environment} · ${data.projectId} · ${data.databaseId}`} />

      <div className="grid gap-2.5 md:grid-cols-5">
        {data.statusStrip.map((item) => (
          <Card key={item.label} className={cn('p-3.5', toneClass[item.tone])}>
            <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{item.label}</p>
            <p data-numeric className="mt-2 text-2xl font-bold tabular-nums text-text-strong">{item.value}</p>
            {item.note ? <p className="mt-1 text-xs text-muted">{item.note}</p> : null}
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">My work</p>
              <h2 className="mt-1 text-lg font-semibold text-text-strong">Priority queue</h2>
            </div>
            <Link href="/admin/work" className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
              Open all
              <ArrowRight className="h-4 w-4" weight="bold" />
            </Link>
          </div>
          <div className="space-y-2.5">
            {data.workQueue.length ? data.workQueue.map((item) => (
              <Link
                key={`${item.type}-${item.id}`}
                href={item.href}
                className="grid gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 transition hover:border-brand/40 hover:bg-surface-3 sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityChip priority={item.priority} />
                    <span className="text-xs font-medium text-muted">{item.type}</span>
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold text-text-strong">{item.title}</p>
                  <p className="mt-1 truncate text-xs text-muted">{item.organization} · {item.stage}</p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                  <span className="text-xs text-muted">{dateLabel(item.createdAt)}</span>
                  <span className="text-xs font-semibold text-brand">{item.nextAction}</span>
                </div>
              </Link>
            )) : (
              <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-5 text-sm text-muted">
                No urgent platform work is waiting.
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Pulse className="h-5 w-5 text-brand" weight="duotone" />
              <h2 className="text-[15px] font-semibold text-text-strong">Network health</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {data.networkHealth.map((item) => (
                <div key={item.label} className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
                  <p data-numeric className="text-xl font-bold tabular-nums text-text-strong">{item.value}</p>
                  <p className="mt-1 text-[11px] font-medium text-muted">{item.label}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <ClockCounterClockwise className="h-5 w-5 text-brand" weight="duotone" />
              <h2 className="text-[15px] font-semibold text-text-strong">Recent critical activity</h2>
            </div>
            <div className="space-y-2">
              {data.recentActivity.length ? data.recentActivity.map((event) => (
                <div key={event.id} className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
                  <p className="text-sm font-semibold text-text-strong">{event.action.replace(/_/g, ' ')}</p>
                  <p className="mt-1 truncate text-xs text-muted">{event.target} · {event.actorUserId}</p>
                  <p className="mt-1 text-xs text-subtle">{dateLabel(event.createdAt)}</p>
                </div>
              )) : (
                <p className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm text-muted">No audit events in the preview window.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <ClipboardText className="h-5 w-5 text-brand" weight="duotone" />
          <h2 className="text-[15px] font-semibold text-text-strong">Quick commands</h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {data.quickCommands.map((command) => (
            <Link
              key={command.label}
              href={command.href}
              className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 transition hover:border-brand/40 hover:bg-surface-3"
            >
              <p className="text-sm font-semibold text-text-strong">{command.label}</p>
              <p className="mt-2 text-xs text-muted">{command.count} record{command.count === 1 ? '' : 's'} in scope</p>
            </Link>
          ))}
        </div>
      </Card>
    </section>
  );
}

function PlatformHeader({ meta }: { meta?: string }) {
  return (
    <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">Platform operations</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-strong md:text-4xl">Command Centre</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          A controlled hub for applications, organizations, people, access, competition integrity, trust, sponsors, finance, system health and audit.
        </p>
      </div>
      {meta ? (
        <div className="flex flex-wrap gap-2 text-xs text-muted lg:justify-end">
          <span className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-2.5 py-1">
            <Database className="h-4 w-4" />
            {meta}
          </span>
        </div>
      ) : null}
    </header>
  );
}

function PriorityChip({ priority }: { priority: 'critical' | 'warning' | 'normal' }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2 py-0.5 text-[11px] font-semibold capitalize',
      priority === 'critical' && toneClass.critical,
      priority === 'warning' && toneClass.warning,
      priority === 'normal' && toneClass.muted,
    )}>
      <ShieldWarning className="h-3.5 w-3.5" weight="bold" />
      {priority}
    </span>
  );
}

function CommandCentreSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-24 w-full rounded-[var(--radius-lg)]" />
      <div className="grid gap-2.5 md:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-[var(--radius-lg)]" />)}</div>
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Skeleton className="h-[520px] rounded-[var(--radius-lg)]" />
        <Skeleton className="h-[520px] rounded-[var(--radius-lg)]" />
      </div>
    </div>
  );
}
