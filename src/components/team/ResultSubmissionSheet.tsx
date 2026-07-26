'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { SealCheck, Warning, PaperPlaneTilt, ShieldCheck } from '@phosphor-icons/react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/lib/store';
import { canSubmitResultFor } from '@/lib/resultSubmission';
import { isOfficialMatch } from '@/lib/status';
import type { Match, Team } from '@/types';

type Stage = 'idle' | 'finalizing';

/**
 * The result trust chain, made interactive for the demo. A team admin may SUBMIT a score
 * (for a played match with no result) or, when the opponent has submitted, CONFIRM or
 * DISPUTE it. The client never writes `official`: confirming hands off to a simulated
 * finalizer (the server's job), which is what stamps the result official. In mock mode this
 * updates local demo state only; in Firebase mode the real finalizer does the promotion.
 */
export function ResultSubmissionSheet({
  open,
  onClose,
  match,
  home,
  away,
}: {
  open: boolean;
  onClose: () => void;
  match: Match;
  home?: Team;
  away?: Team;
}) {
  const updateDemoMatch = useAppStore((s) => s.updateDemoMatch);
  const [homeScore, setHomeScore] = useState<string>(match.score.home?.toString() ?? '');
  const [awayScore, setAwayScore] = useState<string>(match.score.away?.toString() ?? '');
  const [stage, setStage] = useState<Stage>('idle');

  const hasScore = match.score.home !== null && match.score.away !== null;
  const official = isOfficialMatch(match);
  // Demo framing: if my team submitted, I am awaiting the opponent; otherwise it is my turn
  // to respond. We approximate "submitter" as the home team when no submission record exists.
  const mode: 'submit' | 'respond' | 'view' = official
    ? 'view'
    : hasScore
      ? 'respond'
      : 'submit';

  function submit() {
    const h = Number(homeScore);
    const a = Number(awayScore);
    if (!Number.isFinite(h) || !Number.isFinite(a) || homeScore === '' || awayScore === '') {
      toast.error('Enter a score for both teams.');
      return;
    }
    updateDemoMatch(match.id, {
      status: 'completed',
      score: { home: h, away: a },
      verificationStatus: 'pending',
    });
    toast.success('Result submitted. The opposing team has 72 hours to confirm it.');
    onClose();
  }

  function confirmResult() {
    setStage('finalizing');
    toast('Confirmed. Sending to GoalPlace256 to finalize.');
    // The finalizer is the only actor that may produce an official result. Simulated here.
    setTimeout(() => {
      updateDemoMatch(match.id, { verificationStatus: 'verified' });
      toast.success('Finalized as the official result by GoalPlace256.');
      setStage('idle');
      onClose();
    }, 1100);
  }

  function disputeResult() {
    updateDemoMatch(match.id, { verificationStatus: 'disputed' });
    toast('Dispute raised. The league will review it.');
    onClose();
  }

  const title =
    mode === 'submit' ? 'Submit result' : mode === 'respond' ? 'Confirm the result' : 'Official result';
  const homeName = home?.name ?? 'Home';
  const awayName = away?.name ?? 'Away';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={`${homeName} vs ${awayName}`}
      footer={
        mode === 'submit' ? (
          <Button block icon={PaperPlaneTilt} onClick={submit} disabled={!canSubmitResultFor(match)}>
            Submit result
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
        ) : null
      }
    >
      {mode === 'submit' ? (
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
          <ScoreLine homeName={homeName} awayName={awayName} h={match.score.home} a={match.score.away} />
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
        </div>
      ) : (
        <div className="space-y-4">
          <ScoreLine homeName={homeName} awayName={awayName} h={match.score.home} a={match.score.away} />
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
