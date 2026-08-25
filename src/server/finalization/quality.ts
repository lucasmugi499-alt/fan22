import type { FinalizationSourceType } from '../../kernel/principal';

/**
 * How much a result should be trusted, computed rather than chosen.
 *
 * A League Admin must never be able to select "Gold" because it reads better. The tier is
 * derived deterministically from source, coverage and conflict at finalization and stored on
 * the official result version, which is immutable and versioned, rather than as a mutable
 * field on the match. Both halves matter: computed means nobody can assert it, and stored on
 * the version means it cannot drift after the fact.
 *
 * ## The tier summarises, it does not replace
 *
 * `MatchDataCoverage` already carries resultCoverage, rosterCoverage, eventCoverage,
 * statisticCoverageLevel, fantasyEligible, qualityScore and qualityIssues. Those remain the
 * underlying facts. This is a label computed over them plus provenance, and it must never
 * contradict the fields it summarises, which is how MatchStatus and verificationStatus went
 * wrong the first time.
 */

export type QualityTier = 'gold' | 'silver' | 'bronze' | 'legacy';

export type QualityInputs = {
  sourceType: FinalizationSourceType;
  /** Every event the device captured reached the server. */
  eventsFullySynced: boolean;
  /** A lineup snapshot exists for this match. */
  lineupKnown: boolean;
  /** No blocking exception survived to finalization. */
  noReconciliationIssues: boolean;
  /** Every athlete named by an event was registered and unsuspended. */
  allAthletesEligible: boolean;
  /** Anchors coherent, adjustments within tolerance. */
  clockProvenanceIntact: boolean;
  /** The observer had declared no relationship with either club. */
  neutralObserver: boolean;
  /** A takeover happened during this match. */
  takeoverOccurred: boolean;
  /** How a legacy submission became confirmed, where that is what produced it. */
  legacyConfirmation?: 'mutual_confirmation' | 'league_admin_nonresponse_confirmation';
};

export type QualityVerdict = {
  tier: QualityTier;
  /** Why it is not higher. Empty on gold. */
  reasons: string[];
  fantasy: 'full' | 'profile_dependent' | 'standings_only' | 'as_recorded';
};

/**
 * Gold requires everything, and that is deliberate.
 *
 * A tier that could be reached with one thing missing would be reached with one thing missing
 * most of the time, and the label would stop meaning anything to the fantasy engine and the
 * scouts who read it.
 */
export function computeDataQuality(input: QualityInputs): QualityVerdict {
  if (input.sourceType === 'legacy_team_submission') {
    return {
      tier: 'legacy',
      reasons: [
        input.legacyConfirmation === 'mutual_confirmation'
          ? 'Confirmed by the opposing club.'
          : 'Confirmed after the opposing club did not respond.',
      ],
      fantasy: 'as_recorded',
    };
  }

  if (input.sourceType === 'league_post_match' || input.sourceType === 'platform_exception_resolution') {
    return {
      tier: 'bronze',
      // Named plainly. The evidence for a typed score is somebody's memory, however careful.
      reasons: ['The result was entered after the match rather than captured during it.'],
      fantasy: 'standings_only',
    };
  }

  const reasons: string[] = [];
  if (!input.eventsFullySynced) reasons.push('Some events had not reached us when the report was submitted.');
  if (!input.lineupKnown) reasons.push('No confirmed lineup was recorded.');
  if (!input.noReconciliationIssues) reasons.push('The league resolved an issue with this record.');
  if (!input.allAthletesEligible) reasons.push('An athlete named by an event was not eligible.');
  if (!input.clockProvenanceIntact) reasons.push('The match clock was adjusted more than expected.');
  if (!input.neutralObserver) reasons.push('The observer is involved with one of these clubs.');
  if (input.takeoverOccurred) reasons.push('Capture moved to a second device during the match.');

  if (reasons.length === 0) return { tier: 'gold', reasons: [], fantasy: 'full' };
  return { tier: 'silver', reasons, fantasy: 'profile_dependent' };
}

/**
 * The ceiling a competition's capture policy imposes, applied after computation.
 *
 * A competition that permits typed scores cannot mint Gold even when a particular match
 * happened to be captured perfectly, because the tier is a statement about what the
 * competition guarantees, not about one lucky fixture.
 */
export function applyPolicyCeiling(verdict: QualityVerdict, ceiling: 'gold' | 'bronze'): QualityVerdict {
  if (ceiling === 'gold') return verdict;
  if (verdict.tier === 'legacy') return verdict;
  if (verdict.tier === 'bronze') return verdict;
  return {
    tier: 'bronze',
    reasons: [...verdict.reasons, 'This competition permits results to be entered after the match.'],
    fantasy: 'standings_only',
  };
}
