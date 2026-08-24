'use client';

import { useMemo, useState } from 'react';
import { CheckCircle, Flag, ShieldCheck, Target, XCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { challengeLifecycleLabel, type ChallengeAction } from '@/lib/challenge';
import type { Challenge } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { EmptyState } from '@/components/ui/EmptyState';

type Scope = 'team' | 'league' | 'platform';

const ACTIONS: Record<Scope, Partial<Record<Challenge['status'], ChallengeAction[]>>> = {
  team: {
    proposed: ['team_approve', 'team_reject'],
    in_progress: ['submit_evidence'],
  },
  league: {
    team_approved: ['league_approve'],
    league_approved: ['activate_non_cash', 'commit_grant'],
    funding_open: ['lock_funding'],
    funding_locked: ['start_challenge'],
    evidence_submitted: ['begin_review'],
    under_review: ['mark_achieved', 'mark_not_achieved', 'mark_void'],
  },
  platform: {
    under_review: ['mark_achieved', 'mark_not_achieved', 'mark_void'],
    achieved: ['prepare_allocation', 'close_non_cash'],
    not_achieved: ['prepare_allocation', 'close_non_cash'],
    void: ['prepare_allocation', 'close_non_cash'],
    allocation_pending: ['settle'],
  },
};

const ACTION_LABEL: Record<ChallengeAction, string> = {
  team_approve: 'Approve feasibility',
  team_reject: 'Reject proposal',
  league_approve: 'Approve rules',
  activate_non_cash: 'Activate challenge',
  commit_grant: 'Commit grant',
  open_funding: 'Open pilot',
  lock_funding: 'Lock terms',
  start_challenge: 'Start challenge',
  submit_evidence: 'Submit evidence',
  begin_review: 'Begin review',
  mark_achieved: 'Mark achieved',
  mark_not_achieved: 'Not achieved',
  mark_void: 'Void challenge',
  prepare_allocation: 'Approve grant allocation',
  settle: 'Mark grant paid',
  close_non_cash: 'Close challenge',
};

function actionsFor(scope: Scope, challenge: Challenge) {
  const all = ACTIONS[scope][challenge.status] ?? [];
  return all.filter((action) => challenge.fundingModel === 'non_cash'
    ? !['commit_grant', 'prepare_allocation', 'settle', 'open_funding', 'lock_funding'].includes(action)
    : !['activate_non_cash', 'close_non_cash', 'open_funding', 'lock_funding'].includes(action));
}

export function ChallengeWorkflow({
  scope,
  targetId,
  compact = false,
}: {
  scope: Scope;
  targetId?: string;
  compact?: boolean;
}) {
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const { challenges, athletes, loading, retry } = useGoalPlaceData({
    collections: ['challenges', 'athletes'],
    scope: scope === 'league'
      ? { leagueId: targetId }
      : scope === 'team'
        ? { teamId: targetId }
        : undefined,
    recordLimit: 100,
  });
  const [active, setActive] = useState<Challenge | null>(null);
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState('');
  const [saving, setSaving] = useState(false);

  const athleteById = useMemo(
    () => new Map(athletes.map((athlete) => [athlete.id, athlete])),
    [athletes],
  );
  const queue = useMemo(() => challenges.filter((challenge) => {
    if (!actionsFor(scope, challenge).length) return false;
    if (scope === 'league') return challenge.leagueId === targetId;
    if (scope === 'team') return athleteById.get(challenge.athleteId)?.teamId === targetId;
    return true;
  }), [athleteById, challenges, scope, targetId]);

  async function act(action: ChallengeAction) {
    const actorUserId = currentUser?.uid ?? userProfile?.uid;
    if (!active || !actorUserId) {
      toast.error('Your account is not ready for this action.');
      return;
    }
    setSaving(true);
    try {
      await provider.transitionChallenge({
        challengeId: active.id,
        actorUserId,
        action,
        note: note.trim() || undefined,
        evidenceRefs: evidence.split('\n').map((item) => item.trim()).filter(Boolean),
      });
      toast.success(`${ACTION_LABEL[action]} recorded.`);
      setActive(null);
      setNote('');
      setEvidence('');
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Challenge action failed.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;
  const visible = compact ? queue.slice(0, 3) : queue;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-text-strong">Challenge decisions</h2>
        <p className="text-xs text-muted">Pilot challenges are non-cash or sponsor-funded. Fan-pooled performance money is disabled.</p>
      </div>
      {visible.length ? visible.map((challenge) => {
        const athlete = athleteById.get(challenge.athleteId);
        return (
          <Card key={challenge.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text-strong">{challenge.description}</p>
              <p className="mt-1 text-xs text-muted">
                {athlete?.legalName ?? 'Athlete'} · {challengeLifecycleLabel(challenge.fundingModel, challenge.status)} · {challenge.fundingModel === 'sponsor_grant' ? 'Sponsor grant' : 'Non-cash'}
              </p>
            </div>
            <Button size="sm" variant="secondary" icon={Target} onClick={() => setActive(challenge)}>
              Review
            </Button>
          </Card>
        );
      }) : (
        <EmptyState
          icon={ShieldCheck}
          title="No challenge decisions"
          description="Proposals and evidence appear here when this role needs to act."
        />
      )}

      {active ? (
        <Sheet
          open
          onClose={() => setActive(null)}
          title={active.description}
          description={`${challengeLifecycleLabel(active.fundingModel, active.status)} · ${athleteById.get(active.athleteId)?.name ?? 'Athlete'}`}
          footer={
            <div className="grid gap-2 sm:grid-cols-2">
              {actionsFor(scope, active).map((action) => (
                <Button
                  key={action}
                  block
                  variant={action.includes('reject') || action.includes('not_') || action.includes('void') ? 'secondary' : 'primary'}
                  icon={action.includes('reject') || action.includes('not_') || action.includes('void') ? XCircle : CheckCircle}
                  onClick={() => act(action)}
                  disabled={saving}
                >
                  {ACTION_LABEL[action]}
                </Button>
              ))}
            </div>
          }
        >
          <div className="space-y-4">
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase text-subtle">Terms</p>
              <p className="mt-2 text-sm text-text-strong">{active.targetDescription ?? active.description}</p>
              <p className="mt-1 text-xs text-muted">Target: {active.target} · Season: {active.seasonId}</p>
            </Card>
            {active.status === 'in_progress' ? (
              <label className="block text-xs font-semibold uppercase text-subtle">
                Evidence links
                <textarea
                  className="field mt-2 min-h-24 py-3 normal-case"
                  value={evidence}
                  onChange={(event) => setEvidence(event.target.value)}
                  placeholder="One approved evidence URL per line"
                />
              </label>
            ) : null}
            <label className="block text-xs font-semibold uppercase text-subtle">
              Review note
              <textarea
                className="field mt-2 min-h-24 py-3 normal-case"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Explain the evidence, decision, or next step."
              />
            </label>
            <p className="flex gap-2 text-xs leading-relaxed text-muted">
              <Flag className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              {active.fundingModel === 'non_cash'
                ? 'The proposer cannot approve feasibility, and Team Admins cannot verify the final outcome. Closing records the reviewed milestone; no money is involved.'
                : 'The proposer cannot approve feasibility, Team Admins cannot verify the final outcome, and grant payment is a separate platform action.'}
            </p>
          </div>
        </Sheet>
      ) : null}
    </section>
  );
}
