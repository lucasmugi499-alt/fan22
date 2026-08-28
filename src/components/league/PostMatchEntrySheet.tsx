'use client';

import { useState } from 'react';
import { Info } from '@phosphor-icons/react';
import { Sheet } from '@/components/ui/Sheet';
import { useAuth } from '@/context/AuthProvider';
import { capturePolicyCopy } from '@/lib/league/operations';
import { permitsPostMatchEntry, requiresFallbackReason, type CapturePolicy } from '@/lib/capturePolicy';
import { cn } from '@/lib/utils';

/**
 * Typing in a result after the match, where the competition permits it.
 *
 * Offered last and framed as the fallback it is. Field capture produces a verified event
 * stream; a typed score is one person's recollection of the outcome, and the data-quality tier
 * on the result says so. The sheet says so too, before the operator commits, because a result
 * that looks equivalent to a captured one is how a league quietly stops bothering to capture.
 *
 * The policy gate is the server's, not this component's. What this does is explain the refusal
 * in advance rather than let an admin fill in a form that was never going to be accepted.
 */
export function PostMatchEntrySheet({
  open,
  matchId,
  matchLabel,
  homeTeamName,
  awayTeamName,
  capturePolicy,
  onClose,
  onEntered,
}: {
  open: boolean;
  matchId: string;
  matchLabel: string;
  homeTeamName: string;
  awayTeamName: string;
  capturePolicy: CapturePolicy;
  onClose: () => void;
  onEntered?: () => void;
}) {
  const { currentUser, isDemoMode } = useAuth();
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = permitsPostMatchEntry(capturePolicy);
  const reasonRequired = requiresFallbackReason(capturePolicy);
  const copy = capturePolicyCopy(capturePolicy);

  const ready = allowed
    && homeScore !== '' && awayScore !== ''
    && (!reasonRequired || reason.trim().length >= 4);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      if (isDemoMode || !currentUser) {
        setError('Demo sessions cannot enter a result. This writes to a real competition.');
        return;
      }
      const token = await currentUser.getIdToken();
      const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/post-match-entry`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          homeScore: Number(homeScore),
          awayScore: Number(awayScore),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'The result could not be entered.');
      onEntered?.();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The result could not be entered.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      mobileFullScreen
      title="Enter post-match result"
      description={matchLabel}
    >
      <div className="space-y-4">
        {/*
          What this competition's policy actually permits, in words, before anything is typed.
        */}
        <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
          <p className="text-sm font-semibold text-text-strong">{copy.title}</p>
          <p className="mt-1 text-sm leading-6 text-muted">{copy.detail}</p>
        </div>

        {!allowed ? (
          <p className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--state-error),transparent_55%)] p-3 text-sm leading-6 text-[var(--state-error)]">
            This competition requires the match to be captured on the pitch. Assign a Field
            Manager, or raise an emergency override with Platform.
          </p>
        ) : null}

        {allowed ? (
          <>
            {/* Stated before the fields, not after the submit. */}
            <p className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--state-pending),transparent_60%)] p-3 text-sm leading-6 text-text">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--state-pending)]" weight="fill" />
              <span>
                This result will be recorded as <strong>League post-match entry</strong> with
                limited data quality. Participation, minutes and event detail will not be
                available, and it will never read as a live capture.
              </span>
            </p>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-text">
                {homeTeamName}
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={homeScore}
                  onChange={(event) => setHomeScore(event.target.value)}
                  className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-center text-lg font-bold tabular-nums text-text-strong"
                />
              </label>
              <label className="block text-sm font-medium text-text">
                {awayTeamName}
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={awayScore}
                  onChange={(event) => setAwayScore(event.target.value)}
                  className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-center text-lg font-bold tabular-nums text-text-strong"
                />
              </label>
            </div>

            <label className="block text-sm font-medium text-text">
              Reason{reasonRequired ? '' : <span className="ml-1 font-normal text-muted">(optional)</span>}
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="No Field Manager was available"
                className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong placeholder:text-subtle"
              />
              {reasonRequired ? (
                <span className="mt-1.5 block text-xs leading-5 text-muted">
                  Field capture is the norm in this competition, so a typed result is an
                  exception somebody has to account for.
                </span>
              ) : null}
            </label>
          </>
        ) : null}

        {error ? (
          <p className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--state-error),transparent_55%)] p-3 text-sm leading-6 text-[var(--state-error)]">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={!ready || submitting}
          onClick={() => void submit()}
          className={cn(
            'min-h-11 w-full rounded-[var(--radius-md)] px-4 text-sm font-semibold transition',
            ready && !submitting
              ? 'bg-brand text-[var(--on-brand)] hover:bg-brand-hover'
              : 'cursor-not-allowed bg-surface-3 text-subtle',
          )}
        >
          {submitting ? 'Recording…' : 'Enter post-match result'}
        </button>
      </div>
    </Sheet>
  );
}
