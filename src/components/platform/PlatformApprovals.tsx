'use client';

import { useMemo, useState } from 'react';
import { CheckCircle, XCircle, SealCheck } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { pendingApprovals, type ApprovalItem } from '@/lib/platform/platformContext';
import { QueueItem } from '@/components/core/QueueItem';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { STATE } from '@/lib/statusSystem';
import { useAuth } from '@/context/AuthProvider';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';

type PlatformApprovalItem = ApprovalItem & {
  targetCollection: 'athletes' | 'leagues' | 'leagueAdminApplications';
  metaLabel?: string;
};

export function PlatformApprovals() {
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const { leagues, athletes, leagueAdminApplications, loading, retry } = useGoalPlaceData({
    collections: ['leagues', 'athletes', 'leagueAdminApplications'],
  });
  const items = useMemo<PlatformApprovalItem[]>(() => [
    ...leagueAdminApplications
      .filter((application) => application.status === 'pending' || application.status === 'needs_information')
      .map((application) => ({
        id: application.id,
        kind: 'league' as const,
        targetCollection: 'leagueAdminApplications' as const,
        metaLabel: 'League application',
        title: application.leagueName,
        subtitle: `${application.city} · ${application.sport} League Admin application`,
      })),
    ...pendingApprovals(leagues, athletes).map((item) => ({
      ...item,
      targetCollection: item.kind === 'athlete' ? 'athletes' as const : 'leagues' as const,
      metaLabel: item.kind === 'athlete' ? 'Athlete verification' : 'League listing',
    })),
  ], [athletes, leagueAdminApplications, leagues]);
  const [active, setActive] = useState<PlatformApprovalItem | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function decide(decision: 'approved' | 'rejected' | 'requested_information') {
    const actorUserId = currentUser?.uid ?? userProfile?.uid;
    if (!active || !actorUserId) {
      toast.error('Your Platform Admin account is not ready.');
      return;
    }
    setSaving(true);
    try {
      const result = await provider.reviewApproval({
        targetCollection: active.targetCollection,
        targetId: active.id,
        actorUserId,
        decision,
        note: note.trim() || undefined,
      });
      if (result.actionUrl && typeof navigator !== 'undefined') {
        await navigator.clipboard?.writeText(new URL(result.actionUrl, window.location.origin).toString()).catch(() => undefined);
      }
      toast.success(result.actionUrl
        ? `${active.title} approved. Invitation link copied.`
        : decision === 'approved' ? `${active.title} approved.` : 'Decision recorded.');
      setActive(null);
      setNote('');
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'The decision could not be recorded.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-8 w-40" /><Skeleton className="h-16 w-full rounded-[var(--radius-lg)]" /><Skeleton className="h-16 w-full rounded-[var(--radius-lg)]" /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text-strong">Approvals</h1>
        <p className="text-sm text-muted">Leagues and athletes cannot self-promote. The platform signs them off.</p>
      </div>

      {items.length ? (
        <div className="space-y-2.5">
          {items.map((it) => (
            <QueueItem
              key={`${it.kind}-${it.id}`}
              state={STATE.pending}
              title={it.title}
              subtitle={it.subtitle}
              meta={it.metaLabel ?? (it.kind === 'league' ? 'League listing' : 'Athlete verification')}
              onClick={() => setActive(it)}
            />
          ))}
        </div>
      ) : (
        <EmptyState icon={SealCheck} title="All caught up" description="No leagues or athletes are waiting on approval right now." />
      )}

      {active ? (
        <Sheet
          open
          onClose={() => setActive(null)}
          title={active.targetCollection === 'leagueAdminApplications' ? 'Approve league application' : active.kind === 'league' ? 'Approve league' : 'Verify athlete'}
          description={active.title}
          footer={
            <div className="flex gap-2">
              <Button block variant="secondary" icon={XCircle} onClick={() => decide('requested_information')} disabled={saving}>
                Request info
              </Button>
              <Button block icon={CheckCircle} onClick={() => decide('approved')} disabled={saving}>
                Approve
              </Button>
            </div>
          }
        >
          <p className="text-sm text-muted">{active.subtitle}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Approving {active.targetCollection === 'leagueAdminApplications'
              ? 'creates a draft league and queues a League Owner invitation'
              : active.kind === 'league'
                ? 'grants this league verified status on the platform'
                : 'grants this athlete a verified profile'}. This is a governance decision reserved for platform admins, and it is recorded in the audit trail.
          </p>
          <label className="mt-4 block text-xs font-semibold uppercase text-subtle">
            Decision note
            <textarea className="field mt-2 min-h-24 py-3 normal-case" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Evidence reviewed or information still required." />
          </label>
          <button type="button" onClick={() => decide('rejected')} disabled={saving} className="mt-3 text-sm font-medium text-[var(--state-error)] hover:underline">
            Reject application
          </button>
        </Sheet>
      ) : null}
    </div>
  );
}
