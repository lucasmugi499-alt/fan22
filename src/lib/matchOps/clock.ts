import type { MatchClockState } from '@/types';

/**
 * The match clock, reconstructed from anchors rather than counted by a timer.
 *
 * A JavaScript interval dies when Safari is backgrounded, battery saver engages, or the phone
 * locks, and all three are ordinary on the hardware this runs on. A clock that stops counting
 * when the screen does would put a 62nd-minute goal at 41 minutes and nobody would notice
 * until the match report looked strange.
 *
 * So elapsed time is always `accumulatedMs + (now - periodStartedAt)` while running, and
 * `accumulatedMs` otherwise. The client display ticks locally between reads because a clock
 * that only updates on request is unusable, but the value written onto an event is always
 * derived from the anchor, never read off the display. Reopening the page reconstructs the
 * clock; it does not resume it.
 */

export type ClockAction =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'end_period' }
  | { type: 'start_period'; period: MatchClockState['period'] }
  | { type: 'full_time' }
  | { type: 'adjust'; deltaMs: number; reason: string };

export type ClockTransition =
  | { ok: true; next: MatchClockState }
  | { ok: false; reason: string };

/** More than one adjustment, or more than two minutes total, lowers confidence in the clock. */
export const CLOCK_ANOMALY_ADJUSTMENT_COUNT = 1;
export const CLOCK_ANOMALY_TOTAL_MS = 2 * 60_000;

export function gameClockMs(state: Pick<MatchClockState, 'state' | 'periodStartedAt' | 'accumulatedMs'>, now: Date) {
  if (state.state !== 'running' || !state.periodStartedAt) return Math.max(0, state.accumulatedMs);
  const started = Date.parse(state.periodStartedAt);
  if (Number.isNaN(started)) return Math.max(0, state.accumulatedMs);
  return Math.max(0, state.accumulatedMs + (now.getTime() - started));
}

/**
 * Whether the clock's own history suggests it should be trusted less.
 *
 * Non-blocking by design. Field managers miss kickoff by thirty seconds, and that is Tuesday
 * rather than an edge case: refusing the match over it would teach them to stop recording the
 * adjustment instead of stopping them from needing one.
 */
export function hasClockAnomaly(state: Pick<MatchClockState, 'adjustments'>) {
  const adjustments = state.adjustments ?? [];
  if (adjustments.length > CLOCK_ANOMALY_ADJUSTMENT_COUNT) return true;
  const total = adjustments.reduce((sum, entry) => sum + Math.abs(entry.deltaMs), 0);
  return total > CLOCK_ANOMALY_TOTAL_MS;
}

/**
 * Apply one action to the clock.
 *
 * Pure, so the state machine is testable without a database and so the route and any future
 * caller cannot each carry their own idea of what "pause" means. `version` increments on every
 * transition and the caller writes conditionally on it, which is how two devices racing the
 * clock during a takeover lose safely rather than interleaving.
 */
export function applyClockAction(state: MatchClockState, action: ClockAction, now: Date): ClockTransition {
  const at = now.toISOString();
  const bump = (patch: Partial<MatchClockState>): ClockTransition => ({
    ok: true,
    next: { ...state, ...patch, version: state.version + 1, updatedAt: at },
  });

  switch (action.type) {
    case 'start':
      if (state.state !== 'not_started') return { ok: false, reason: 'The match has already started.' };
      return bump({ state: 'running', periodStartedAt: at, accumulatedMs: 0 });

    case 'pause': {
      if (state.state !== 'running') return { ok: false, reason: 'The clock is not running.' };
      // Time is banked at the moment of pausing, so a pause that lasts through a lost
      // connection cannot lose the minutes that came before it.
      return bump({
        state: 'paused',
        pausedAt: at,
        accumulatedMs: gameClockMs(state, now),
        periodStartedAt: undefined,
      });
    }

    case 'resume':
      if (state.state !== 'paused') return { ok: false, reason: 'The clock is not paused.' };
      return bump({ state: 'running', periodStartedAt: at, pausedAt: undefined });

    case 'end_period': {
      if (state.state !== 'running' && state.state !== 'paused') {
        return { ok: false, reason: 'No period is in progress.' };
      }
      return bump({
        state: 'period_break',
        accumulatedMs: gameClockMs(state, now),
        periodStartedAt: undefined,
      });
    }

    case 'start_period':
      if (state.state !== 'period_break') return { ok: false, reason: 'The previous period has not ended.' };
      // A new period banks from zero. The previous period's time is already in the events
      // captured during it, which is where it belongs.
      return bump({ period: action.period, state: 'running', periodStartedAt: at, accumulatedMs: 0 });

    case 'full_time':
      if (state.state === 'full_time') return { ok: false, reason: 'The match is already at full time.' };
      return bump({
        state: 'full_time',
        accumulatedMs: gameClockMs(state, now),
        periodStartedAt: undefined,
      });

    case 'adjust': {
      if (!action.reason.trim()) return { ok: false, reason: 'An adjustment needs a reason.' };
      const adjusted = gameClockMs(state, now) + action.deltaMs;
      if (adjusted < 0) return { ok: false, reason: 'An adjustment cannot take the clock below zero.' };
      /**
       * A signed delta with a mandatory reason, recorded as its own entry. Never a silent
       * drag: an unexplained jump in the clock is indistinguishable from a bug, and a
       * reviewer six weeks later has no way to tell which it was.
       */
      return bump({
        accumulatedMs: adjusted,
        // Re-anchored, so a running clock does not immediately re-add the time it just
        // adjusted away.
        ...(state.state === 'running' ? { periodStartedAt: at } : {}),
        adjustments: [...(state.adjustments ?? []), { deltaMs: action.deltaMs, reason: action.reason, at }],
      });
    }
  }
}

export function initialClockState(matchId: string, sessionGeneration: number, at: string): MatchClockState {
  return {
    id: matchId,
    matchId,
    period: '1',
    state: 'not_started',
    accumulatedMs: 0,
    sessionGeneration,
    version: 1,
    adjustments: [],
    updatedAt: at,
  };
}
