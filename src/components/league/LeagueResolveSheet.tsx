'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SealCheck, XCircle, ShieldCheck } from '@phosphor-icons/react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthProvider';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { MatchStatusBadge } from '@/components/ui/StatusBadge';
import type { Match, ResultSubmission, Team } from '@/types';
import { useFinalizationOutcome } from '@/lib/finalization/useFinalizationOutcome';
import Link from 'next/link';

/**
 * League adjudication of a result exception. The league decides (uphold, correct, reject);
 * the trusted finalizer is what stamps a result official. In demo mode this writes local
 * state; in Firebase the finalizer performs the promotion once the league has resolved.
 */
export function LeagueResolveSheet({
  open,
  onClose,
  onComplete,
  match,
  home,
  away,
}: {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
  match: Match;
  home?: Team;
  away?: Team;
}) {
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const [submission, setSubmission] = useState<ResultSubmission>();
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [note, setNote] = useState('');
  const homeName = home?.name ?? 'Home';
  const awayName = away?.name ?? 'Away';
  const actorUserId = currentUser?.uid ?? userProfile?.uid;
  /**
   * Subscribed to the OUTCOME, not to one value of it.
   *
   * `busy` used to be cleared only by a thrown error, and success was inferred solely from
   * `status === 'official'`. Finalization legitimately produces three other outcomes — an
   * activation gate set to off or canary, a blocking reconciliation exception, an oversize
   * refusal — and in every one of them this sheet sat at "Saving decision..." forever with no
   * escape but closing it. The decision had already been saved, so an admin who assumed it
   * failed and retried would act twice on the same match.
   */
  const outcome = useFinalizationOutcome({
    matchId: match.id,
    leagueId: match.leagueId,
    status: submission?.status,
    isDemoMode,
  });
  const busy = outcome.phase === 'waiting';

  useEffect(
    () =>
      provider.subscribeToResultSubmission(
        match.id,
        (nextSubmission) => {
          setSubmission(nextSubmission);
          setLoaded(true);
          setLoadError(undefined);
          if (nextSubmission) {
            setHomeScore(
              String(nextSubmission.correctedHomeScore ?? nextSubmission.homeScore)
            );
            setAwayScore(
              String(nextSubmission.correctedAwayScore ?? nextSubmission.awayScore)
            );
          }
        },
        (error) => {
          setLoaded(true);
          setLoadError(error.message);
        }
      ),
    [match.id, provider]
  );

  useEffect(() => {
    if (outcome.phase !== 'official') return;
    toast.success('Finalized as the official result.');
    onComplete?.();
    onClose();
  }, [onClose, onComplete, outcome.phase]);

  async function resolve(decision: 'uphold' | 'correct' | 'reject') {
    if (!actorUserId) {
      toast.error('Your account is not ready to resolve this result.');
      return;
    }
    const correctedHome = Number(homeScore);
    const correctedAway = Number(awayScore);
    if (
      decision === 'correct' &&
      (!Number.isFinite(correctedHome) ||
        !Number.isFinite(correctedAway) ||
        homeScore === '' ||
        awayScore === '')
    ) {
      toast.error('Enter the corrected score for both teams.');
      return;
    }

    outcome.start();
    try {
      await provider.resolveDisputedSubmission({
        matchId: match.id,
        resolvedByUserId: actorUserId,
        decision,
        ...(decision === 'correct'
          ? { correctedScore: { home: correctedHome, away: correctedAway } }
          : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      if (decision === 'reject') {
        // Rejection is terminal on its own: nothing is finalized, so there is no outcome to
        // wait for. Ending the wait explicitly keeps the sheet from timing out on a decision
        // that already completed.
        outcome.reset();
        toast('Result rejected. A fresh submission can replace it.');
        onComplete?.();
        onClose();
        return;
      }
      toast('Decision recorded. GoalPlace256 is finalizing the official result.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The decision could not be saved.');
      outcome.reset();
    }
  }

  async function retryFinalization() {
    outcome.start();
    try {
      await provider.finalizeResultSubmission(match.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Finalization could not be retried.');
      outcome.reset();
    }
  }

  const actionable =
    submission?.status === 'disputed' ||
    submission?.status === 'confirmation_overdue';
  const score = submission
    ? {
        home: submission.correctedHomeScore ?? submission.homeScore,
        away: submission.correctedAwayScore ?? submission.awayScore,
      }
    : match.score;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Resolve result"
      description={`${homeName} vs ${awayName}`}
      footer={
        outcome.phase === 'review' || outcome.phase === 'pending' ? null
        : actionable ? (
          <div className="space-y-2">
          <Button block icon={SealCheck} onClick={() => resolve('uphold')} disabled={busy}>
            {busy ? 'Saving decision...' : 'Uphold and finalize'}
          </Button>
          <div className="flex gap-2">
            <Button block variant="secondary" onClick={() => resolve('correct')} disabled={busy}>
              Correct score
            </Button>
            <Button
              block
              variant="secondary"
              icon={XCircle}
              onClick={() => resolve('reject')}
              disabled={busy}
            >
              Reject
            </Button>
          </div>
        </div>
        ) : submission?.status === 'confirmed' ? (
          <Button block icon={SealCheck} onClick={retryFinalization} disabled={busy}>
            {busy ? 'Finalizing...' : 'Finalize now'}
          </Button>
        ) : null
      }
    >
      {outcome.phase === 'review' || outcome.phase === 'pending' ? (
        /**
         * The two outcomes that used to be an indefinite spinner.
         *
         * Both say plainly that the DECISION was saved, because that is the fact an admin
         * needs in order not to submit it twice. Neither is worded as a failure: an exception
         * is the finalizer refusing to publish a contradiction, and a slow trigger is a slow
         * trigger.
         */
        <div
          className="space-y-4"
          role="status"
          aria-live="polite"
        >
          {outcome.phase === 'review' ? (
            <div className="rounded-[var(--radius-md)] border border-warning/30 bg-[var(--state-warning-bg)] p-4 text-sm">
              <p className="font-semibold text-text-strong">Sent for review.</p>
              <p className="mt-1 text-muted">
                Your decision was saved. GoalPlace256 could not publish an official result
                because the recorded events and the score disagree, so the match has been
                raised as an exception for a human to settle. Nothing was published, and you
                do not need to decide again.
              </p>
              <Link
                href={`/league-admin/verification?exception=${outcome.exceptionId ?? ''}`}
                className="mt-3 inline-block font-medium text-brand underline underline-offset-2"
              >
                Open the exception
              </Link>
            </div>
          ) : (
            <div className="rounded-[var(--radius-md)] border border-border-strong bg-surface-2 p-4 text-sm">
              <p className="font-semibold text-text-strong">Decision saved. Still finalizing.</p>
              <p className="mt-1 text-muted">
                The result has not been stamped official yet. This is normal when finalization
                is queued or paused for review. Do not submit the decision again — it is
                recorded, and the table will update on its own.
              </p>
            </div>
          )}
          <Button block variant="secondary" onClick={() => { outcome.reset(); onComplete?.(); onClose(); }}>
            Close
          </Button>
        </div>
      ) : !loaded ? (
        <p className="text-sm text-muted">Loading the submitted result...</p>
      ) : loadError ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--state-error)]/30 bg-[var(--state-error-bg)] p-3 text-sm text-[var(--state-error)]">
          {loadError}
        </div>
      ) : !submission ? (
        <p className="text-sm text-muted">
          No result claim exists for this fixture yet.
        </p>
      ) : (
        <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Current state</span>
          <MatchStatusBadge match={match} size="sm" />
        </div>
        <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-4">
          <Row name={homeName} score={score.home} />
          <div className="my-2 h-px bg-border" />
          <Row name={awayName} score={score.away} />
        </div>
        {submission.disputeReason ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--state-disputed)]/30 bg-[var(--state-disputed-bg)] p-3 text-sm text-[var(--state-disputed)]">
            <p className="font-medium">Opponent dispute</p>
            <p className="mt-1">{submission.disputeReason}</p>
          </div>
        ) : null}
        {actionable ? (
          <>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">Corrected score</p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <ScoreInput label={homeName} value={homeScore} onChange={setHomeScore} />
                <span className="pt-6 text-sm font-semibold text-subtle">vs</span>
                <ScoreInput label={awayName} value={awayScore} onChange={setAwayScore} />
              </div>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">
                Decision note
              </span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="Record the evidence or ruling behind this decision."
                className="w-full resize-none rounded-[var(--radius-md)] border border-border-strong bg-surface-2 px-3 py-2.5 text-sm text-text-strong outline-none focus:border-brand"
              />
            </label>
          </>
        ) : (
          <p className="text-sm text-muted">
            {submission.status === 'pending_confirmation'
              ? 'The opponent still has time to respond. This enters the league decision queue when overdue or disputed.'
              : submission.status === 'confirmed'
                ? 'The result is settled and waiting for the trusted finalizer.'
                : 'This result no longer needs a league decision.'}
          </p>
        )}
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm text-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" weight="bold" />
          <p>
            The league does not verify every normal result. It rules on the exceptions. Upholding
            settles the two-sided check, then GoalPlace256 finalizes the official record.
          </p>
        </div>
      </div>
      )}
    </Sheet>
  );
}

function ScoreInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block truncate text-xs font-medium text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-[var(--radius-md)] border border-border-strong bg-surface-2 text-center text-xl font-bold tabular-nums text-text-strong outline-none focus:border-brand"
      />
    </label>
  );
}

function Row({ name, score }: { name: string; score: number | null }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="truncate text-sm font-medium text-text-strong">{name}</span>
      <span data-numeric className="tabular text-xl font-bold tabular-nums text-text-strong">
        {score ?? '-'}
      </span>
    </div>
  );
}
