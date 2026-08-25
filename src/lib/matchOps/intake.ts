import type { LiveMatchEvent } from '@/types';

/**
 * What the server does with a batch of observations from a touchline.
 *
 * Three rules, and each of them exists because of a specific way a match gets corrupted.
 *
 * **Idempotent on `clientEventId`.** A phone on a bad connection retries, and the common
 * failure is that the request arrived and the response did not. Without this, every retry is
 * a second goal.
 *
 * **Gaps in `clientSequence` are detected, never silently accepted.** The sequence is the only
 * way the server can tell "this Field Manager captured nothing between 61 and 68 minutes"
 * from "seven events were captured and lost". One of those is a match; the other is a
 * reconciliation case.
 *
 * **Events from a superseded session are quarantined, not dropped and not merged.** Dropping
 * loses real observations from the only person who was watching. Auto-merging trusts two
 * contradictory clocks. Quarantine puts the decision in front of the League with both streams
 * visible, which is what exception-driven governance is for.
 */

export type IncomingEvent = {
  clientEventId: string;
  clientSequence: number;
  eventType: string;
  teamId: string;
  athleteId: string | null;
  period: string;
  gameClockMs: number;
  deviceTime: string;
  payload?: Record<string, unknown>;
  supersedesEventId?: string;
  correctionReason?: string;
};

export type IntakeVerdict = {
  /** Events to write, with the status each should carry. */
  accepted: { event: IncomingEvent; status: LiveMatchEvent['status'] }[];
  /** Already recorded under this clientEventId. Recorded once, however many times it arrives. */
  duplicates: string[];
  /** Sequence numbers that were never received. */
  missingSequences: number[];
  /** True when anything in this batch came from a superseded session. */
  quarantined: boolean;
};

export function planEventIntake(input: {
  incoming: IncomingEvent[];
  /** Everything already stored for this match. */
  existing: Pick<LiveMatchEvent, 'clientEventId' | 'clientSequence' | 'status'>[];
  /** The generation the submitting session holds. */
  submittedGeneration: number;
  /** The generation the match is currently on. */
  currentGeneration: number;
}): IntakeVerdict {
  const { incoming, existing, submittedGeneration, currentGeneration } = input;

  /**
   * A session that has been fenced can still be telling the truth.
   *
   * The Field Manager's phone died at 62', the League took over at 63', and at 71' the
   * original phone comes back on a borrowed charger holding nineteen real events. Those
   * events happened. They are also anchored to a clock that has since been replaced, so they
   * cannot simply be appended underneath the takeover's stream.
   */
  const quarantined = submittedGeneration < currentGeneration;
  const status: LiveMatchEvent['status'] = quarantined ? 'quarantined' : 'active';

  const seen = new Set(existing.map((event) => event.clientEventId));
  const duplicates: string[] = [];
  const accepted: IntakeVerdict['accepted'] = [];
  const batchSeen = new Set<string>();

  for (const event of incoming) {
    // Deduplicated against storage and within the batch: a client replaying its whole queue
    // can legitimately send the same entry twice in one request.
    if (seen.has(event.clientEventId) || batchSeen.has(event.clientEventId)) {
      duplicates.push(event.clientEventId);
      continue;
    }
    batchSeen.add(event.clientEventId);
    accepted.push({ event, status });
  }

  const sequences = new Set<number>([
    ...existing.map((event) => event.clientSequence),
    ...accepted.map((entry) => entry.event.clientSequence),
  ]);
  const highest = Math.max(0, ...sequences);
  const missingSequences: number[] = [];
  for (let sequence = 1; sequence <= highest; sequence += 1) {
    if (!sequences.has(sequence)) missingSequences.push(sequence);
  }

  return { accepted, duplicates, missingSequences, quarantined };
}

/**
 * Whether a correction is still inside the undo window.
 *
 * Inside it, an undo is an ordinary part of capture and needs no explanation. Outside it, the
 * Field Manager is revising something they had already accepted, which is a different act and
 * carries a reason and a non-blocking quality flag.
 */
export const UNDO_WINDOW_MS = 8_000;

export function isWithinUndoWindow(recordedAt: string, now: Date) {
  const recorded = Date.parse(recordedAt);
  if (Number.isNaN(recorded)) return false;
  return now.getTime() - recorded <= UNDO_WINDOW_MS;
}
