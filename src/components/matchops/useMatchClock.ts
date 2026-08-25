'use client';

import { useCallback, useSyncExternalStore } from 'react';

const TICK_MS = 500;

/**
 * The wall clock, as an external store.
 *
 * Two earlier shapes were wrong for instructive reasons. Holding the displayed milliseconds in
 * state meant writing state from an effect whenever the anchor changed, which cascades a
 * render for a value that was already derivable. Computing it during render from `Date.now()`
 * is derivable but impure, and React is right to refuse it.
 *
 * Time genuinely is an external mutable source, which is what `useSyncExternalStore` is for.
 * The snapshot is quantized to the tick interval so it is stable between ticks: returning a
 * fresh `Date.now()` on every call would make React see a new value on every render.
 */
function subscribe(onStoreChange: () => void) {
  const timer = window.setInterval(onStoreChange, TICK_MS);
  return () => window.clearInterval(timer);
}

function getSnapshot() {
  return Math.floor(Date.now() / TICK_MS);
}

/** Server render has no wall clock worth reading; the anchor alone decides. */
function getServerSnapshot() {
  return 0;
}

/**
 * What the Field Manager sees ticking, derived from the anchor the server gave us.
 *
 * This value is never written onto an event. The distinction the whole clock design rests on:
 * a display is for a person, an event time is a fact, and the fact is recomputed on the server
 * from `periodStartedAt` and `accumulatedMs`.
 *
 * `serverOffsetMs` corrects for a device whose own clock is wrong, which on cheap Android
 * phones that have never held a network time sync is common rather than exotic.
 */
export function useMatchClock(input: {
  state: 'not_started' | 'running' | 'paused' | 'period_break' | 'full_time';
  periodStartedAt?: string;
  accumulatedMs: number;
  serverOffsetMs: number;
}) {
  const running = input.state === 'running' && Boolean(input.periodStartedAt);

  // Subscribing only while running: a paused clock does not need a timer, and a phone on a
  // touchline does not need one running for nothing.
  const subscribeWhileRunning = useCallback(
    (onStoreChange: () => void) => (running ? subscribe(onStoreChange) : () => undefined),
    [running],
  );

  const ticks = useSyncExternalStore(subscribeWhileRunning, getSnapshot, getServerSnapshot);

  if (!running || !input.periodStartedAt) return Math.max(0, input.accumulatedMs);
  const started = Date.parse(input.periodStartedAt);
  if (Number.isNaN(started)) return Math.max(0, input.accumulatedMs);
  const serverNow = ticks * TICK_MS + input.serverOffsetMs;
  return Math.max(0, input.accumulatedMs + (serverNow - started));
}

export function formatClock(ms: number) {
  const totalSeconds = Math.floor(ms / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
