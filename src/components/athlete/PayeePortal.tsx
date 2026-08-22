'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusChip } from '@/components/platform/PlatformAdminPrimitives';
import type { PayeeStatus, RedactedPayee } from '@/lib/platform/athletePayee';

/**
 * The athlete's half of the split.
 *
 * Everything else about an athlete on this platform is written by their club. This page is
 * the exception and the reason the rest of the model is safe: the destination of their money
 * is theirs to state, and nobody at the club can state it for them.
 *
 * It is deliberately not a dashboard. There is no profile editing here, no stats, no
 * settings — an athlete does not need an account to exist in the sporting record, and this
 * page exists for the one thing an account is genuinely needed for. Keeping it that small is
 * what stops it drifting back into the athlete self-service surface it replaced.
 *
 * The details are write-only from the browser's point of view: submitted here, never read
 * back. What returns is whether they are on file and whether they have been verified, which
 * is the only thing this page needs to tell anyone.
 */

const STATUS_COPY: Record<PayeeStatus, { title: string; body: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }> = {
  not_started: {
    title: 'No payout details yet',
    body: 'Supporters can back you, but nothing can be paid out until you tell us where it should go.',
    tone: 'warn',
  },
  invited: {
    title: 'Your club has asked you to confirm your payout details',
    body: 'They cannot enter these for you. Add them below and someone at GoalPlace will check them.',
    tone: 'warn',
  },
  submitted: {
    title: 'Waiting to be checked',
    body: 'Your details are with us. Someone other than whoever entered them has to confirm them before any payout can be made — that check is what protects you.',
    tone: 'neutral',
  },
  verified: {
    title: 'Confirmed',
    body: 'Your payout details are on file and confirmed. You can replace them at any time; replacing them starts the check again.',
    tone: 'good',
  },
  rejected: {
    title: 'We could not confirm these details',
    body: 'Check the account name and number and submit them again. If you are unsure, ask your club to contact GoalPlace on your behalf.',
    tone: 'bad',
  },
  suspended: {
    title: 'Payouts are paused',
    body: 'These details have been paused while something is checked. Submitting again restarts the check.',
    tone: 'bad',
  },
};

export function PayeePortal({ athleteId }: { athleteId: string }) {
  const { currentUser, isDemoMode } = useAuth();
  const [payee, setPayee] = useState<RedactedPayee | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ method: 'mobile_money', provider: '', accountName: '', accountIdentifier: '' });

  useEffect(() => {
    if (isDemoMode) return;
    let cancelled = false;
    async function load() {
      try {
        if (!currentUser || typeof currentUser.getIdToken !== 'function') {
          throw new Error('Sign in to see your payout details.');
        }
        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/platform/payee?athleteId=${encodeURIComponent(athleteId)}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? 'Your payout details are unavailable.');
        if (cancelled) return;
        setPayee(body.payee as RedactedPayee);
        setError(null);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Your payout details are unavailable.');
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [athleteId, currentUser, isDemoMode, reloadToken]);

  const submit = useCallback(async () => {
    if (isDemoMode) {
      setError('Demo sessions cannot submit payout details.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (!currentUser || typeof currentUser.getIdToken !== 'function') {
        throw new Error('Sign in to submit your payout details.');
      }
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/platform/payee', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'submit',
          athleteId,
          note: 'Payout details submitted by the athlete or guardian.',
          payoutDetails: {
            method: form.method,
            provider: form.provider.trim(),
            accountName: form.accountName.trim(),
            accountIdentifier: form.accountIdentifier.trim(),
          },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Your details could not be submitted.');
      // Cleared immediately. The browser has no reason to keep an account number in memory
      // once the server has it, and this page never reads one back.
      setForm({ method: 'mobile_money', provider: '', accountName: '', accountIdentifier: '' });
      setReloadToken((token_) => token_ + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your details could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  }, [athleteId, currentUser, form, isDemoMode]);

  if (isDemoMode) {
    return (
      <Card className="p-4">
        <p className="text-sm font-semibold text-text-strong">Demo session</p>
        <p className="mt-1 text-sm text-muted">
          Payout details belong to a real athlete or guardian and are never shown or entered
          in a demo session.
        </p>
      </Card>
    );
  }

  if (error && !payee) return <Card className="p-4"><p className="text-sm text-[var(--state-disputed)]">{error}</p></Card>;
  if (!payee) return <Skeleton className="h-[420px] rounded-[var(--radius-lg)]" />;

  const copy = STATUS_COPY[payee.status];
  const canSubmit = form.provider.trim().length > 1
    && form.accountName.trim().length > 1
    && form.accountIdentifier.trim().length > 3
    && !submitting;

  return (
    <div className="space-y-4">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">Your money</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-strong">Payout details</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Your club manages your sporting profile — your name, position and roster place. This
          is the part only you can set.
        </p>
      </header>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-text-strong">{copy.title}</p>
          <StatusChip label={payee.status} tone={copy.tone} />
        </div>
        <p className="mt-1.5 text-sm leading-6 text-muted">{copy.body}</p>
        {payee.hasDetailsOnFile ? (
          <p className="mt-2 text-xs text-subtle">
            Details are on file. For your safety they are never shown again once submitted —
            not to you, not to your club, and not to GoalPlace staff.
          </p>
        ) : null}
      </Card>

      <Card className="p-4">
        <h2 className="text-[15px] font-semibold text-text-strong">
          {payee.hasDetailsOnFile ? 'Replace your payout details' : 'Add your payout details'}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {payee.hasDetailsOnFile
            ? 'Submitting new details replaces the old ones and starts the check again.'
            : 'These go to the licensed payment provider that moves the money. GoalPlace never holds it.'}
        </p>

        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">Payout method</span>
            <select
              value={form.method}
              onChange={(event) => setForm((current) => ({ ...current, method: event.target.value }))}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text-strong"
            >
              <option value="mobile_money">Mobile money</option>
              <option value="bank">Bank account</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">
              {form.method === 'mobile_money' ? 'Network' : 'Bank'}
            </span>
            <input
              type="text"
              value={form.provider}
              onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text-strong"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">Account name</span>
            <input
              type="text"
              value={form.accountName}
              onChange={(event) => setForm((current) => ({ ...current, accountName: event.target.value }))}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text-strong"
            />
            <span className="mt-1 block text-xs text-subtle">The name registered on the account.</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">
              {form.method === 'mobile_money' ? 'Phone number' : 'Account number'}
            </span>
            <input
              type="text"
              inputMode={form.method === 'mobile_money' ? 'tel' : 'numeric'}
              autoComplete="off"
              value={form.accountIdentifier}
              onChange={(event) => setForm((current) => ({ ...current, accountIdentifier: event.target.value }))}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text-strong"
            />
          </label>
        </div>

        {error ? <p className="mt-3 text-sm text-[var(--state-disputed)]">{error}</p> : null}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void submit()}
          className="mt-4 min-h-11 w-full rounded-[var(--radius-md)] bg-brand px-4 text-sm font-semibold text-on-brand disabled:opacity-40"
        >
          {submitting ? 'Submitting…' : 'Submit for checking'}
        </button>
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-brand" weight="fill" />
          <h2 className="text-[15px] font-semibold text-text-strong">Why your club cannot do this for you</h2>
        </div>
        <p className="text-sm leading-6 text-muted">
          Your club can add you to a roster and manage your sporting profile, and they can ask
          you to add your payout details. They cannot enter or change them, and neither can
          the person at GoalPlace who checks them — those are two different people on purpose.
          It means nobody can quietly point your supporters&rsquo; money somewhere else.
        </p>
      </Card>
    </div>
  );
}
