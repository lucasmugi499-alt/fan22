'use client';

import { FormEvent, useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { Button } from '@/components/ui/Button';
import type { FantasyCompetition } from '@/types/fantasy';

export function MiniLeagueCreate({ competitions }: { competitions: FantasyCompetition[] }) {
  const { currentUser, isDemoMode } = useAuth();
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const request = {
      action: 'create',
      competitionId: String(form.get('competitionId')),
      name: String(form.get('name')),
      description: String(form.get('description')),
      visibility: form.get('visibility') === 'public' ? 'public' : 'private',
      approvalRequired: form.get('approvalRequired') === 'on',
      memberLimit: Number(form.get('memberLimit')),
    };
    if (isDemoMode) {
      setMessage('Demo mini-league created. Invite code: DEMO2026');
      setSubmitting(false);
      return;
    }
    if (!currentUser?.getIdToken) {
      setMessage('Sign in and submit a squad before creating a mini-league.');
      setSubmitting(false);
      return;
    }
    const response = await fetch('/api/fantasy/mini-leagues', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${await currentUser.getIdToken()}`,
      },
      body: JSON.stringify(request),
    });
    const result = await response.json().catch(() => null) as { error?: string; inviteCode?: string } | null;
    setMessage(response.ok
      ? `Mini-league created. Invite code: ${result?.inviteCode}`
      : result?.error ?? 'Could not create the mini-league.');
    setSubmitting(false);
  }

  return (
    <form onSubmit={create} className="mt-10 border border-border bg-surface-1 p-5">
      <h2 className="text-lg font-bold text-text-strong">Create a free mini-league</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-muted">Competition
          <select name="competitionId" required className="mt-2 min-h-11 w-full border border-border bg-surface-2 px-3 text-text-strong">
            {competitions.map((competition) => <option key={competition.id} value={competition.id}>{competition.shortName}</option>)}
          </select>
        </label>
        <label className="text-sm text-muted">Name
          <input name="name" required minLength={3} maxLength={50} className="mt-2 min-h-11 w-full border border-border bg-surface-2 px-3 text-text-strong" />
        </label>
        <label className="text-sm text-muted sm:col-span-2">Description
          <input name="description" maxLength={180} className="mt-2 min-h-11 w-full border border-border bg-surface-2 px-3 text-text-strong" />
        </label>
        <label className="text-sm text-muted">Visibility
          <select name="visibility" className="mt-2 min-h-11 w-full border border-border bg-surface-2 px-3 text-text-strong">
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
        </label>
        <label className="text-sm text-muted">Member limit
          <input name="memberLimit" type="number" min={2} max={100} defaultValue={40} className="mt-2 min-h-11 w-full border border-border bg-surface-2 px-3 text-text-strong" />
        </label>
      </div>
      <label className="mt-4 flex min-h-11 items-center gap-3 text-sm text-muted">
        <input name="approvalRequired" type="checkbox" defaultChecked className="h-5 w-5 accent-[var(--brand)]" />
        Approve new members before they enter
      </label>
      <Button type="submit" icon={Plus} disabled={submitting} className="mt-4">{submitting ? 'Creating…' : 'Create mini-league'}</Button>
      {message ? <p className="mt-3 text-sm text-muted" role="status">{message}</p> : null}
    </form>
  );
}
