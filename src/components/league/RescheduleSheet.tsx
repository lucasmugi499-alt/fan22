'use client';

import { useState } from 'react';
import { ArrowRight } from '@phosphor-icons/react';
import { Sheet } from '@/components/ui/Sheet';
import { useAuth } from '@/context/AuthProvider';
import { cn } from '@/lib/utils';

const REASONS = [
  'Venue unavailable',
  'Weather',
  'Opponent request',
  'Competition restructure',
  'Safety or crowd control',
];

/**
 * Moving a fixture, shown as a move.
 *
 * A date field that simply overwrites the old value tells the League Admin nothing about what
 * they are about to do, and tells the clubs nothing about what happened. The old kickoff stays
 * on screen beside the new one, the reason is required rather than optional, and the server
 * writes both into a history entry the match keeps.
 */
export function RescheduleSheet({
  open,
  matchId,
  matchLabel,
  currentScheduledAt,
  currentVenue,
  onClose,
  onRescheduled,
}: {
  open: boolean;
  matchId: string;
  matchLabel: string;
  currentScheduledAt: string;
  currentVenue?: string | null;
  onClose: () => void;
  onRescheduled?: () => void;
}) {
  const { currentUser, isDemoMode } = useAuth();
  const [scheduledAt, setScheduledAt] = useState('');
  const [venue, setVenue] = useState(currentVenue ?? '');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = Boolean(scheduledAt) && reason.trim().length >= 4;

  const format = (value: string) => new Intl.DateTimeFormat('en-UG', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala',
  }).format(new Date(value));

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      if (isDemoMode || !currentUser) {
        setError('Demo sessions cannot reschedule a fixture. This changes a real competition.');
        return;
      }
      const token = await currentUser.getIdToken();
      const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/reschedule`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          scheduledAt: new Date(scheduledAt).toISOString(),
          ...(venue.trim() && venue.trim() !== currentVenue ? { venue: venue.trim() } : {}),
          reason: reason.trim(),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'The fixture could not be rescheduled.');
      onRescheduled?.();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The fixture could not be rescheduled.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      mobileFullScreen
      title="Reschedule fixture"
      description={matchLabel}
    >
      <div className="space-y-4">
        {/* The move, as a move: the old kickoff does not disappear when the new one is chosen. */}
        <div className="rounded-[var(--radius-md)] border border-border bg-surface-1 p-3">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Current</p>
              <p className="mt-0.5 text-sm font-semibold text-text-strong">{format(currentScheduledAt)}</p>
              {currentVenue ? <p className="text-xs text-muted">{currentVenue}</p> : null}
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-subtle" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">New</p>
              <p className={cn('mt-0.5 text-sm font-semibold',
                scheduledAt ? 'text-brand' : 'text-subtle')}>
                {scheduledAt ? format(scheduledAt) : 'Not chosen'}
              </p>
              {venue && venue !== currentVenue ? <p className="text-xs text-muted">{venue}</p> : null}
            </div>
          </div>
        </div>

        <label className="block text-sm font-medium text-text">
          New kickoff
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
            className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong"
          />
        </label>

        <label className="block text-sm font-medium text-text">
          Venue
          <input
            value={venue}
            onChange={(event) => setVenue(event.target.value)}
            className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong"
          />
        </label>

        <fieldset>
          <legend className="text-sm font-medium text-text">Reason</legend>
          <p className="mt-0.5 text-xs leading-5 text-muted">
            Clubs are told why their fixture moved, and it stays on the match history.
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
          {submitting ? 'Rescheduling…' : 'Reschedule fixture'}
        </button>
      </div>
    </Sheet>
  );
}
