'use client';

import { FormEvent, useState } from 'react';
import { SignIn } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { Button } from '@/components/ui/Button';

export function MiniLeagueJoin({ inviteCode }: { inviteCode: string }) {
  const { currentUser, isDemoMode } = useAuth();
  const [code, setCode] = useState(inviteCode);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function join(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    if (isDemoMode) {
      window.localStorage.setItem(`goalplace:fantasy-mini:${code}`, 'joined');
      setMessage('Joined in this demonstration. Your rank will appear after the next official round.');
      setSubmitting(false);
      return;
    }
    if (!currentUser?.getIdToken) {
      setMessage('Sign in and submit a fantasy squad before joining.');
      setSubmitting(false);
      return;
    }
    const response = await fetch('/api/fantasy/mini-leagues', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${await currentUser.getIdToken()}`,
      },
      body: JSON.stringify({ action: 'join', inviteCode: code }),
    });
    const result = await response.json().catch(() => null) as { error?: string; status?: string } | null;
    setMessage(response.ok
      ? result?.status === 'pending' ? 'Join request sent to the mini-league owner.' : 'You joined this mini-league.'
      : result?.error ?? 'Could not join this mini-league.');
    setSubmitting(false);
  }

  return (
    <form onSubmit={join} className="mt-8 border border-border bg-surface-1 p-4">
      <label htmlFor="mini-league-code" className="text-sm font-semibold text-text-strong">Join with invite code</label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input id="mini-league-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} minLength={6} maxLength={16} required className="min-h-11 flex-1 border border-border bg-surface-2 px-3 font-mono text-sm uppercase text-text-strong outline-none focus:border-brand" />
        <Button type="submit" icon={SignIn} disabled={submitting}>{submitting ? 'Joining…' : 'Join free'}</Button>
      </div>
      {message ? <p className="mt-3 text-sm text-muted" role="status">{message}</p> : null}
    </form>
  );
}
