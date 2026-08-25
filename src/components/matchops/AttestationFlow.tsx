'use client';

import { useState } from 'react';
import type { MatchPackage } from '@/lib/matchOps/package';

const ATTESTATION = 'I confirm this report represents my field record of the match.';

/**
 * Full time. Declare, reconcile, review, attest.
 *
 * The order matters more than anything else on this screen. The Field Manager is asked for the
 * final score BEFORE they are shown the one the events produce, because a score reconstructed
 * from captured events reconciles perfectly with itself by construction. A goal nobody tapped
 * is not an inconsistency, it is simply absent, and every validation gate passes.
 *
 * Asking one independent question is the only omission detector field capture gets, and it
 * costs one screen. Show the reconstructed score first and the answer becomes "whatever it
 * already says", which detects nothing.
 */
export function AttestationFlow(props: {
  matchId: string;
  pack: MatchPackage;
  pendingCount: number;
  authed: (path: string, init?: RequestInit) => Promise<Record<string, unknown>>;
  onBack: () => void;
}) {
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [step, setStep] = useState<'declare' | 'result'>('declare');
  const [result, setResult] = useState<{ reconstructed: { home: number; away: number }; exceptions: string[]; underReview: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body = await props.authed(`/api/match-ops/${encodeURIComponent(props.matchId)}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          declaredHomeScore: Number(home),
          declaredAwayScore: Number(away),
          attestationText: ATTESTATION,
          unsyncedCount: props.pendingCount,
        }),
      });
      setResult(body as never);
      setStep('result');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The report could not be submitted.');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'result' && result) {
    const matches = result.reconstructed.home === Number(home) && result.reconstructed.away === Number(away);
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-6 text-center">
        <h1 className="text-2xl font-semibold text-text-strong">
          {matches ? 'Report submitted' : 'Report submitted for review'}
        </h1>
        <p className="font-mono text-4xl tabular-nums text-brand">
          {result.reconstructed.home} - {result.reconstructed.away}
        </p>
        <p className="text-sm text-muted">
          {matches
            ? 'Your record and the events agree. Nothing else is needed from you.'
            : `You declared ${home}-${away} and the events add up to ${result.reconstructed.home}-${result.reconstructed.away}. Your league will look at both.`}
        </p>
        {result.exceptions.length ? (
          <p className="rounded-xl border border-state-pending/30 bg-state-pending/10 px-3 py-2 text-xs text-state-pending">
            Flagged for your league: {result.exceptions.join(', ').replaceAll('_', ' ')}
          </p>
        ) : null}
        <p className="text-xs text-muted">You can close this page.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">
      <header className="text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand">Full time</p>
        <h1 className="mt-3 text-2xl font-semibold text-text-strong">What was the final score?</h1>
        <p className="mt-2 text-sm text-muted">
          Enter it from memory or from the referee. We will compare it with what you recorded.
        </p>
      </header>

      <div className="flex items-center justify-center gap-4">
        <label className="flex flex-1 flex-col gap-2 text-center">
          <span className="truncate text-xs text-muted">{props.pack.homeTeam.name}</span>
          <input
            value={home}
            onChange={(changeEvent) => setHome(changeEvent.target.value.replace(/\D/g, '').slice(0, 3))}
            inputMode="numeric"
            placeholder="0"
            className="min-h-20 w-full rounded-2xl border border-white/10 bg-surface-2 text-center font-mono text-4xl text-text-strong outline-none focus-visible:border-brand"
          />
        </label>
        <span className="pt-6 text-2xl text-muted">-</span>
        <label className="flex flex-1 flex-col gap-2 text-center">
          <span className="truncate text-xs text-muted">{props.pack.awayTeam.name}</span>
          <input
            value={away}
            onChange={(changeEvent) => setAway(changeEvent.target.value.replace(/\D/g, '').slice(0, 3))}
            inputMode="numeric"
            placeholder="0"
            className="min-h-20 w-full rounded-2xl border border-white/10 bg-surface-2 text-center font-mono text-4xl text-text-strong outline-none focus-visible:border-brand"
          />
        </label>
      </div>

      {props.pendingCount > 0 ? (
        <p className="rounded-xl border border-state-pending/30 bg-state-pending/10 px-3 py-2 text-center text-xs text-state-pending">
          {props.pendingCount} event{props.pendingCount === 1 ? '' : 's'} have not reached us yet. You can still
          submit; your league will be told they are outstanding.
        </p>
      ) : null}

      <p className="text-center text-xs text-muted">{ATTESTATION}</p>

      {error ? <p role="alert" className="text-center text-sm text-state-disputed">{error}</p> : null}

      <button
        onClick={submit}
        disabled={home === '' || away === '' || busy}
        className="min-h-16 rounded-2xl bg-brand text-lg font-semibold text-black transition active:scale-[0.98] disabled:opacity-40"
      >
        {busy ? 'Submitting...' : 'Confirm and submit'}
      </button>

      <button onClick={props.onBack} className="min-h-12 text-sm text-muted">
        Back to the match
      </button>
    </main>
  );
}
