import { describe, expect, it } from 'vitest';
import { applyPolicyCeiling, computeDataQuality, type QualityInputs } from './quality';

const perfect: QualityInputs = {
  sourceType: 'field_capture',
  eventsFullySynced: true,
  lineupKnown: true,
  noReconciliationIssues: true,
  allAthletesEligible: true,
  clockProvenanceIntact: true,
  neutralObserver: true,
  takeoverOccurred: false,
};

describe('data quality is computed, never chosen', () => {
  it('awards gold only when everything holds', () => {
    expect(computeDataQuality(perfect)).toEqual({ tier: 'gold', reasons: [], fantasy: 'full' });
  });

  it.each([
    ['eventsFullySynced', 'Some events had not reached us when the report was submitted.'],
    ['lineupKnown', 'No confirmed lineup was recorded.'],
    ['allAthletesEligible', 'An athlete named by an event was not eligible.'],
    ['clockProvenanceIntact', 'The match clock was adjusted more than expected.'],
    ['neutralObserver', 'The observer is involved with one of these clubs.'],
  ] as const)('drops to silver and says why when %s fails', (field, reason) => {
    const verdict = computeDataQuality({ ...perfect, [field]: false });

    expect(verdict.tier).toBe('silver');
    expect(verdict.reasons).toContain(reason);
  });

  it('drops to silver on a takeover without calling it a failure', () => {
    // A takeover is a legitimate operational act. The match was still captured; it was just
    // captured by two devices, and a reader is owed that.
    const verdict = computeDataQuality({ ...perfect, takeoverOccurred: true });

    expect(verdict.tier).toBe('silver');
    expect(verdict.reasons).toContain('Capture moved to a second device during the match.');
  });

  it('caps a post-match entry at bronze however careful the operator was', () => {
    const verdict = computeDataQuality({ ...perfect, sourceType: 'league_post_match' });

    expect(verdict.tier).toBe('bronze');
    expect(verdict.fantasy).toBe('standings_only');
  });

  it('distinguishes a legacy result confirmed by agreement from one confirmed by silence', () => {
    const mutual = computeDataQuality({
      ...perfect,
      sourceType: 'legacy_team_submission',
      legacyConfirmation: 'mutual_confirmation',
    });
    const silence = computeDataQuality({
      ...perfect,
      sourceType: 'legacy_team_submission',
      legacyConfirmation: 'league_admin_nonresponse_confirmation',
    });

    expect(mutual.tier).toBe('legacy');
    expect(mutual.reasons[0]).toContain('Confirmed by the opposing club');
    expect(silence.reasons[0]).toContain('did not respond');
  });

  it('lets a competition policy cap a perfectly captured match', () => {
    // The tier states what the competition guarantees, not what one lucky fixture achieved.
    const capped = applyPolicyCeiling(computeDataQuality(perfect), 'bronze');

    expect(capped.tier).toBe('bronze');
    expect(capped.reasons).toContain('This competition permits results to be entered after the match.');
  });

  it('leaves a gold-eligible competition alone', () => {
    expect(applyPolicyCeiling(computeDataQuality(perfect), 'gold').tier).toBe('gold');
  });

  it('never raises a tier', () => {
    const bronze = computeDataQuality({ ...perfect, sourceType: 'league_post_match' });

    expect(applyPolicyCeiling(bronze, 'gold').tier).toBe('bronze');
  });
});
