import { describe, expect, it } from 'vitest';
import { shouldAutoFinalize } from './autoFinalize';

const clean = {
  status: 'submitted',
  exceptions: [] as string[],
  declaredHomeScore: 3,
  declaredAwayScore: 1,
  reconstructedHomeScore: 3,
  reconstructedAwayScore: 1,
};

describe('a clean field report needs no human', () => {
  it('finalizes when everything reconciles', () => {
    expect(shouldAutoFinalize(clean)).toEqual({ finalize: true });
  });

  it('finalizes despite a non-blocking exception', () => {
    // A takeover, a clock adjustment or an affiliated observer lowers confidence in the
    // record. None of them makes the result wrong, and holding a correct match in a queue
    // teaches a league that the queue is noise.
    expect(shouldAutoFinalize({ ...clean, exceptions: ['takeover_occurred', 'clock_anomaly'] }))
      .toEqual({ finalize: true });
  });

  it.each([
    'declared_score_mismatch',
    'event_sequence_gap',
    'unsynced_events_at_submit',
    'late_events_from_revoked_session',
    'athlete_ineligible',
    'match_abandoned',
    'policy_violation',
  ])('refuses on %s', (code) => {
    const verdict = shouldAutoFinalize({ ...clean, exceptions: [code] });

    expect(verdict.finalize).toBe(false);
    expect(verdict.finalize === false && verdict.blocking).toContain(code);
  });

  /**
   * Re-derived rather than trusted from the exception list. An exception record is a claim
   * that somebody performed this comparison; doing it again costs nothing and means a bug in
   * exception writing cannot promote a mismatched result.
   */
  it('refuses a mismatch even when no exception was recorded for it', () => {
    const verdict = shouldAutoFinalize({ ...clean, exceptions: [], reconstructedHomeScore: 2 });

    expect(verdict.finalize).toBe(false);
    expect(verdict.finalize === false && verdict.blocking).toEqual(['declared_score_mismatch']);
  });

  it('will not finalize a report that is already under review or official', () => {
    for (const status of ['league_review', 'official', 'auto_finalized', 'superseded']) {
      expect(shouldAutoFinalize({ ...clean, status }).finalize).toBe(false);
    }
  });
});
