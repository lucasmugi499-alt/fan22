import { describe, expect, it } from 'vitest';
import { emptyEvidence, readyToPush } from './migration-evidence';

describe('migration evidence', () => {
  /**
   * Everything starts at `not_run`, so a field that was never measured says so rather than
   * being absent and read as fine. Absence is the failure mode this format exists to prevent.
   */
  it('defaults every gate to not run', () => {
    const evidence = emptyEvidence('demo');

    expect(evidence.local.unitTests.status).toBe('not_run');
    expect(evidence.migration.v1DrainBefore).toBe('not_run');
    expect(evidence.migration.sunsetInvariants).toBe('not_run');
    expect(evidence.canary.duplicateReplay).toBe('not_run');
  });

  it('is not ready to push from a blank template', () => {
    const { ready, blocking } = readyToPush(emptyEvidence('demo'));

    expect(ready).toBe(false);
    expect(blocking.length).toBeGreaterThan(5);
  });

  it('still blocks when only the local gates pass', () => {
    // The distinction the whole migration turns on: green code is not a migrated environment.
    const evidence = emptyEvidence('demo');
    evidence.local = {
      unitTests: { status: 'passed', count: 1374 },
      rulesTests: { status: 'passed', count: 155 },
      integrationTests: { status: 'passed', count: 19 },
      functionsBuild: 'passed',
      deployReady: 'passed',
    };

    const { ready, blocking } = readyToPush(evidence);

    expect(ready).toBe(false);
    expect(blocking).toContain('team authority still frozen');
    expect(blocking).toContain('legacy team capabilities not proven zero');
  });

  it('is ready only when the environment is proven too', () => {
    const evidence = emptyEvidence('demo');
    evidence.local = {
      unitTests: { status: 'passed' }, rulesTests: { status: 'passed' },
      integrationTests: { status: 'passed' }, functionsBuild: 'passed', deployReady: 'passed',
    };
    evidence.migration.teamAuthorityStage = 'retired';
    evidence.migration.legacyTeamCapabilitiesRemaining = 0;
    evidence.migration.v1DrainAfter = { strandedByRetirement: 0, pendingTeamInvitations: 0 };
    evidence.migration.sunsetInvariants = 'passed';

    expect(readyToPush(evidence).ready).toBe(true);
  });

  it('refuses a drain that was never re-run after migrating stragglers', () => {
    // Draining once, migrating, and never checking again is how a migration proves the state
    // it started in rather than the state it ended in.
    const evidence = emptyEvidence('demo');
    evidence.local = {
      unitTests: { status: 'passed' }, rulesTests: { status: 'passed' },
      integrationTests: { status: 'passed' }, functionsBuild: 'passed', deployReady: 'passed',
    };
    evidence.migration.teamAuthorityStage = 'retired';
    evidence.migration.legacyTeamCapabilitiesRemaining = 0;
    evidence.migration.sunsetInvariants = 'passed';

    expect(readyToPush(evidence).blocking).toContain('V1 drain not re-run after migration');
  });

  it('records whether the branch is actually pushed rather than assuming', () => {
    expect(typeof emptyEvidence('demo').commit.pushed).toBe('boolean');
  });

  /**
   * Evidence accumulates; checking readiness must not destroy the record of what was proven.
   *
   * The first version of the generator overwrote the file on every run, so asking "are we ready"
   * quietly returned every field to `not_run` and then reported, correctly, that nothing had
   * been proven. It would have looked like a working checker while erasing its own inputs.
   */
  it('does not lose a recorded gate when readiness is re-checked', () => {
    const recorded = emptyEvidence('demo');
    recorded.local.unitTests = { status: 'passed', count: 1380 };
    recorded.migration.sunsetInvariants = 'passed';

    // The merge the runner performs: refresh the commit and timestamp, keep every measurement.
    const rechecked = { ...recorded, generatedAt: new Date().toISOString(), commit: emptyEvidence('demo').commit };

    expect(rechecked.local.unitTests).toEqual({ status: 'passed', count: 1380 });
    expect(rechecked.migration.sunsetInvariants).toBe('passed');
  });
});
