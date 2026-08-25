'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createOfflineQueue, type OfflineQueue } from '@/lib/offline/queue';
import { formatClock, useMatchClock } from './useMatchClock';
import { PinGate } from './PinGate';
import { CaptureSurface } from './CaptureSurface';
import { AttestationFlow } from './AttestationFlow';
import type { MatchPackage } from '@/lib/matchOps/package';

type ClockSnapshot = {
  state: 'not_started' | 'running' | 'paused' | 'period_break' | 'full_time';
  period: '1' | '2' | 'ET1' | 'ET2';
  periodStartedAt?: string;
  accumulatedMs: number;
  version: number;
};

export type CapturePayload = {
  eventType: string;
  teamId: string;
  athleteId: string | null;
  period: string;
  gameClockMs: number;
  payload?: Record<string, unknown>;
};

const IDLE_CLOCK: ClockSnapshot = { state: 'not_started', period: '1', accumulatedMs: 0, version: 1 };

/**
 * The whole Field Manager experience: PIN, capture, attestation.
 *
 * One component owns the session token, the package and the queue because all three have the
 * same lifetime and the same failure mode. Splitting them across a context would mean a
 * reconnect could refresh one and not the others, and a capture surface holding a stale
 * package is a capture surface writing events against athletes who are no longer on the sheet.
 *
 * The token is held in memory only. Putting it in localStorage would make it survive the tab,
 * which sounds convenient until the phone is handed to somebody else at full time.
 */
export function MatchOpsClient({ bootstrapSecret }: { bootstrapSecret: string }) {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [pack, setPack] = useState<MatchPackage | null>(null);
  const [clock, setClock] = useState<ClockSnapshot>(IDLE_CLOCK);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [phase, setPhase] = useState<'capture' | 'attesting'>('capture');
  const [error, setError] = useState<string | null>(null);
  const queueRef = useRef<OfflineQueue<CapturePayload> | null>(null);

  const displayMs = useMatchClock({ ...clock, serverOffsetMs });

  const authed = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        'content-type': 'application/json',
        authorization: `Bearer ${sessionToken}`,
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? 'That did not work. Try again.');
    return body;
  }, [sessionToken]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const loadPackage = useCallback(async (token: string, id: string) => {
    const response = await fetch(`/api/match-ops/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? 'The match could not be loaded.');
    setPack(body.package as MatchPackage);
    if (body.clock) setClock(body.clock as ClockSnapshot);
    return body;
  }, []);

  const onAuthenticated = useCallback(async (token: string, id: string) => {
    setSessionToken(token);
    setMatchId(id);
    queueRef.current = createOfflineQueue<CapturePayload>({ matchId: id });
    setPendingCount((await queueRef.current.pending()).length);
    await loadPackage(token, id);
  }, [loadPackage]);

  /**
   * Replay whatever the device is holding, whenever it can.
   *
   * Driven by connectivity rather than by a timer: a Field Manager who has been offline for
   * forty minutes wants their sixty events to go the moment signal returns, and polling every
   * few seconds on a phone that has none is a way to spend a battery.
   */
  const flush = useCallback(async () => {
    const queue = queueRef.current;
    if (!queue || !sessionToken || !matchId) return;
    const pending = await queue.pending();
    if (!pending.length) return;
    try {
      const body = await authed(`/api/match-ops/${encodeURIComponent(matchId)}/events`, {
        method: 'POST',
        body: JSON.stringify({
          events: pending.map((entry) => ({
            clientEventId: entry.clientEventId,
            clientSequence: entry.clientSequence,
            deviceTime: entry.deviceTime,
            ...entry.payload,
            ...(entry.supersedesClientEventId
              ? { supersedesEventId: `${matchId}_${entry.supersedesClientEventId}` }
              : {}),
          })),
        }),
      });
      // Duplicates count as delivered: the server already has them, which is exactly what a
      // retry after a lost response looks like.
      await queue.markSynced([...(body.recorded ?? []), ...(body.duplicates ?? [])]);
      setPendingCount((await queue.pending()).length);
      setError(null);
    } catch {
      // Silent. A failed sync is the normal state on a touchline, and the queue is the
      // mechanism that makes it survivable. The count in the header is the honest signal.
      setPendingCount((await queue.pending()).length);
    }
  }, [authed, matchId, sessionToken]);

  useEffect(() => {
    if (online) void flush();
  }, [online, flush]);

  const capture = useCallback(async (event: CapturePayload) => {
    const queue = queueRef.current;
    if (!queue) return null;
    // Written to the device first, always. Sending first and queueing on failure loses the
    // event when the tab dies between the two.
    const entry = await queue.append(event);
    setPendingCount((await queue.pending()).length);
    void flush();
    return entry;
  }, [flush]);

  const undo = useCallback(async (clientEventId: string, event: CapturePayload) => {
    const queue = queueRef.current;
    if (!queue) return;
    // Appends a superseding entry. Never removes the original: a hole in the sequence reads to
    // the server as a lost event.
    await queue.supersede(clientEventId, { ...event, payload: { ...event.payload, undone: true } });
    setPendingCount((await queue.pending()).length);
    void flush();
  }, [flush]);

  const sendClock = useCallback(async (action: Record<string, unknown>) => {
    if (!matchId) return;
    try {
      const body = await authed(`/api/match-ops/${encodeURIComponent(matchId)}/clock`, {
        method: 'POST',
        body: JSON.stringify(action),
      });
      setClock(body.clock as ClockSnapshot);
      // The offset is how a phone with a wrong system clock still shows the right minute.
      setServerOffsetMs(Date.parse(body.serverTime) - Date.now());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The clock could not be updated.');
    }
  }, [authed, matchId]);

  const teams = useMemo(() => (pack ? [pack.homeTeam, pack.awayTeam] : []), [pack]);

  if (!sessionToken || !pack || !matchId) {
    return <PinGate bootstrapSecret={bootstrapSecret} onAuthenticated={onAuthenticated} />;
  }

  if (phase === 'attesting') {
    return (
      <AttestationFlow
        matchId={matchId}
        pack={pack}
        pendingCount={pendingCount}
        authed={authed}
        onBack={() => setPhase('capture')}
      />
    );
  }

  return (
    <CaptureSurface
      pack={pack}
      teams={teams}
      clock={clock}
      clockLabel={formatClock(displayMs)}
      gameClockMs={displayMs}
      online={online}
      pendingCount={pendingCount}
      error={error}
      onCapture={capture}
      onUndo={undo}
      onClock={sendClock}
      onFullTime={() => setPhase('attesting')}
    />
  );
}
