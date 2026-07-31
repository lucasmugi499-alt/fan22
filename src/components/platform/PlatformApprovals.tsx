'use client';

import { useMemo, useState } from 'react';
import { CheckCircle, Copy, XCircle, SealCheck } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { pendingApprovals, type ApprovalItem } from '@/lib/platform/platformContext';
import { QueueItem } from '@/components/core/QueueItem';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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
  const [recentInvite, setRecentInvite] = useState<{ title: string; url: string } | null>(null);

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
      const absoluteActionUrl = result.actionUrl && typeof window !== 'undefined'
        ? new URL(result.actionUrl, window.location.origin).toString()
        : result.actionUrl;
      if (absoluteActionUrl && typeof navigator !== 'undefined') {
        await navigator.clipboard?.writeText(absoluteActionUrl).catch(() => undefined);
      }
      setRecentInvite(absoluteActionUrl ? { title: active.title, url: absoluteActionUrl } : null);
      toast.success(result.actionUrl
        ? `${active.title} approved. Invitation link is ready.`
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

      {recentInvite ? (
        <Card className="space-y-3 border-brand/35 bg-brand-subtle/40 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-brand text-on-brand">
              <SealCheck className="h-5 w-5" weight="fill" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text-strong">League Owner invite ready</p>
              <p className="mt-1 text-xs leading-5 text-muted">{recentInvite.title} can now set up the League Admin account from this private link.</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input className="field" readOnly value={recentInvite.url} />
            <Button
              size="sm"
              icon={Copy}
              onClick={() => {
                void navigator.clipboard?.writeText(recentInvite.url);
                toast.success('Invitation link copied.');
              }}
            >
              Copy link
            </Button>
          </div>
        </Card>
      ) : null}

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
