'use client';

import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { useAuth } from '@/context/AuthProvider';
import { cn } from '@/lib/utils';

const REASONS = [
  'Opponent did not turn up',
  'Neither club could field a side',
  'Venue lost and no date could be agreed',
  'Weather, no replay possible',
  'Competition withdrawn or restructured',
];

/**
 * Calling a fixture off, said plainly.
 *
 * Until this sheet existed a fixture that was never played had no honest ending: the league
 * could move it to a date that would also pass, or type in a result for a match nobody played.
 * This is the third door, and the only one that tells the truth about a fixture that did not
 * happen. It is deliberately not reversible from here — a called-off fixture that should have
 * been played is a new fixture, with its own history, not an edit.
 */
export function CancelFixtureSheet({
  open,
  matchId,
  matchLabel,
  scheduledAt,
  onClose,
  onCancelled,
}: {
  open: boolean;
  matchId: string;
  matchLabel: string;
  scheduledAt: string;
  onClose: () => void;
  onCancelled?: () => void;
}) {
  const { currentUser, isDemoMode } = useAuth();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = reason.trim().length >= 4;

  const format = (value: string) => new Intl.DateTimeFormat('en-UG', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala',
  }).format(new Date(value));

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      if (isDemoMode || !currentUser) {
        setError('Demo sessions cannot call off a fixture. This changes a real competition.');
        return;
      }
      const token = await currentUser.getIdToken();
      const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'The fixture could not be called off.');
      onCancelled?.();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The fixture could not be called off.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      mobileFullScreen
      title="Record as not played"
      description={matchLabel}
    >
      <div className="space-y-4">
        <div className="rounded-[var(--radius-md)] border border-border bg-surface-1 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Scheduled for</p>
          <p className="mt-0.5 text-sm font-semibold text-text-strong">{format(scheduledAt)}</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            The fixture stays on the record as called off. It never counts for the table, and
            both clubs stop being asked for an account of it. If it should be played after all,
            create it again as a new fixture.
          </p>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-text">Reason</legend>
          <p className="mt-0.5 text-xs leading-5 text-muted">
            Clubs are told why, and it stays on the match history.
          </p>
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
            placeholder="Or write your own"
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
              ? 'bg-brand text-[var(--on-brand)] hover:bg-brand-hover'
              : 'cursor-not-allowed bg-surface-3 text-subtle',
          )}
        >
          {submitting ? 'Recording…' : 'Record as not played'}
        </button>
      </div>
    </Sheet>
  );
}
