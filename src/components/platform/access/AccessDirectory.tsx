'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowClockwise, PauseCircle, Warning, XCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  DirectoryRow,
  EmptyState,
  PlatformAdminHeader,
  PlatformSearch,
  PlatformStatGrid,
  StatusChip,
} from '@/components/platform/PlatformAdminPrimitives';
import type { AccessAssignmentStatus } from '@/lib/auth/access';
import { BulkInvitationImport } from '@/components/platform/access/BulkInvitationImport';

/**
 * The canonical access desk.
 *
 * This screen used to load and revoke legacy `teamAssignments`, which created an
 * operational illusion: revoking here left the canonical assignment — the record
 * Firestore Rules actually read — untouched, so the operator kept working. It now reads
 * `accessAssignments` through a server-paginated endpoint and acts through the trusted
 * transition command, which rebuilds the projection and writes an audit event.
 *
 * Legacy records still appear, but only in a clearly labelled read-only diagnostics
 * panel. They are no longer an authority source anywhere.
 */

type CanonicalAssignment = {
  id: string;
  userId: string;
  roleKey: string;
  scopeType: string;
  scopeId: string;
  scopeLabel: string;
  permissionBundleId: string;
  status: AccessAssignmentStatus;
  validUntil?: string;
  revocationReason?: string;
  projected: boolean;
  projectedCapabilities: string[];
  account: { email?: string; accountClass?: string; accountStatus?: string };
};

function statusTone(status: AccessAssignmentStatus) {
  if (status === 'active') return 'good';
  if (status === 'revoked') return 'bad';
  return 'warn';
}

export function AccessDirectory() {
  const { currentUser, isDemoMode } = useAuth();

  const [assignments, setAssignments] = useState<CanonicalAssignment[]>([]);
  // Demo sessions never call the trusted endpoint, so they are not waiting on it.
  const [loading, setLoading] = useState(!isDemoMode);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [pendingId, setPendingId] = useState('');

  // Legacy records are shown for migration visibility only, never as authority.
  const { teamAssignments, loading: legacyLoading } = useGoalPlaceData({
    collections: ['teamAssignments'],
    recordLimit: 120,
  });

  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (isDemoMode) return;
    async function load() {
      setLoading(true);
      setLoadError('');
      try {
        const token = await currentUser?.getIdToken();
        if (!token) throw new Error('Sign in again to load scoped access.');
        const response = await fetch('/api/platform/access?limit=100', {
          headers: { authorization: `Bearer ${token}` },
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? 'Access assignments could not be loaded.');
        if (!cancelled) setAssignments(body.assignments ?? []);
      } catch (cause) {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : 'Access assignments could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [currentUser, isDemoMode, reloadToken]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return assignments;
    return assignments.filter((assignment) => [
      assignment.account.email,
      assignment.userId,
      assignment.scopeLabel,
      assignment.scopeId,
      assignment.roleKey,
      assignment.status,
    ].join(' ').toLowerCase().includes(needle));
  }, [assignments, query]);

  async function transition(assignment: CanonicalAssignment, status: AccessAssignmentStatus) {
    const reason = actionReason.trim();
    if (reason.length < 4) {
      toast.error('Record an audit reason before changing scoped access.');
      return;
    }
    setPendingId(assignment.id);
    try {
      const token = await currentUser?.getIdToken();
      const response = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'transition_access_assignment',
          assignmentId: assignment.id,
          status,
          note: reason,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'The assignment could not be changed.');
      toast.success(`Assignment ${status}. The access projection was rebuilt.`);
      setActionReason('');
      reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'The assignment could not be changed.');
    } finally {
      setPendingId('');
    }
  }

  if (loading || legacyLoading) return <Skeleton className="h-[560px] rounded-[var(--radius-lg)]" />;

  const active = assignments.filter((item) => item.status === 'active');
  // An active assignment with no projection cannot authorize anything, because Rules read
  // the projection rather than the assignment.
  const unprojected = active.filter((item) => !item.projected);

  return (
    <section className="space-y-5">
      <PlatformAdminHeader
        eyebrow="Network"
        title="Access"
        description="Scoped assignments are the authority Firestore Rules read. Changes here rebuild the access projection and write an immutable audit event."
      />

      <PlatformStatGrid items={[
        { label: 'Active assignments', value: active.length, tone: 'good' },
        { label: 'Suspended', value: assignments.filter((item) => item.status === 'suspended').length, tone: 'warn' },
        { label: 'Revoked', value: assignments.filter((item) => item.status === 'revoked').length },
        { label: 'Not projected', value: unprojected.length, tone: unprojected.length ? 'bad' : 'good' },
      ]} />

      {loadError ? (
        <Card className="p-4">
          <EmptyState title="Access assignments could not be loaded">{loadError}</EmptyState>
          <Button size="sm" variant="secondary" icon={ArrowClockwise} onClick={reload} className="mt-3">
            Retry
          </Button>
        </Card>
      ) : null}

      {unprojected.length ? (
        <Card className="p-4">
          <div className="flex items-start gap-2">
            <Warning weight="fill" className="mt-0.5 size-4 shrink-0 text-[var(--state-warning)]" aria-hidden />
            <p className="text-[13px] leading-snug text-text">
              {unprojected.length} active assignment(s) have no access projection. Firestore Rules
              read the projection, so these currently grant nothing. Inspect with{' '}
              <code className="rounded bg-surface-3 px-1">npm run access:migrate:gate</code>.
            </p>
          </div>
        </Card>
      ) : null}

      <Card className="p-4">
        <div className="mb-4">
          <PlatformSearch value={query} onChange={setQuery} placeholder="Search by email, scope, role or status" />
        </div>
        <label className="mb-4 block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Audit reason for access actions</span>
          <textarea
            value={actionReason}
            onChange={(event) => setActionReason(event.target.value)}
            className="mt-2 min-h-20 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-3 text-sm text-text-strong outline-none placeholder:text-subtle focus:border-brand"
            placeholder="Example: Staff member no longer works with this club; revoke the scoped assignment."
          />
        </label>
        <div className="space-y-2.5">
          {filtered.length ? filtered.map((assignment) => (
            <div key={assignment.id} className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
              <DirectoryRow
                title={assignment.account.email ?? assignment.userId}
                meta={`${assignment.roleKey} · ${assignment.scopeType} ${assignment.scopeLabel}`}
                status={assignment.status}
                statusTone={statusTone(assignment.status)}
                detail={
                  <div className="flex flex-wrap gap-1.5">
                    <StatusChip label={assignment.permissionBundleId} />
                    <StatusChip
                      label={assignment.projected ? `${assignment.projectedCapabilities.length} capabilities` : 'not projected'}
                      tone={assignment.projected ? 'good' : 'bad'}
                    />
                    {assignment.account.accountClass ? <StatusChip label={assignment.account.accountClass} /> : null}
                    {assignment.validUntil ? <StatusChip label={`until ${new Date(assignment.validUntil).toLocaleDateString()}`} /> : null}
                    {assignment.revocationReason ? <StatusChip label={assignment.revocationReason} tone="bad" /> : null}
                  </div>
                }
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={PauseCircle}
                  onClick={() => void transition(assignment, 'suspended')}
                  disabled={pendingId === assignment.id || assignment.status !== 'active'}
                >
                  Suspend
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={XCircle}
                  onClick={() => void transition(assignment, 'revoked')}
                  disabled={pendingId === assignment.id || assignment.status === 'revoked'}
                >
                  Revoke
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={ArrowClockwise}
                  onClick={() => void transition(assignment, 'active')}
                  disabled={pendingId === assignment.id || assignment.status === 'active'}
                >
                  Reinstate
                </Button>
              </div>
            </div>
          )) : (
            <EmptyState title="No scoped assignments match this filter">
              Assignments appear here once operators accept an invitation.
            </EmptyState>
          )}
        </div>
      </Card>

      <BulkInvitationImport />

      <Card className="p-4">
        <h2 className="text-[15px] font-semibold text-text-strong">Legacy records · migration diagnostics</h2>
        <p className="mb-3 mt-1 text-[13px] leading-snug text-text-muted">
          Not the current authority source. Retained for migration visibility only. Firestore
          Rules no longer read these, so changing one grants and removes nothing.
        </p>
        <div className="space-y-2">
          {teamAssignments.length ? teamAssignments.slice(0, 40).map((assignment) => (
            <DirectoryRow
              key={assignment.id}
              title={assignment.invitedEmail ?? assignment.userId ?? 'Unclaimed invitation'}
              meta={`legacy teamAssignment · ${assignment.teamId}`}
              status={assignment.status}
              statusTone="neutral"
            />
          )) : (
            <EmptyState title="No legacy team assignments remain">Nothing left to migrate.</EmptyState>
          )}
        </div>
      </Card>
    </section>
  );
}
