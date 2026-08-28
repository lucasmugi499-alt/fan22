'use client';

import { useState } from 'react';
import { CheckCircle, Copy, Warning } from '@phosphor-icons/react';
import { Sheet } from '@/components/ui/Sheet';
import { useAuth } from '@/context/AuthProvider';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type AssignResult = {
  assignmentId: string;
  accessLink: string;
  pin: string;
  accessStartsAt: string;
  accessExpiresAt: string;
  affiliationRecorded: boolean;
};

/**
 * Assigning the person who will record a match.
 *
 * This is the League Admin's central matchday act and it had no interface at all: the
 * capability was in the bundle and the endpoint was implemented, but nothing called it, so a
 * league could schedule a fixture and had no way to put anybody on it.
 *
 * Two things this deliberately does not do. It does not show a hash, a token or a session id —
 * a League Admin needs operational status, not security internals. And it does not present the
 * link and the PIN as one blob to copy: they are issued once, shown once, and meant to travel
 * by different routes, because the split is what makes a forwarded message insufficient on its
 * own.
 */
export function AssignFieldManagerSheet({
  open,
  matchId,
  matchLabel,
  kickoffLabel,
  onClose,
  onAssigned,
}: {
  open: boolean;
  matchId: string;
  matchLabel: string;
  kickoffLabel: string;
  onClose: () => void;
  onAssigned?: () => void;
}) {
  const { currentUser, isDemoMode } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [affiliations, setAffiliations] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssignResult | null>(null);

  const ready = displayName.trim().length >= 2 && phone.trim().length >= 6;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      if (isDemoMode || !currentUser) {
        setError('Demo sessions cannot assign a Field Manager. This issues real match credentials.');
        return;
      }
      const token = await currentUser.getIdToken();
      const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/assignment`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          displayName: displayName.trim(),
          phone: phone.trim(),
          declaredAffiliations: affiliations
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'The assignment was refused.');
      setResult(body as AssignResult);
      onAssigned?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The assignment was refused.');
    } finally {
      setSubmitting(false);
    }
  }

  function close() {
    setResult(null);
    setDisplayName('');
    setPhone('');
    setAffiliations('');
    setError(null);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      mobileFullScreen
      title={result ? 'Field Manager assigned' : 'Assign Field Manager'}
      description={result ? 'Send these two separately.' : matchLabel}
    >
      {result ? (
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm leading-6 text-text">
            <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--state-verified)]" weight="fill" />
            <span>
              {displayName || 'The Field Manager'} can open the match from two hours before kickoff
              until five hours after. Outside that window the link does nothing.
            </span>
          </p>

          {/*
            Shown once and never retrievable. A system that can show you the PIN again is a
            system where a database dump is a set of live match credentials.
          */}
          <SecretRow label="Access link" value={result.accessLink} hint="Send by message." />
          <SecretRow label="PIN" value={result.pin} hint="Send by a different route, for example by voice." />

          <p className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-xs leading-5 text-muted">
            These are shown once. If they are lost, assign again to issue a new pair; the old
            ones stop working.
          </p>

          {result.affiliationRecorded ? (
            <p className="flex items-start gap-2 text-sm leading-6 text-[var(--state-pending)]">
              <Warning className="mt-0.5 h-4 w-4 shrink-0" weight="fill" />
              <span>
                A declared tie to one of these clubs is on the record. The match can still be
                captured; the report will carry the affiliation and a lower data-quality tier.
              </span>
            </p>
          ) : null}

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
          <p className="text-sm leading-6 text-muted">{kickoffLabel}</p>

          <label className="block text-sm font-medium text-text">
            Name
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Joseph Kayemba"
              className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong placeholder:text-subtle"
            />
          </label>

          <label className="block text-sm font-medium text-text">
            Phone
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              placeholder="+256 7XX XXX XXX"
              className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong placeholder:text-subtle"
            />
          </label>

          <label className="block text-sm font-medium text-text">
            Clubs they are involved with
            <span className="ml-1 font-normal text-muted">(optional)</span>
            <input
              value={affiliations}
              onChange={(event) => setAffiliations(event.target.value)}
              placeholder="Team ids, comma separated"
              className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong placeholder:text-subtle"
            />
            <span className="mt-1.5 block text-xs leading-5 text-muted">
              An involved observer is not disqualified. Declaring it keeps the capture labelled
              rather than indistinguishable from a neutral one.
            </span>
          </label>

          {error ? (
            <p className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--state-error),transparent_55%)] p-3 text-sm text-[var(--state-error)]">
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
            {submitting ? 'Assigning…' : 'Assign Field Manager'}
          </button>
        </div>
      )}
    </Sheet>
  );
}

function SecretRow({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface-1 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{label}</p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            toast.success(`${label} copied.`);
          }}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand"
        >
          <Copy className="h-4 w-4" /> Copy
        </button>
      </div>
      <p data-numeric className="mt-1 break-all font-mono text-sm text-text-strong">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}
