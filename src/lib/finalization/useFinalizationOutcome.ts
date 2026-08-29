'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import type { ResultSubmissionStatus } from '@/types';

/**
 * What actually happened after a result decision was submitted.
 *
 * ## The hang this replaces
 *
 * Both result sheets set a `busy` flag and cleared it ONLY on a thrown error. Success was
 * signalled by a live subscription observing `status === 'official'` — which is the right
 * pattern, and the reason the two "Finalized as official" messages in this product are
 * trustworthy: they fire from the server's own state rather than optimistically.
 *
 * But finalization legitimately produces outcomes that are not `official`:
 *
 *   - the activation gate is `off` or `canary` and the result is skipped by design
 *   - reconciliation blocks: the events and the score disagree irreparably
 *   - the submission exceeds the write budget and is refused rather than expanded
 *   - the Cloud Function is simply slow
 *
 * In every one of those the sheet sat at "Saving decision…" forever, with no timeout and no
 * escape but closing it. The League Admin's most consequential screen appeared broken exactly
 * when the system was behaving as designed.
 *
 * And the decision HAD been saved. So an admin who reasonably concluded it failed and tried
 * again would act twice on the same match.
 *
 * ## What this does instead
 *
 * Subscribes to the outcome rather than to one value of it. Any terminal transition resolves
 * the wait, and each renders differently:
 *
 *   `official` — finalized, close the sheet
 *   `review`   — a reconciliation exception now exists for this match; link to it
 *   `pending`  — nothing terminal within the timeout; the decision is saved and processing
 *
 * `pending` is not an error and must not be worded as one. It is the honest answer when the
 * server has accepted the decision and the finalizer has not yet reported — which on a cold
 * Cloud Function is ordinary.
 */
export type FinalizationPhase =
  /** Nothing submitted yet. */
  | 'idle'
  /** Submitted; waiting for a terminal outcome. */
  | 'waiting'
  /** Promoted to an official result. */
  | 'official'
  /** Blocked into the exception queue for a human. */
  | 'review'
  /** No terminal outcome within the timeout. Saved, still processing. */
  | 'pending';

/**
 * How long to wait before saying "still processing".
 *
 * Long enough to cover a cold Cloud Function start plus a Firestore trigger round trip, short
 * enough that nobody concludes the page is broken. The wait resolving is what matters, not
 * this exact number — the previous behaviour was an unbounded wait, and any bound beats it.
 */
export const FINALIZATION_TIMEOUT_MS = 20_000;

/** How often to look for an exception raised for this match while waiting. */
const EXCEPTION_POLL_MS = 2_500;

/**
 * The two decisions this hook makes, extracted so they can be tested directly.
 *
 * The repo tests logic rather than renders — there is no jsdom environment and no
 * testing-library — and these are the parts worth proving. What is left in the hook is
 * subscription plumbing.
 */

/**
 * Which phase to report, given what the caller has settled on and what the live subscription
 * says.
 *
 * `official` is DERIVED rather than stored, and only while a wait is in progress. Storing it
 * would need an effect that copies the status into state, which renders once showing
 * `waiting` and again to correct itself. Deriving it also fixes a subtler bug: opening the
 * sheet on an already-official match must not fire the success toast and close it for a
 * decision nobody made.
 */
export function resolveFinalizationPhase(
  settled: Exclude<FinalizationPhase, 'official'>,
  status: ResultSubmissionStatus | undefined,
): FinalizationPhase {
  return settled === 'waiting' && status === 'official' ? 'official' : settled;
}

/** The exception blocking THIS match, if the finalizer raised one. */
export function findBlockingException<T extends { matchId: string; id: string; exceptionId?: string }>(
  exceptions: readonly T[],
  matchId: string,
): T | undefined {
  return exceptions.find((item) => item.matchId === matchId);
}

export type FinalizationOutcome = {
  phase: FinalizationPhase;
  /** The exception blocking this match, when the outcome was `review`. */
  exceptionId?: string;
  /** Begin waiting. Call immediately after the decision is accepted by the server. */
  start: () => void;
  /** Abandon the wait — the sheet closed, or the caller resolved it another way. */
  reset: () => void;
};

export function useFinalizationOutcome(input: {
  matchId: string;
  leagueId?: string;
  /** The live submission status, from the caller's existing subscription. */
  status?: ResultSubmissionStatus;
  isDemoMode: boolean;
}): FinalizationOutcome {
  const { matchId, leagueId, status, isDemoMode } = input;
  /**
   * `official` is deliberately absent from this state.
   *
   * Outcome 1 is DERIVED from the submission status the caller is already subscribed to,
   * rather than copied into state by an effect. Copying it would mean a render that shows
   * `waiting` while the status already says `official`, then a second render to correct
   * itself — a cascading render for a fact that was already available synchronously.
   */
  const [settled, setSettled] = useState<Exclude<FinalizationPhase, 'official'>>('idle');
  const [exceptionId, setExceptionId] = useState<string>();
  const startedAt = useRef<number | null>(null);

  // Outcome 1: the result went official. No second listener — the caller is already watching
  // this document, and this reads what that subscription reports.
  const phase = resolveFinalizationPhase(settled, status);

  const start = useCallback(() => {
    startedAt.current = Date.now();
    setExceptionId(undefined);
    setSettled('waiting');
  }, []);

  const reset = useCallback(() => {
    startedAt.current = null;
    setExceptionId(undefined);
    setSettled('idle');
  }, []);

  // Outcome 2: an exception was raised for this match. Polled rather than subscribed because
  // the query is by matchId across a league-scoped collection, and a listener for a document
  // that usually never appears costs more than a few reads over twenty seconds.
  useEffect(() => {
    if (phase !== 'waiting') return;
    const provider = isDemoMode ? mockProvider : dataProvider;
    let cancelled = false;

    const check = async () => {
      try {
        const exceptions = await provider.getReconciliationExceptions(leagueId);
        if (cancelled) return;
        const raised = findBlockingException(exceptions, matchId);
        if (raised) {
          setExceptionId(raised.exceptionId ?? raised.id);
          setSettled('review');
        }
      } catch {
        // A failed read must not end the wait — the timeout below is the backstop, and
        // reporting a transient read failure as an outcome would be its own wrong answer.
      }
    };

    void check();
    const interval = setInterval(() => void check(), EXCEPTION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [phase, matchId, leagueId, isDemoMode]);

  // Outcome 3: nothing terminal in time. Always resolves the wait, whatever else failed.
  useEffect(() => {
    if (phase !== 'waiting') return;
    const elapsed = startedAt.current ? Date.now() - startedAt.current : 0;
    const remaining = Math.max(0, FINALIZATION_TIMEOUT_MS - elapsed);
    const timer = setTimeout(() => setSettled('pending'), remaining);
    return () => clearTimeout(timer);
  }, [phase]);

  return { phase, exceptionId, start, reset };
}
