'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Clock,
  PaperPlaneTilt,
  SealCheck,
  ShieldCheck,
  Warning,
} from '@phosphor-icons/react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthProvider';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { canSubmitResultFor } from '@/lib/resultSubmission';
import { isOfficialMatch } from '@/lib/status';
import type { Match, ResultSubmission, Team } from '@/types';

type Stage = 'idle' | 'saving' | 'finalizing';
type Mode = 'submit' | 'respond' | 'waiting' | 'review' | 'view';

/**
 * The result trust chain. A team admin may SUBMIT a score
 * (for a played match with no result) or, when the opponent has submitted, CONFIRM or
 * DISPUTE it. The client never writes `official`: confirming hands off to the trusted
 * finalizer, which stamps the result and updates the match atomically.
 */
export function ResultSubmissionSheet({
  open,
  onClose,
  onComplete,
  match,
  home,
  away,
  myTeamId,
}: {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
  match: Match;
  home?: Team;
  away?: Team;
  myTeamId: string;
}) {
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const [homeScore, setHomeScore] = useState<string>(match.score.home?.toString() ?? '');
  const [awayScore, setAwayScore] = useState<string>(match.score.away?.toString() ?? '');
  const [submission, setSubmission] = useState<ResultSubmission>();
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [disputeReason, setDisputeReason] = useState('');
  const [stage, setStage] = useState<Stage>('idle');

  useEffect(
    () =>
      provider.subscribeToResultSubmission(
        match.id,
        (nextSubmission) => {
          setSubmission(nextSubmission);
          setLoaded(true);
          setLoadError(undefined);
        },
        (error) => {
          setLoaded(true);
          setLoadError(error.message);
        }
      ),
    [match.id, provider]
  );

  useEffect(() => {
    if (submission?.status !== 'official' || stage !== 'finalizing') return;
    toast.success('Finalized as the official result by GoalPlace256.');
    onComplete?.();
    onClose();
  }, [onClose, onComplete, stage, submission?.status]);

  const mode = useMemo<Mode>(() => {
    if (submission?.status === 'official' || (!submission && isOfficialMatch(match))) return 'view';
    if (!submission || ['rejected', 'withdrawn'].includes(submission.status)) return 'submit';
    if (submission.status === 'disputed') return 'review';
    if (submission.status === 'confirmed') return 'waiting';
    if (submission.submittedByTeamId === myTeamId) return 'waiting';
    return submission.opponentTeamId === myTeamId ? 'respond' : 'review';
  }, [match, myTeamId, submission]);

  const actorUserId = currentUser?.uid ?? userProfile?.uid;

  async function submit() {
    const h = Number(homeScore);
    const a = Number(awayScore);
    if (!Number.isFinite(h) || !Number.isFinite(a) || homeScore === '' || awayScore === '') {
      toast.error('Enter a score for both teams.');
      return;
    }
    if (!actorUserId) {
      toast.error('Your account is not ready to submit this result.');
      return;
    }
    setStage('saving');
    try {
      await provider.createResultSubmission({
        match,
        submittedByTeamId: myTeamId,
        submittedByUserId: actorUserId,
        homeScore: h,
        awayScore: a,
      });
      toast.success('Result submitted. The opposing team has 72 hours to respond.');
      onComplete?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The result could not be submitted.');
    } finally {
      setStage('idle');
    }
  }

  async function confirmResult() {
    if (!actorUserId) {
      toast.error('Your account is not ready to confirm this result.');
      return;
    }
    setStage('finalizing');
    try {
      await provider.confirmResultSubmission(match.id, actorUserId);
      toast('Confirmed. GoalPlace256 is finalizing the official record.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The result could not be confirmed.');
      setStage('idle');
    }
  }

  async function disputeResult() {
    if (!actorUserId) {
      toast.error('Your account is not ready to dispute this result.');
      return;
    }
    if (!disputeReason.trim()) {
      toast.error('Tell the league what is wrong with the submitted result.');
      return;
    }
    setStage('saving');
    try {
      await provider.disputeResultSubmission(match.id, actorUserId, disputeReason);
      toast('Dispute raised. The league will review it.');
      onComplete?.();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The dispute could not be submitted.');
      setStage('idle');
    }
  }

  async function retryFinalization() {
    setStage('finalizing');
    try {
      await provider.finalizeResultSubmission(match.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Finalization could not be retried.');
      setStage('idle');
    }
  }

  const title =
    mode === 'submit'
      ? 'Submit result'
      : mode === 'respond'
        ? 'Confirm the result'
        : mode === 'view'
          ? 'Official result'
          : mode === 'review'
            ? 'League review'
            : 'Awaiting confirmation';
  const homeName = home?.name ?? 'Home';
  const awayName = away?.name ?? 'Away';
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
      title={title}
      description={`${homeName} vs ${awayName}`}
      footer={
        mode === 'submit' ? (
          <Button
            block
            icon={PaperPlaneTilt}
            onClick={submit}
            disabled={stage !== 'idle' || !canSubmitResultFor(match)}
          >
            {stage === 'saving' ? 'Submitting...' : 'Submit result'}
          </Button>
        ) : mode === 'respond' ? (
          <div className="flex gap-2">
            <Button variant="secondary" icon={Warning} onClick={disputeResult} disabled={stage !== 'idle'}>
              Dispute
            </Button>
            <Button block icon={SealCheck} onClick={confirmResult} disabled={stage !== 'idle'}>
              {stage === 'finalizing' ? 'Finalizing...' : 'Confirm'}
            </Button>
          </div>
        ) : mode === 'waiting' && submission?.status === 'confirmed' ? (
          <Button block icon={SealCheck} onClick={retryFinalization} disabled={stage !== 'idle'}>
            {stage === 'finalizing' ? 'Finalizing...' : 'Finalize now'}
          </Button>
        ) : null
      }
    >
      {!loaded ? (
        <p className="text-sm text-muted">Loading the result record...</p>
      ) : loadError ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--state-error)]/30 bg-[var(--state-error-bg)] p-3 text-sm text-[var(--state-error)]">
          {loadError}
        </div>
      ) : mode === 'submit' ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Enter the final score. It becomes a claim, not an official result, until the opposing
            team confirms it.
          </p>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <ScoreInput label={homeName} value={homeScore} onChange={setHomeScore} />
            <span className="pt-6 text-sm font-semibold text-subtle">vs</span>
            <ScoreInput label={awayName} value={awayScore} onChange={setAwayScore} />
          </div>
        </div>
      ) : mode === 'respond' ? (
        <div className="space-y-4">
          <ScoreLine homeName={homeName} awayName={awayName} h={score.home} a={score.away} />
          <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm text-muted">
            <p className="flex items-center gap-2 font-medium text-text-strong">
              <ShieldCheck className="h-4 w-4 text-brand" weight="bold" />
              Confirming does not make it official
            </p>
            <p className="mt-1">
              Your confirmation settles the two-sided check. GoalPlace256 then finalizes the
              official result. If the score is wrong, dispute it and the league will decide.
            </p>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              Dispute reason
            </span>
            <textarea
              value={disputeReason}
              onChange={(event) => setDisputeReason(event.target.value)}
              rows={3}
              placeholder="Describe the incorrect score, scorer or match event."
              className="w-full resize-none rounded-[var(--radius-md)] border border-border-strong bg-surface-2 px-3 py-2.5 text-sm text-text-strong outline-none focus:border-brand"
            />
          </label>
        </div>
      ) : mode === 'waiting' ? (
        <div className="space-y-4">
          <ScoreLine homeName={homeName} awayName={awayName} h={score.home} a={score.away} />
          <p className="flex items-start gap-2 text-sm text-muted">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand" weight="bold" />
            {submission?.status === 'confirmed'
              ? 'Both sides have settled the result. GoalPlace256 is finalizing the official record.'
              : 'The opposing team can confirm or dispute this result before the deadline.'}
          </p>
        </div>
      ) : mode === 'review' ? (
        <div className="space-y-4">
          <ScoreLine homeName={homeName} awayName={awayName} h={score.home} a={score.away} />
          <p className="flex items-start gap-2 text-sm text-[var(--state-disputed)]">
            <Warning className="mt-0.5 h-4 w-4 shrink-0" weight="bold" />
            {submission?.disputeReason ?? 'This result is with the league for review.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <ScoreLine homeName={homeName} awayName={awayName} h={score.home} a={score.away} />
          <p className="flex items-center gap-2 text-sm text-[var(--state-verified)]">
            <SealCheck className="h-4 w-4" weight="fill" />
            Official. Counts toward standings and statistics.
          </p>
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
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block truncate text-xs font-medium text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-14 w-full rounded-[var(--radius-md)] border border-border-strong bg-surface-2 text-center text-2xl font-bold tabular-nums text-text-strong outline-none focus:border-brand"
      />
    </label>
  );
}

function ScoreLine({
  homeName,
  awayName,
  h,
  a,
}: {
  homeName: string;
  awayName: string;
  h: number | null;
  a: number | null;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-4">
      <Row name={homeName} score={h} />
      <div className="my-2 h-px bg-border" />
      <Row name={awayName} score={a} />
    </div>
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
