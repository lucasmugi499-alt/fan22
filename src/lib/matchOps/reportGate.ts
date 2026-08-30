import type { MatchClockState } from '@/types';

/**
 * Whether a field report is about a match that could have been played.
 *
 * ## The failure this exists for
 *
 * Every other gate on a field report is a CONSISTENCY check: does the declared score match the
 * score reconstructed from the events, are there gaps in the sequence, did a replaced device
 * sync afterwards. Consistency is not evidence, and an empty capture is perfectly consistent —
 * no events reconstruct to 0-0, a Field Manager declaring 0-0 agrees exactly, no exception is
 * raised, and the report is eligible for automatic finalization.
 *
 * So a valid Field Manager could, before kickoff, attest an empty report and have an unplayed
 * fixture become an official 0-0 draw: into the standings, into every athlete's appearance
 * record, into fantasy scoring and into the notifications that announce all three.
 *
 * ## Why these two, and why they differ
 *
 * `reportRefusal` covers facts about the fixture that make a report meaningless whatever it
 * says. A match that has not kicked off has no result to report and a cancelled one has no
 * result to have. Recording those as claims for review would still put them in front of a
 * League Admin as though they were results.
 *
 * `capturesACompletedMatch` covers the evidence. `full_time` is written when the Field Manager
 * ends the match, and it is the only signal in the whole flow that is about the match having
 * happened rather than about the report agreeing with itself. Its absence is a blocking
 * exception rather than a refusal, because there are real matches behind some of them — a
 * phone that died at 80 minutes, a session recovered by takeover — and a review queue is
 * exactly where those belong.
 */

/** Why this match cannot be reported at all, or null when it can. */
export function reportRefusal(input: {
  status: string;
  scheduledAt: string;
  now: number;
}): string | null {
  if (input.status === 'cancelled') {
    return 'This match was cancelled and cannot be reported.';
  }
  const kickoff = Date.parse(input.scheduledAt);
  // An unreadable kickoff time is not grounds to refuse: the fixture is already broken, and
  // blocking its report would strand a match somebody really did play.
  if (Number.isFinite(kickoff) && input.now < kickoff) {
    return 'This match has not kicked off yet, so it cannot be reported.';
  }
  return null;
}

/**
 * Whether the clock says a match was played to its end.
 *
 * A missing clock, a clock that never started and a clock stopped at half time all mean the
 * same thing: whatever the report claims, this is not the record of a completed match.
 */
export function capturesACompletedMatch(clock: Pick<MatchClockState, 'state'> | null): boolean {
  return clock?.state === 'full_time';
}
