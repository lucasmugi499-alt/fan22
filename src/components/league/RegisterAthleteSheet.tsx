'use client';

import { useState } from 'react';
import { CheckCircle, Copy } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Sheet } from '@/components/ui/Sheet';
import { useAuth } from '@/context/AuthProvider';
import { diagnoseDeliveryFailure } from '@/lib/platform/deliveryDiagnosis';
import type { Team } from '@/types';
import { cn } from '@/lib/utils';

type Created = {
  id: string;
  actionUrl: string;
  emailDelivery?: string;
  emailError?: string;
};

const AGE_GROUPS = ['U18', 'U21', 'Senior'] as const;

/**
 * Registering an athlete, and inviting them to claim the profile.
 *
 * One act, deliberately. The league creates the sporting record — the registered name, the
 * club, the position it registered them in — and the invitation is what later lets the athlete
 * claim the persona beside it. Splitting these into two screens is how leagues end up with
 * rosters full of records nobody can ever claim.
 *
 * The claim link is always shown, not only when email fails. Email in this market is the least
 * reliable channel a league has, and a link they can send over WhatsApp is often the one that
 * actually reaches the athlete.
 */
export function RegisterAthleteSheet({
  open,
  teams,
  defaultTeamId,
  onClose,
  onRegistered,
}: {
  open: boolean;
  teams: Team[];
  defaultTeamId?: string;
  onClose: () => void;
  onRegistered?: () => void;
}) {
  const { currentUser, isDemoMode } = useAuth();
  const [teamId, setTeamId] = useState(defaultTeamId ?? '');
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [ageGroup, setAgeGroup] = useState<(typeof AGE_GROUPS)[number]>('Senior');
  const [invitedEmail, setInvitedEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  const ready = Boolean(teamId) && name.trim().length >= 2
    && position.trim().length >= 1 && /.+@.+\..+/.test(invitedEmail);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      if (isDemoMode || !currentUser) {
        setError('Demo sessions cannot register an athlete. This creates a real sporting record.');
        return;
      }
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/athletes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          teamId,
          name: name.trim(),
          position: position.trim(),
          ageGroup,
          invitedEmail: invitedEmail.trim(),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'The athlete could not be registered.');
      setCreated(body as Created);
      onRegistered?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The athlete could not be registered.');
    } finally {
      setSubmitting(false);
    }
  }

  function close() {
    setCreated(null);
    setName('');
    setPosition('');
    setInvitedEmail('');
    setError(null);
    onClose();
  }

  const claimUrl = created
    ? new URL(created.actionUrl, window.location.origin).toString()
    : '';
  const deliveryFailed = created?.emailDelivery && created.emailDelivery !== 'sent';
  const diagnosis = deliveryFailed ? diagnoseDeliveryFailure(created?.emailError) : null;

  return (
    <Sheet
      open={open}
      onClose={close}
      mobileFullScreen
      title={created ? 'Athlete registered' : 'Register athlete'}
      description={created ? 'Send them the claim link.' : 'The league creates the sporting record.'}
    >
      {created ? (
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm leading-6 text-text">
            <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--state-verified)]" weight="fill" />
            <span>
              <span className="font-semibold text-text-strong">{name}</span> is registered and can
              be selected. Their profile stays unclaimed until they accept.
            </span>
          </p>

          {diagnosis ? (
            <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--state-pending),transparent_55%)] p-3">
              <p className="text-sm font-semibold leading-6 text-[var(--state-pending)]">
                The invitation email did not send.
              </p>
              <p className="mt-1 text-sm leading-6 text-text">{diagnosis.summary}</p>
              <p className="mt-1 text-sm leading-6 text-muted">
                The registration is unaffected. Send the link below instead.
              </p>
            </div>
          ) : null}

          {/*
            Always shown. Email is the least reliable channel a grassroots league has, and a
            link they can paste into WhatsApp is usually the one that reaches the athlete.
          */}
          <div className="rounded-[var(--radius-md)] border border-border bg-surface-1 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Claim link</p>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(claimUrl);
                  toast.success('Claim link copied.');
                }}
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand"
              >
                <Copy className="h-4 w-4" /> Copy
              </button>
            </div>
            <p className="mt-1 break-all font-mono text-xs text-text-strong">{claimUrl}</p>
          </div>

          <p className="text-xs leading-5 text-muted">
            Claiming links their account to this record. It does not give them any authority
            over their own statistics, which stay produced by the finalizer.
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
          <label className="block text-sm font-medium text-text">
            Club
            <select
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong"
            >
              <option value="">Choose a club…</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>

          <label className="block text-sm font-medium text-text">
            Registered name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Emmanuel Okello"
              className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong placeholder:text-subtle"
            />
            <span className="mt-1.5 block text-xs leading-5 text-muted">
              The name that appears beside their verified record. A nickname is theirs to set on
              their own profile.
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-text">
              Registered position
              <input
                value={position}
                onChange={(event) => setPosition(event.target.value)}
                placeholder="Forward"
                className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong placeholder:text-subtle"
              />
            </label>
            <label className="block text-sm font-medium text-text">
              Age group
              <select
                value={ageGroup}
                onChange={(event) => setAgeGroup(event.target.value as (typeof AGE_GROUPS)[number])}
                className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong"
              >
                {AGE_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
              </select>
            </label>
          </div>

          <label className="block text-sm font-medium text-text">
            Invitation email
            <input
              type="email"
              value={invitedEmail}
              onChange={(event) => setInvitedEmail(event.target.value)}
              placeholder="athlete@example.com"
              className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong placeholder:text-subtle"
            />
            <span className="mt-1.5 block text-xs leading-5 text-muted">
              Where the claim invitation is sent. You also get a copyable link, so a failed
              email does not block the registration.
            </span>
          </label>

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
            {submitting ? 'Registering…' : 'Register athlete'}
          </button>
        </div>
      )}
    </Sheet>
  );
}
