'use client';

import { useState } from 'react';

/**
 * The whole sign-in, on a phone, in a stadium, two minutes before kickoff.
 *
 * One field, six digits, a numeric keypad. No email, no password, no account creation: the
 * Field Manager is not an account holder, and asking them to become one at the touchline is
 * how a match goes unrecorded.
 *
 * The failure message never varies with the reason. The server refuses identically whether
 * the link is unknown, the window has not opened, the PIN is wrong or the assignment was
 * revoked, and repeating a specific reason here would undo that on the client.
 */
export function PinGate({
  bootstrapSecret,
  onAuthenticated,
}: {
  bootstrapSecret: string;
  onAuthenticated: (sessionToken: string, matchId: string) => Promise<void>;
}) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (pin.length < 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/match-ops/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bootstrapSecret, pin }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'That link or PIN is not valid.');
      await onAuthenticated(body.sessionToken, body.matchId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That link or PIN is not valid.');
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-6">
      <header className="text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand">Match Ops</p>
        <h1 className="mt-3 text-2xl font-semibold text-text-strong">Enter your match PIN</h1>
        <p className="mt-2 text-sm text-muted">
          Your league sent this separately from the link.
        </p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="sr-only" htmlFor="match-pin">Match PIN</label>
        <input
          id="match-pin"
          value={pin}
          onChange={(changeEvent) => setPin(changeEvent.target.value.replace(/\D/g, '').slice(0, 8))}
          // inputMode brings up the numeric keypad on a phone, which is the difference between
          // three taps and finding the numbers row one-handed in the rain.
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="000000"
          className="w-full rounded-2xl border border-white/10 bg-surface-2 px-4 py-5 text-center font-mono text-3xl tracking-[0.4em] text-text-strong outline-none focus-visible:border-brand"
        />

        {error ? (
          <p role="alert" className="text-center text-sm text-state-disputed">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={pin.length < 4 || busy}
          // 56px, comfortably above the 44px tap minimum, because this is pressed with a thumb
          // by somebody who is already late.
          className="min-h-14 w-full rounded-2xl bg-brand px-5 text-base font-semibold text-black transition active:scale-[0.98] disabled:opacity-40"
        >
          {busy ? 'Checking...' : 'Start'}
        </button>
      </form>

      <p className="text-center text-xs text-muted">
        Trouble getting in? Ask your league to send a new link.
      </p>
    </main>
  );
}
