import { describe, expect, it } from 'vitest';
import { gateMatchReport } from './matchReports';

const clean = {
  status: 'submitted',
  exceptions: [] as string[],
  declaredHomeScore: 3,
  declaredAwayScore: 1,
  reconstructedHomeScore: 3,
  reconstructedAwayScore: 1,
};

describe('the match report gate', () => {
  it('marks a clean report ready, without claiming it is official', () => {
    // `ready_for_finalization` is not `auto_finalized`. Marking a report finalized with no
    // official result version behind it would put a lie in the data.
    expect(gateMatchReport(clean)).toEqual({ status: 'ready_for_finalization' });
  });

  it('routes a blocked report to the league with the reason', () => {
    expect(gateMatchReport({ ...clean, exceptions: ['declared_score_mismatch'] }))
      .toEqual({ status: 'league_review', blocking: ['declared_score_mismatch'] });
  });

  /**
   * Re-evaluated rather than trusted. Submission is a request from a device on a bad
   * connection, and a worker that trusts the exception list it was handed cannot notice a
   * report written while a gate was buggy or a race left an exception unwritten.
   */
  it('catches a mismatch that no exception recorded', () => {
    const outcome = gateMatchReport({ ...clean, exceptions: [], reconstructedAwayScore: 2 });

    expect(outcome).toEqual({ status: 'league_review', blocking: ['declared_score_mismatch'] });
  });

  it('leaves an already decided report alone', () => {
    // Re-deciding is how a resolved case reopens itself on the next write.
    for (const status of ['league_review', 'official', 'ready_for_finalization', 'superseded']) {
      expect(gateMatchReport({ ...clean, status })).toBeNull();
    }
  });

  it('passes a report carrying only quality signals', () => {
    expect(gateMatchReport({ ...clean, exceptions: ['clock_anomaly', 'takeover_occurred', 'affiliated_observer'] }))
      .toEqual({ status: 'ready_for_finalization' });
  });
});
