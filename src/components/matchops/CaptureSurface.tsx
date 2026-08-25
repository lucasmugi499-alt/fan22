'use client';

import { useEffect, useState } from 'react';
import type { MatchPackage, PackageAthlete } from '@/lib/matchOps/package';
import type { CapturePayload } from './MatchOpsClient';

/**
 * The football capture palette.
 *
 * Deliberately short. Assists, shots, corners and saves are tempting because professional
 * systems collect them, and one observer with a phone cannot capture them accurately while
 * also running the clock. Data collected badly is worse than data not collected: it poisons
 * fantasy and it is invisible in aggregate, because a missing assist looks exactly like a goal
 * that had none.
 */
const PALETTE = [
  { type: 'football.goal', label: 'Goal', tone: 'brand', needsAthlete: true },
  { type: 'football.own_goal', label: 'Own goal', tone: 'muted', needsAthlete: true },
  { type: 'football.penalty_scored', label: 'Penalty scored', tone: 'brand', needsAthlete: true },
  { type: 'football.penalty_missed', label: 'Penalty missed', tone: 'muted', needsAthlete: true },
  { type: 'football.yellow_card', label: 'Yellow card', tone: 'warn', needsAthlete: true },
  { type: 'football.second_yellow_card', label: 'Second yellow', tone: 'warn', needsAthlete: true },
  { type: 'football.red_card', label: 'Red card', tone: 'danger', needsAthlete: true },
  { type: 'football.substitution_on', label: 'Sub on', tone: 'muted', needsAthlete: true },
  { type: 'football.substitution_off', label: 'Sub off', tone: 'muted', needsAthlete: true },
] as const;

const UNDO_WINDOW_MS = 8_000;

type Team = MatchPackage['homeTeam'];

export function CaptureSurface(props: {
  pack: MatchPackage;
  teams: Team[];
  clock: { state: string; period: string; version: number };
  clockLabel: string;
  gameClockMs: number;
  online: boolean;
  pendingCount: number;
  error: string | null;
  onCapture: (event: CapturePayload) => Promise<{ clientEventId: string } | null>;
  onUndo: (clientEventId: string, event: CapturePayload) => Promise<void>;
  onClock: (action: Record<string, unknown>) => Promise<void>;
  onFullTime: () => void;
}) {
  const [picking, setPicking] = useState<(typeof PALETTE)[number] | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [recent, setRecent] = useState<{ label: string; clock: string; clientEventId: string; event: CapturePayload }[]>([]);
  const [undoable, setUndoable] = useState<{ clientEventId: string; event: CapturePayload } | null>(null);

  // The undo window closes on its own. A control that stayed available would turn "I tapped
  // the wrong player" into "I changed my mind at half time", which is a different act and
  // needs a reason attached.
  useEffect(() => {
    if (!undoable) return;
    const timer = window.setTimeout(() => setUndoable(null), UNDO_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [undoable]);

  async function record(athlete: PackageAthlete | null) {
    if (!picking || !team) return;
    const event: CapturePayload = {
      eventType: picking.type,
      teamId: team.teamId,
      athleteId: athlete?.athleteId ?? null,
      period: props.clock.period,
      // Taken from the derived clock, never typed. The app already knows the time.
      gameClockMs: props.gameClockMs,
    };
    const entry = await props.onCapture(event);
    if (entry) {
      setRecent((rows) => [{
        label: `${picking.label}${athlete ? ` · ${athlete.registeredName}` : ''}`,
        clock: props.clockLabel,
        clientEventId: entry.clientEventId,
        event,
      }, ...rows].slice(0, 12));
      setUndoable({ clientEventId: entry.clientEventId, event });
    }
    setPicking(null);
    setTeam(null);
  }

  const running = props.clock.state === 'running';
  const notStarted = props.clock.state === 'not_started';

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 px-4 pb-6 pt-4">
      <header className="rounded-2xl border border-white/10 bg-surface-2 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-semibold text-text-strong">{props.pack.homeTeam.name}</span>
          <span data-numeric className="font-mono text-3xl tabular-nums text-brand">{props.clockLabel}</span>
          <span className="truncate text-right text-sm font-semibold text-text-strong">{props.pack.awayTeam.name}</span>
        </div>
        <p className="mt-2 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          Period {props.clock.period} · {props.clock.state.replace('_', ' ')}
        </p>
      </header>

      {/*
        Operational information, not decoration. A Field Manager who has been offline for forty
        minutes with sixty queued events needs to know before full time, not after, and so does
        the league watching the same indicator from the other side.
      */}
      <p
        role="status"
        className={`rounded-xl px-3 py-2 text-center text-xs ${
          props.online && props.pendingCount === 0
            ? 'bg-white/5 text-muted'
            : 'border border-state-pending/30 bg-state-pending/10 text-state-pending'
        }`}
      >
        {props.online
          ? props.pendingCount > 0
            ? `Syncing ${props.pendingCount} event${props.pendingCount === 1 ? '' : 's'}...`
            : 'All events synced'
          : `Offline · ${props.pendingCount} event${props.pendingCount === 1 ? '' : 's'} saved on this phone`}
      </p>

      {props.error ? (
        <p role="alert" className="rounded-xl border border-state-disputed/30 bg-state-disputed/10 px-3 py-2 text-xs text-state-disputed">
          {props.error}
        </p>
      ) : null}

      {notStarted ? (
        <button
          onClick={() => props.onClock({ action: 'start' })}
          className="min-h-16 rounded-2xl bg-brand text-lg font-semibold text-black transition active:scale-[0.98]"
        >
          Start match
        </button>
      ) : (
        <button
          onClick={() => setPicking(PALETTE[0])}
          disabled={props.clock.state === 'full_time'}
          className="min-h-20 rounded-2xl bg-brand text-xl font-bold text-black transition active:scale-[0.98] disabled:opacity-40"
        >
          + Event
        </button>
      )}

      <section className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {recent.map((row) => (
          <p key={row.clientEventId} className="flex items-baseline gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
            <span data-numeric className="font-mono text-xs tabular-nums text-muted">{row.clock}</span>
            <span className="truncate text-text-strong">{row.label}</span>
          </p>
        ))}
      </section>

      {!notStarted ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => props.onClock({ action: running ? 'pause' : 'resume' })}
            className="min-h-14 rounded-2xl border border-white/10 bg-surface-2 text-sm font-semibold text-text-strong active:scale-[0.98]"
          >
            {running ? 'Pause' : 'Resume'}
          </button>
          <button
            onClick={props.onFullTime}
            className="min-h-14 rounded-2xl border border-white/10 bg-surface-2 text-sm font-semibold text-text-strong active:scale-[0.98]"
          >
            Full time
          </button>
        </div>
      ) : null}

      {undoable ? (
        <div className="fixed inset-x-4 bottom-4 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-brand/30 bg-surface-3 px-4 py-3">
          <span className="text-sm text-text-strong">Recorded</span>
          <button
            onClick={async () => {
              await props.onUndo(undoable.clientEventId, undoable.event);
              setRecent((rows) => rows.filter((row) => row.clientEventId !== undoable.clientEventId));
              setUndoable(null);
            }}
            className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-text-strong active:scale-[0.98]"
          >
            Undo
          </button>
        </div>
      ) : null}

      {picking ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 p-3">
          <div className="max-h-[85dvh] overflow-y-auto rounded-3xl border border-white/10 bg-surface-1 p-4">
            {!team ? (
              <>
                <h2 className="mb-3 text-sm font-semibold text-text-strong">What happened?</h2>
                <div className="grid grid-cols-2 gap-2">
                  {PALETTE.map((option) => (
                    <button
                      key={option.type}
                      onClick={() => setPicking(option)}
                      className={`min-h-14 rounded-2xl px-3 text-sm font-semibold active:scale-[0.98] ${
                        picking.type === option.type
                          ? 'bg-brand text-black'
                          : 'border border-white/10 bg-surface-2 text-text-strong'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <h2 className="mb-2 mt-5 text-sm font-semibold text-text-strong">Which team?</h2>
                <div className="grid grid-cols-2 gap-2">
                  {props.teams.map((option) => (
                    <button
                      key={option.teamId}
                      onClick={() => setTeam(option)}
                      className="min-h-14 rounded-2xl border border-white/10 bg-surface-2 px-3 text-sm font-semibold text-text-strong active:scale-[0.98]"
                    >
                      {option.name}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h2 className="mb-3 text-sm font-semibold text-text-strong">
                  {picking.label} · {team.name}
                </h2>
                {/*
                  A jersey-number grid, not a scrolling name list. A Field Manager knows the
                  number on the shirt they just watched score; finding a name in an alphabetical
                  list while the game restarts is how the next event gets missed.
                */}
                <div className="grid grid-cols-4 gap-2">
                  {team.athletes.map((athlete) => (
                    <button
                      key={athlete.athleteId}
                      onClick={() => record(athlete)}
                      className="flex min-h-16 flex-col items-center justify-center rounded-2xl border border-white/10 bg-surface-2 px-1 active:scale-[0.98]"
                    >
                      <span data-numeric className="font-mono text-lg font-bold tabular-nums text-text-strong">
                        {athlete.shirtNumber || '?'}
                      </span>
                      <span className="w-full truncate text-center text-[10px] text-muted">
                        {athlete.registeredName.split(' ').slice(-1)[0]}
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => record(null)}
                  className="mt-3 min-h-12 w-full rounded-2xl border border-white/10 text-sm text-muted active:scale-[0.98]"
                >
                  No player / team event
                </button>
              </>
            )}
            <button
              onClick={() => { setPicking(null); setTeam(null); }}
              className="mt-3 min-h-12 w-full rounded-2xl text-sm text-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
