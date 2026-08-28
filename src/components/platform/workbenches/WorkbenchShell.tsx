'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, LockKey, ShieldCheck } from '@phosphor-icons/react';
import { ConsequenceSheet } from '@/components/platform/commands/ConsequenceSheet';
import { PlatformCommandButton } from '@/components/platform/commands/PlatformCommandButton';
import { usePlatformCommand } from '@/components/platform/commands/usePlatformCommand';
import { LifecycleCommandDialog, type LifecycleTarget } from '@/components/platform/network/LifecycleCommandDialog';
import { DirectoryRow, EmptyState, PlatformAdminHeader, PlatformStatGrid, StatusChip } from '@/components/platform/PlatformAdminPrimitives';
import { WorkspaceTabs } from '@/components/platform/WorkspaceTabs';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthProvider';
import { PLATFORM_WORKBENCHES, type PlatformWorkbenchKind } from '@/lib/platform/workbenches';
import type { PlatformWorkbenchView } from '@/server/platform/workbenches/platformWorkbench';

type Payload = {
  view: PlatformWorkbenchView;
  total: number;
  nextCursor: string | null;
};

type WorkbenchShellProps = {
  kind: PlatformWorkbenchKind;
  entityId: string;
  basePath: string;
  initialTab?: string;
  initialCommand?: string;
};

function statusTone(status: string): 'good' | 'warn' | 'bad' | 'neutral' {
  if (['active', 'verified', 'completed', 'official', 'immutable', 'accepted', 'issued'].includes(status)) return 'good';
  if (['suspended', 'rejected', 'revoked', 'disabled', 'failed', 'escalated'].includes(status)) return 'bad';
  if (['pending', 'open', 'draft', 'submitted', 'disputed', 'reviewing'].includes(status)) return 'warn';
  return 'neutral';
}

function demoView(kind: PlatformWorkbenchKind, entityId: string, tab: string): PlatformWorkbenchView {
  const definition = PLATFORM_WORKBENCHES[kind];
  return {
    kind,
    tab,
    entity: { id: entityId, title: entityId.replaceAll('_', ' '), subtitle: 'Demo workbench projection', status: 'demo' },
    metrics: [
      { label: 'Environment', value: 'Demo' },
      { label: 'Current view', value: 0 },
      { label: 'Sporting truth', value: 'Read only' },
      { label: 'Audit', value: 'Simulated' },
    ],
    records: [],
    emptyMessage: `No ${definition.tabs.find((item) => item.id === tab)?.label.toLowerCase() ?? 'records'} are included in this demo projection.`,
  };
}

export function WorkbenchShell({ kind, entityId, basePath, initialTab, initialCommand }: WorkbenchShellProps) {
  const definition = PLATFORM_WORKBENCHES[kind];
  const requestedTab = definition.tabs.some((item) => item.id === initialTab) ? initialTab! : definition.tabs[0].id;
  const { currentUser, isDemoMode } = useAuth();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [lifecycleTarget, setLifecycleTarget] = useState<LifecycleTarget | null>(() => {
    const action = initialCommand?.split('.').at(-1);
    if ((kind === 'league' || kind === 'team' || kind === 'athlete')
      && (action === 'activate' || action === 'suspend' || action === 'archive' || action === 'restore')) {
      return { kind, id: entityId, name: entityId, action };
    }
    return null;
  });
  const [accountOpen, setAccountOpen] = useState(initialCommand === 'account.lifecycle');
  const [takeoverOpen, setTakeoverOpen] = useState(initialCommand === 'integrity.match.force_takeover');
  const [success, setSuccess] = useState<string | null>(null);
  const accountCommand = usePlatformCommand('/api/admin/actions');
  const takeoverCommand = usePlatformCommand(`/api/matches/${encodeURIComponent(entityId)}/takeover`);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      await Promise.resolve();
      if (isDemoMode) {
        if (!cancelled) {
          setPayload({ view: demoView(kind, entityId, requestedTab), total: 0, nextCursor: null });
          setLoading(false);
        }
        return;
      }
      if (!currentUser || typeof currentUser.getIdToken !== 'function') {
        if (!cancelled) {
          setError('Sign in again to open this workbench.');
          setLoading(false);
        }
        return;
      }
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/platform/workbench/${kind}/${encodeURIComponent(entityId)}?tab=${encodeURIComponent(requestedTab)}&limit=30`, {
          headers: { authorization: `Bearer ${token}` },
        });
        const next = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(next.error ?? 'The workbench could not be loaded.');
        if (!cancelled) setPayload(next as Payload);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'The workbench could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [currentUser, entityId, isDemoMode, kind, refresh, requestedTab]);

  const tabs = useMemo(() => definition.tabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    href: `${basePath}?tab=${encodeURIComponent(tab.id)}`,
  })), [basePath, definition.tabs]);

  function openCommand(commandId: string) {
    setSuccess(null);
    if (commandId === 'account.lifecycle') { setAccountOpen(true); return; }
    if (commandId === 'integrity.match.force_takeover') { setTakeoverOpen(true); return; }
    const action = commandId.split('.').at(-1);
    if (kind === 'league' || kind === 'team' || kind === 'athlete') {
      if (action === 'activate' || action === 'suspend' || action === 'archive' || action === 'restore') {
        setLifecycleTarget({ kind, id: entityId, name: payload?.view.entity.title ?? entityId, action });
      }
    }
  }

  async function loadMore() {
    if (!payload?.nextCursor || !currentUser || isDemoMode) return;
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`/api/platform/workbench/${kind}/${encodeURIComponent(entityId)}?tab=${encodeURIComponent(requestedTab)}&limit=30&cursor=${encodeURIComponent(payload.nextCursor)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const next = await response.json().catch(() => ({})) as Payload & { error?: string };
      if (!response.ok) throw new Error(next.error ?? 'More records could not be loaded.');
      setPayload((current) => current ? {
        ...next,
        view: { ...next.view, records: [...current.view.records, ...next.view.records] },
      } : next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'More records could not be loaded.');
    }
  }

  const view = payload?.view;
  return (
    <section className="space-y-5">
      <PlatformAdminHeader
        eyebrow={definition.eyebrow}
        title={view?.entity.title ?? (loading ? 'Loading workbench…' : entityId)}
        description={view ? `${definition.description} ${view.entity.subtitle}` : definition.description}
        action={(
          <Link href={definition.backHref} className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-pill)] border border-border bg-surface-2 px-4 text-sm font-semibold text-text-strong hover:bg-surface-3">
            <ArrowLeft className="h-4 w-4" weight="bold" /> Back to {kind === 'match' ? 'Integrity' : 'Network'}
          </Link>
        )}
      />

      <WorkspaceTabs label={`${definition.eyebrow} sections`} tabs={tabs} active={requestedTab} />

      {loading ? <Skeleton className="h-[420px] rounded-[var(--radius-lg)]" /> : null}
      {error ? (
        <Card className="border-[color-mix(in_srgb,var(--state-error),transparent_45%)] p-5">
          <p role="alert" className="text-sm text-[var(--state-error)]">{error}</p>
          <Button className="mt-3" variant="secondary" onClick={() => setRefresh((value) => value + 1)}>Try again</Button>
        </Card>
      ) : null}

      {view && !loading ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip label={view.entity.status} tone={statusTone(view.entity.status)} />
            <span className="font-mono text-xs text-subtle">{view.entity.id}</span>
          </div>
          <PlatformStatGrid items={view.metrics} />

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-text-strong">{definition.tabs.find((item) => item.id === requestedTab)?.label}</h2>
                  <p className="mt-1 text-xs leading-5 text-muted">{definition.tabs.find((item) => item.id === requestedTab)?.description}</p>
                </div>
                <span className="text-xs tabular-nums text-subtle">{payload.total} records</span>
              </div>
              {view.records.length ? view.records.map((record) => (
                <DirectoryRow
                  key={record.id}
                  href={record.href}
                  title={record.title}
                  meta={record.meta}
                  status={record.status}
                  statusTone={statusTone(record.status)}
                  detail={record.details.length ? (
                    <dl className="grid gap-2 sm:grid-cols-2">
                      {record.details.map((detail) => (
                        <div key={`${record.id}-${detail.label}`} className="min-w-0">
                          <dt className="text-[10px] font-semibold uppercase tracking-wide text-subtle">{detail.label}</dt>
                          <dd className="mt-0.5 break-words text-xs text-text">{detail.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : undefined}
                />
              )) : <EmptyState title="Nothing recorded">{view.emptyMessage}</EmptyState>}
              {payload.nextCursor ? (
                <Button type="button" variant="secondary" onClick={() => void loadMore()}>Load more</Button>
              ) : null}
            </div>

            <aside className="space-y-4">
              <Card className="p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-brand" weight="fill" />
                  <h2 className="text-sm font-semibold text-text-strong">Commands</h2>
                </div>
                <div className="mt-3 flex flex-col items-start gap-3">
                  {definition.commandIds.map((commandId, index) => (
                    <PlatformCommandButton
                      key={commandId}
                      commandId={commandId}
                      shortcut={String(index + 1)}
                      onClick={() => openCommand(commandId)}
                    />
                  ))}
                </div>
                {success ? <p role="status" className="mt-3 text-xs leading-5 text-brand">{success}</p> : null}
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-2">
                  <LockKey className="h-5 w-5 text-subtle" />
                  <h2 className="text-sm font-semibold text-text-strong">Governed boundaries</h2>
                </div>
                <div className="mt-3 space-y-3">
                  {definition.forbiddenActions.map((item) => (
                    <div key={item.label} className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
                      <p className="text-xs font-semibold text-text-strong">{item.label}</p>
                      <p className="mt-1 text-xs leading-5 text-muted">{item.reason}</p>
                      <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-brand">
                        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {item.alternative}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            </aside>
          </div>
        </>
      ) : null}

      <LifecycleCommandDialog
        target={lifecycleTarget}
        onClose={() => setLifecycleTarget(null)}
        onDone={() => { setSuccess('Lifecycle transition recorded.'); setRefresh((value) => value + 1); }}
      />
      <ConsequenceSheet
        open={accountOpen}
        commandId="account.lifecycle"
        targetId={entityId}
        inputs={{ userId: entityId }}
        title={`Change ${view?.entity.title ?? entityId} account status`}
        fields={[{
          kind: 'select', name: 'accountStatus', label: 'Next account status', required: true,
          options: [
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'disabled', label: 'Disabled' },
            { value: 'deletion_pending', label: 'Deletion pending' },
          ],
        }]}
        running={accountCommand.running}
        error={accountCommand.error}
        onClose={() => { setAccountOpen(false); accountCommand.reset(); }}
        onSubmit={async (values, reason) => {
          const ok = await accountCommand.run({ action: 'update_user_account', userId: entityId, accountStatus: values.accountStatus, note: reason }, 'Account lifecycle changed.');
          if (ok) { setAccountOpen(false); setSuccess('Account lifecycle changed.'); setRefresh((value) => value + 1); }
        }}
      />
      <ConsequenceSheet
        open={takeoverOpen}
        commandId="integrity.match.force_takeover"
        targetId={entityId}
        inputs={{ matchId: entityId }}
        title={`Start fenced takeover for ${view?.entity.title ?? entityId}`}
        submitLabel="Start takeover"
        running={takeoverCommand.running}
        error={takeoverCommand.error}
        onClose={() => { setTakeoverOpen(false); takeoverCommand.reset(); }}
        onSubmit={async (_values, reason) => {
          const ok = await takeoverCommand.run({ reason }, 'A new attributed session generation was created.');
          if (ok) { setTakeoverOpen(false); setSuccess('A new attributed session generation was created.'); setRefresh((value) => value + 1); }
        }}
      />
    </section>
  );
}
