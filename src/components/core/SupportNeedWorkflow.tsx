'use client';

import { useMemo, useState } from 'react';
import { CheckCircle, HandHeart, ShieldCheck, XCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import type { ReviewSupportNeedInput } from '@/data/providers/types';
import type { SupportNeed } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { EmptyState } from '@/components/ui/EmptyState';

type Scope = 'team' | 'league';

export function SupportNeedWorkflow({
  scope,
  targetId,
  compact = false,
}: {
  scope: Scope;
  targetId: string;
  compact?: boolean;
}) {
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const { supportNeeds, athletes, loading, retry } = useGoalPlaceData({
    collections: ['supportNeeds', 'athletes'],
    scope: scope === 'league' ? { leagueId: targetId } : { teamId: targetId },
    recordLimit: 100,
  });
  const [active, setActive] = useState<SupportNeed | null>(null);
  const [completion, setCompletion] = useState<SupportNeed | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const athleteById = useMemo(
    () => new Map(athletes.map((athlete) => [athlete.id, athlete])),
    [athletes],
  );
  const queue = useMemo(() => supportNeeds.filter((need) => {
    if (scope === 'team') {
      return need.approvalStatus === 'proposed' &&
        (need.teamId === targetId || athleteById.get(need.athleteId ?? '')?.teamId === targetId);
    }
    return need.approvalStatus === 'team_verified' && need.leagueId === targetId;
  }), [athleteById, scope, supportNeeds, targetId]);
  const completionQueue = useMemo(
    () => scope === 'league'
      ? supportNeeds.filter((need) =>
          need.leagueId === targetId &&
          need.status === 'funded' &&
          need.approvalStatus === 'league_approved' &&
          need.recipientUpdates.some((update) => Boolean(update.evidenceUrl)),
        )
      : [],
    [scope, supportNeeds, targetId],
  );

  async function review(action: ReviewSupportNeedInput['action']) {
    const actorUserId = currentUser?.uid ?? userProfile?.uid;
    if (!active || !actorUserId) {
      toast.error('Your account is not ready for this review.');
      return;
    }
    setSaving(true);
    try {
      await provider.reviewSupportNeed({
        supportNeedId: active.id,
        actorUserId,
        action,
        note: note.trim() || undefined,
      });
      toast.success(action.includes('reject') ? 'Support need rejected.' : 'Support need approved.');
      setActive(null);
      setNote('');
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Support need review failed.');
    } finally {
      setSaving(false);
    }
  }

  async function verifyCompletion() {
    const actorUserId = currentUser?.uid ?? userProfile?.uid;
    if (!completion || !actorUserId || note.trim().length < 10) {
      toast.error('Add a short evidence review note.');
      return;
    }
    setSaving(true);
    try {
      await provider.completeSupportNeed({
        supportNeedId: completion.id,
        actorUserId,
        note: note.trim(),
      });
      toast.success('Completion verified and recorded.');
      setCompletion(null);
      setNote('');
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Completion review failed.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;
  const visible = compact ? queue.slice(0, 3) : queue;
  const approveAction = scope === 'team' ? 'team_verify' : 'league_approve';
  const rejectAction = scope === 'team' ? 'team_reject' : 'league_reject';

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-text-strong">Support need approvals</h2>
        <p className="text-xs text-muted">
          {scope === 'team'
            ? 'Confirm the need, athlete affiliation, and practical purpose.'
            : 'Approve publication only after team verification and payout-control review.'}
        </p>
      </div>
      {visible.length ? visible.map((need) => (
        <Card key={need.id} className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-strong">{need.title}</p>
            <p className="mt-1 text-xs text-muted">
              {athleteById.get(need.athleteId ?? '')?.name ?? 'Team need'} · UGX {need.targetAmount.toLocaleString()}
            </p>
          </div>
          <Button size="sm" variant="secondary" icon={HandHeart} onClick={() => setActive(need)}>
            Review
          </Button>
        </Card>
      )) : (
        <EmptyState
          icon={ShieldCheck}
          title="No needs awaiting review"
          description="A request appears here only when this role is the next approver."
        />
      )}

      {scope === 'league' && completionQueue.length ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-text-strong">Completion evidence</h3>
          {completionQueue.map((need) => (
            <Card key={need.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text-strong">{need.title}</p>
                <p className="mt-1 text-xs text-muted">{need.recipientUpdates.length} recipient updates · target funded</p>
              </div>
              <Button size="sm" variant="secondary" icon={CheckCircle} onClick={() => setCompletion(need)}>Verify completion</Button>
            </Card>
          ))}
        </div>
      ) : null}

      {active ? (
        <Sheet
          open
          onClose={() => setActive(null)}
          title={active.title}
          description={athleteById.get(active.athleteId ?? '')?.name ?? 'Team development need'}
          footer={
            <div className="grid grid-cols-2 gap-2">
              <Button block variant="secondary" icon={XCircle} onClick={() => review(rejectAction)} disabled={saving}>Reject</Button>
              <Button block icon={CheckCircle} onClick={() => review(approveAction)} disabled={saving}>Approve</Button>
            </div>
          }
        >
          <div className="space-y-4">
            <Card className="p-4">
              <p className="text-sm leading-relaxed text-muted">{active.story}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div><dt className="text-subtle">Target</dt><dd className="mt-1 font-semibold text-text-strong">UGX {active.targetAmount.toLocaleString()}</dd></div>
                <div><dt className="text-subtle">Destination</dt><dd className="mt-1 font-semibold capitalize text-text-strong">{active.preferredPayoutDestination.replaceAll('_', ' ')}</dd></div>
              </dl>
            </Card>
            <label className="block text-xs font-semibold uppercase text-subtle">
              Review note
              <textarea className="field mt-2 min-h-24 py-3 normal-case" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Evidence checked, conditions, or rejection reason." />
            </label>
            <p className="text-xs leading-relaxed text-muted">Approval publishes the need; it does not release funds. Recipient KYC and payout destination verification remain separate controls.</p>
          </div>
        </Sheet>
      ) : null}

      {completion ? (
        <Sheet
          open
          onClose={() => setCompletion(null)}
          title="Verify completion evidence"
          description={completion.title}
          footer={<Button block icon={CheckCircle} onClick={verifyCompletion} disabled={saving}>Mark completed</Button>}
        >
          <div className="space-y-4">
            {completion.recipientUpdates.map((update) => (
              <Card key={update.id} className="p-4">
                <p className="text-sm text-muted">{update.message}</p>
                {update.evidenceUrl ? <a className="mt-2 inline-block text-sm font-semibold text-brand hover:underline" href={update.evidenceUrl} target="_blank" rel="noreferrer">Open evidence</a> : null}
              </Card>
            ))}
            <label className="block text-xs font-semibold uppercase text-subtle">
              Verification note
              <textarea className="field mt-2 min-h-24 py-3 normal-case" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Describe the evidence checked and why it proves completion." />
            </label>
          </div>
        </Sheet>
      ) : null}
    </section>
  );
}
