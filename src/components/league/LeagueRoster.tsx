'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Sheet } from '@/components/ui/Sheet';
import { RegisterAthleteSheet } from '@/components/league/RegisterAthleteSheet';
import { useAuth } from '@/context/AuthProvider';
import { athleteLegalName, athleteRegisteredPosition } from '@/lib/athleteIdentity';
import { summariseRoster, type RosterAction } from '@/lib/league/roster';
import type { Athlete, Team } from '@/types';
import { cn } from '@/lib/utils';

const ACTION_LABELS: Record<RosterAction, string> = {
  set_number: 'Change number',
  set_position: 'Change registered position',
  transfer: 'Transfer to another club',
  suspend: 'Suspend registration',
  reinstate: 'Lift suspension',
  deactivate: 'Remove from active roster',
};

/**
 * A club's roster, and the registration operations a League Admin owns.
 *
 * Registration is not participation. A roster says who *may* be selected; whether they played,
 * started, came on or scored is produced by the finalizer from recorded events and appears
 * nowhere here. Every control on this screen writes a registration fact and nothing else.
 */
export function LeagueRoster({
  team,
  athletes,
  leagueTeams,
  onChanged,
}: {
  team: Team;
  athletes: Athlete[];
  leagueTeams: Team[];
  onChanged: () => void;
}) {
  const [subject, setSubject] = useState<Athlete | null>(null);
  const [adding, setAdding] = useState(false);
  const summary = useMemo(
    () => summariseRoster(athletes as unknown as Parameters<typeof summariseRoster>[0]),
    [athletes],
  );

  return (
    <section aria-label="Roster" className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold text-text-strong">Roster</h2>
        <p className="text-sm text-muted">
          {summary.active} active
          {summary.suspended ? <span className="text-[var(--state-pending)]"> · {summary.suspended} suspended</span> : null}
          {summary.registrationIssues ? <span className="text-[var(--state-pending)]"> · {summary.registrationIssues} needs review</span> : null}
          {summary.unclaimed ? <span className="text-muted"> · {summary.unclaimed} unclaimed</span> : null}
        </p>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="ml-auto min-h-11 rounded-[var(--radius-md)] border border-brand px-3.5 text-sm font-semibold text-brand"
        >
          Add athlete
        </button>
      </div>

      <RegisterAthleteSheet
        open={adding}
        teams={leagueTeams}
        defaultTeamId={team.id}
        onClose={() => setAdding(false)}
        onRegistered={onChanged}
      />

      {athletes.length ? (
        <ul className="divide-y divide-border border-y border-border">
          {athletes.map((athlete) => {
            const status = (athlete as { rosterStatus?: string }).rosterStatus ?? 'active';
            const number = (athlete as { squadNumber?: number }).squadNumber;
            return (
              <li key={athlete.id} className="flex min-h-[68px] items-center gap-3 py-2.5">
                <span
                  data-numeric
                  className="w-8 shrink-0 text-center text-sm font-bold tabular-nums text-subtle"
                >
                  {number ? `#${number}` : '—'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-text-strong">{athleteLegalName(athlete)}</p>
                  <p className="truncate text-xs text-muted">
                    {athleteRegisteredPosition(athlete)}
                    {status !== 'active' ? ` · ${status}` : ''}
                    {!athlete.userId ? ' · unclaimed' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSubject(athlete)}
                  className="min-h-11 shrink-0 rounded-[var(--radius-md)] border border-border px-3 text-sm font-semibold text-text-strong hover:border-border-strong"
                >
                  Manage
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center">
          <p className="text-base font-semibold text-text-strong">No athletes registered to {team.name}.</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted">
            Register athletes to this club so they can be selected and appear in match lineups.
          </p>
        </div>
      )}

      <RosterActionSheet
        athlete={subject}
        leagueTeams={leagueTeams.filter((entry) => entry.id !== team.id)}
        onClose={() => setSubject(null)}
        onChanged={onChanged}
      />
    </section>
  );
}

/**
 * One registration operation at a time, with its reason.
 *
 * Grouped as a sheet rather than inline controls because several of these are consequential —
 * a transfer is recorded against both clubs and a suspension is told to the athlete — and a
 * row of small buttons on a phone is how the wrong one gets pressed.
 */
function RosterActionSheet({
  athlete,
  leagueTeams,
  onClose,
  onChanged,
}: {
  athlete: Athlete | null;
  leagueTeams: Team[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { currentUser, isDemoMode } = useAuth();
  const [action, setAction] = useState<RosterAction>('set_number');
  const [squadNumber, setSquadNumber] = useState('');
  const [registeredPosition, setRegisteredPosition] = useState('');
  const [toTeamId, setToTeamId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = (athlete as { rosterStatus?: string } | null)?.rosterStatus ?? 'active';
  const available: RosterAction[] = status === 'suspended'
    ? ['reinstate', 'set_number', 'set_position', 'transfer', 'deactivate']
    : ['set_number', 'set_position', 'transfer', 'suspend', 'deactivate'];

  const needsReason = action === 'transfer' || action === 'suspend';
  const ready = Boolean(athlete)
    && (action !== 'set_number' || Boolean(squadNumber))
    && (action !== 'set_position' || registeredPosition.trim().length >= 2)
    && (action !== 'transfer' || Boolean(toTeamId))
    && (!needsReason || reason.trim().length >= 4);

  async function submit() {
    if (!athlete) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isDemoMode || !currentUser) {
        setError('Demo sessions cannot change a roster. This writes to a real competition.');
        return;
      }
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/league/roster', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          athleteId: athlete.id,
          action,
          ...(action === 'set_number' ? { squadNumber: Number(squadNumber) } : {}),
          ...(action === 'set_position' ? { registeredPosition: registeredPosition.trim() } : {}),
          ...(action === 'transfer' ? { toTeamId } : {}),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'The roster change was refused.');
      toast.success(body.summary ?? 'Roster updated.');
      onChanged();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The roster change was refused.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={Boolean(athlete)}
      onClose={onClose}
      mobileFullScreen
      title={athlete ? athleteLegalName(athlete) : 'Roster'}
      description="Registration only. Match performance is produced by the finalizer and cannot be edited here."
    >
      <div className="space-y-4">
        <label className="block text-sm font-medium text-text">
          Operation
          <select
            value={action}
            onChange={(event) => setAction(event.target.value as RosterAction)}
            className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong"
          >
            {available.map((entry) => (
              <option key={entry} value={entry}>{ACTION_LABELS[entry]}</option>
            ))}
          </select>
        </label>

        {action === 'set_number' ? (
          <label className="block text-sm font-medium text-text">
            Squad number
            <input
              type="number"
              min={1}
              max={99}
              value={squadNumber}
              onChange={(event) => setSquadNumber(event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong"
            />
          </label>
        ) : null}

        {action === 'set_position' ? (
          <label className="block text-sm font-medium text-text">
            Registered position
            <input
              value={registeredPosition}
              onChange={(event) => setRegisteredPosition(event.target.value)}
              placeholder="Midfielder"
              className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong placeholder:text-subtle"
            />
            <span className="mt-1.5 block text-xs leading-5 text-muted">
              What the league registered them as. A preferred position is theirs to state on
              their own profile.
            </span>
          </label>
        ) : null}

        {action === 'transfer' ? (
          <label className="block text-sm font-medium text-text">
            Transfer to
            <select
              value={toTeamId}
              onChange={(event) => setToTeamId(event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong"
            >
              <option value="">Choose a club…</option>
              {leagueTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
            <span className="mt-1.5 block text-xs leading-5 text-muted">
              Their squad number does not travel; it belongs to the squad they are leaving.
            </span>
          </label>
        ) : null}

        {needsReason ? (
          <label className="block text-sm font-medium text-text">
            Reason
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={action === 'suspend' ? 'Disciplinary panel outcome' : 'Club transfer agreed'}
              className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong placeholder:text-subtle"
            />
          </label>
        ) : null}

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
          {submitting ? 'Applying…' : ACTION_LABELS[action]}
        </button>
      </div>
    </Sheet>
  );
}
