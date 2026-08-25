import type { MatchExceptionCode } from '../../types';

/**
 * Whether a field report becomes official with no human involved.
 *
 * There is deliberately no confirmation step. Replacing "Team A submits, Team B confirms"
 * with "Field Manager submits, League Admin confirms" would reintroduce the friction the
 * whole redesign exists to remove, and it would add no information: the League Admin was not
 * at the match. A trusted assigned observer, a complete event history, an independently
 * declared score that agrees with it, and an attestation are sufficient.
 *
 * The payoff is not only speed. A clean report that auto-finalizes was reviewed by nobody, so
 * nobody could have been conflicted, which is why field capture reduces conflict-of-interest
 * exposure regardless of how good the declaration data is.
 */

/** Exceptions that stop auto-finalization. Everything else attaches as a quality signal. */
export const BLOCKING_EXCEPTIONS: MatchExceptionCode[] = [
  'declared_score_mismatch',
  'event_sequence_gap',
  'unsynced_events_at_submit',
  'late_events_from_revoked_session',
  'athlete_not_registered',
  'athlete_ineligible',
  'match_abandoned',
  'policy_violation',
];

export type AutoFinalizeVerdict =
  | { finalize: true }
  | { finalize: false; reason: string; blocking: MatchExceptionCode[] };

export function shouldAutoFinalize(input: {
  status: string;
  exceptions: string[];
  declaredHomeScore: number;
  declaredAwayScore: number;
  reconstructedHomeScore: number;
  reconstructedAwayScore: number;
}): AutoFinalizeVerdict {
  if (input.status !== 'submitted') {
    return { finalize: false, reason: `A report in ${input.status} is not awaiting finalization.`, blocking: [] };
  }

  const blocking = input.exceptions.filter((code): code is MatchExceptionCode =>
    BLOCKING_EXCEPTIONS.includes(code as MatchExceptionCode));
  if (blocking.length) {
    return { finalize: false, reason: 'A blocking exception is open on this report.', blocking };
  }

  /**
   * Checked here as well as at submission, and deliberately not trusted from the exception
   * list alone.
   *
   * The declared and reconstructed scores are the one comparison this whole design leans on,
   * and an exception record is a claim that somebody performed it. Re-deriving it costs
   * nothing and means a bug in exception writing cannot silently promote a mismatched result.
   */
  if (
    input.declaredHomeScore !== input.reconstructedHomeScore
    || input.declaredAwayScore !== input.reconstructedAwayScore
  ) {
    return {
      finalize: false,
      reason: 'The declared score and the recorded events disagree.',
      blocking: ['declared_score_mismatch'],
    };
  }

  return { finalize: true };
}
