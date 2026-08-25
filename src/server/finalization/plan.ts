import type { Match, MatchStatus, VerificationStatus, FinalizationSource } from '../../types';
import type { FinalizationCandidate } from './candidate';

/**
 * What the truth engine will write, decided from a candidate and nothing else.
 *
 * The planner is pure. Given a candidate and the match it belongs to, it decides whether to
 * finalize and what the official record should say, without reading or writing anything. That
 * split is what makes the sports logic testable without Firestore, and it leaves the
 * transaction with one job: commit a plan atomically.
 *
 * Note what is absent from the input: any notion of a submission, a confirmation, an opponent
 * or a team. Those are properties of one source, and by the time a candidate exists they have
 * already done their work. Everything from here on is source-agnostic, and that line is what
 * makes the whole redesign safe.
 */

export type CandidateFinalizationPlan = {
  finalizationKey: string;
  match: {
    status: MatchStatus;
    verificationStatus: VerificationStatus;
    score: { home: number; away: number };
  };
  /**
   * How the source record should be updated once the official writes succeed.
   *
   * Deliberately not called `submission`. The planner does not know what kind of record
   * produced this candidate, and the lifecycle adapter is what turns these three facts into
   * the right write for the right collection.
   */
  sourceLifecycle: {
    status: 'official';
    finalizationSource: FinalizationSource;
    finalizedAt: string;
  };
  resultVersion: number;
  supersedesVersion?: number;
};

export type CandidateFinalizationDecision =
  | { action: 'finalize'; plan: CandidateFinalizationPlan }
  | {
      action: 'noop';
      reason: 'already_finalized' | 'not_finalizable' | 'mismatched_parents' | 'stale_version';
    };

/**
 * How a result of this kind should be described in its provenance.
 *
 * A legacy submission carries the confirmation that produced it, because "the opponent agreed"
 * and "the opponent never replied" are different levels of evidence and the quality tier is
 * entitled to know which. Field capture carries no such thing: there was no second party, and
 * inventing a confirmation label for one observer would overstate what happened.
 */
export function finalizationSourceForCandidate(candidate: FinalizationCandidate): FinalizationSource {
  if (candidate.confirmationProvenance) return candidate.confirmationProvenance;
  switch (candidate.sourceType) {
    case 'field_capture':
      return 'live_field_capture';
    case 'league_post_match':
      return 'league_post_match';
    case 'platform_exception_resolution':
      return 'platform_exception_resolution';
    default:
      return 'league_admin_nonresponse_confirmation';
  }
}

export function planCandidateFinalization(input: {
  candidate: FinalizationCandidate;
  match: Pick<Match, 'id' | 'leagueId' | 'seasonId' | 'homeTeamId' | 'awayTeamId' | 'officialResultVersion'>;
  /** Finalization keys already in the ledger. */
  processedKeys: string[];
  /** True when the source record already believes it is final. */
  alreadyFinalized?: boolean;
  now: string;
}): CandidateFinalizationDecision {
  const { candidate, match, processedKeys, now } = input;

  // Never finalize a candidate onto a match it does not belong to. Cheap, and the failure it
  // prevents is a result appearing on somebody else's fixture.
  if (
    candidate.matchId !== match.id
    || candidate.leagueId !== match.leagueId
    || (candidate.seasonId && candidate.seasonId !== match.seasonId)
  ) {
    return { action: 'noop', reason: 'mismatched_parents' };
  }

  if (input.alreadyFinalized || processedKeys.includes(candidate.finalizationKey)) {
    return { action: 'noop', reason: 'already_finalized' };
  }

  /**
   * Firestore delivers events at least once and does not guarantee ordering, so an old
   * delivery can arrive after a correction has already been made live. The ledger cannot catch
   * this, because each version has its own key, so the live version is compared directly.
   */
  if (
    typeof match.officialResultVersion === 'number'
    && match.officialResultVersion >= candidate.resultVersion
  ) {
    return { action: 'noop', reason: 'stale_version' };
  }

  return {
    action: 'finalize',
    plan: {
      finalizationKey: candidate.finalizationKey,
      match: {
        // A result advances the lifecycle automatically rather than depending on somebody to
        // flip it by hand.
        status: 'completed',
        verificationStatus: 'verified',
        score: { home: candidate.homeScore, away: candidate.awayScore },
      },
      sourceLifecycle: {
        status: 'official',
        finalizationSource: finalizationSourceForCandidate(candidate),
        finalizedAt: now,
      },
      resultVersion: candidate.resultVersion,
      supersedesVersion: match.officialResultVersion,
    },
  };
}
