'use client';

import { useState } from 'react';
import { Warning } from '@phosphor-icons/react';
import { Sheet } from '@/components/ui/Sheet';
import { useAuth } from '@/context/AuthProvider';
import { cn } from '@/lib/utils';

const REASONS = [
  'Field Manager device failed',
  'Field Manager absent',
  'Field Manager unable to continue',
  'Operational emergency',
];

/**
 * Seizing a live match when the person recording it cannot continue.
 *
 * Deliberately not an ordinary button. A takeover displaces the only person who was actually
 * watching, and everything it does is irreversible: the previous session is revoked, the
 * generation increments, and the events already recorded stay in the match's history under the
 * operator who recorded them.
 *
 * So this sheet states the consequences before it offers the control, and requires a reason,
 * because a reviewer six weeks later needs to know whether this was a dead battery or a
 * disagreement about a goal.
 */
export function EmergencyTakeoverSheet({
  open,
  matchId,
  matchLabel,
  fieldManagerName,
  onClose,
  onTakenOver,
}: {
  open: boolean;
  matchId: string;
  matchLabel: string;
  fieldManagerName?: string | null;
  onClose: () => void;
  onTakenOver?: () => void;
}) {
  const { currentUser, isDemoMode } = useAuth();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ sessionGeneration: number } | null>(null);

  const ready = reason.trim().length >= 5;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      if (isDemoMode || !currentUser) {
        setError('Demo sessions cannot take over a match. This revokes a real operator session.');
        return;
      }
      const token = await currentUser.getIdToken();
      const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/takeover`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'The takeover could not be completed.');
      setDone({ sessionGeneration: body.sessionGeneration });
      onTakenOver?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The takeover could not be completed.');
    } finally {
      setSubmitting(false);
    }
  }

  function close() {
    setDone(null);
    setReason('');
    setError(null);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      mobileFullScreen
      title={done ? 'You are running this match' : 'Emergency takeover'}
      description={matchLabel}
    >
      {done ? (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-text">
            The previous device can no longer record events. You are on session generation{' '}
            <span className="font-semibold text-text-strong">{done.sessionGeneration}</span>.
          </p>
          <p className="text-sm leading-6 text-muted">
            Events already recorded stay in this match&rsquo;s history, attributed to whoever
            recorded them. Anything the old device sends now is quarantined for review rather
            than merged into the official stream.
          </p>
          <button
            type="button"
            onClick={close}
            className="min-h-11 w-full rounded-[var(--radius-md)] bg-brand px-4 text-sm font-semibold text-[var(--on-brand)] hover:bg-brand-hover"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* The consequences, before the control. */}
          <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--state-error),transparent_55%)] p-3">
            <p className="flex items-start gap-2 text-sm font-semibold leading-6 text-[var(--state-error)]">
              <Warning className="mt-0.5 h-4 w-4 shrink-0" weight="fill" />
              This starts a new audited match-operations session.
            </p>
            <ul className="mt-2 space-y-1.5 text-sm leading-6 text-text">
              <li>
                {fieldManagerName
                  ? <>{fieldManagerName}&rsquo;s session is revoked. Their device stops recording immediately.</>
                  : <>The current operator session is revoked and that device stops recording immediately.</>}
              </li>
              <li>Events already recorded stay in the match history, attributed to them.</li>
              <li>Anything their device sends afterwards is quarantined, not merged.</li>
              <li>This cannot be undone. Handing the match back means another takeover.</li>
            </ul>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-text">Why are you taking over?</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {REASONS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={reason === preset}
                  onClick={() => setReason(preset)}
                  className={cn(
                    'min-h-11 rounded-full border px-3.5 text-sm font-medium transition',
                    reason === preset
                      ? 'border-brand bg-brand-subtle text-brand'
                      : 'border-border text-muted hover:text-text-strong',
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Or describe what happened"
              className="mt-2 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong placeholder:text-subtle"
            />
          </fieldset>

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
                ? 'bg-[var(--state-error)] text-white hover:opacity-90'
                : 'cursor-not-allowed bg-surface-3 text-subtle',
            )}
          >
            {submitting ? 'Taking over…' : 'Take over this match'}
          </button>
        </div>
      )}
    </Sheet>
  );
}
