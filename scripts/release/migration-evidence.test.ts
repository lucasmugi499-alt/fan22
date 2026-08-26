import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { emptyEvidence, mostRecentEvidence, readyToPush } from './migration-evidence';

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

/**
 * Evidence survives the next commit.
 *
 * The file is named for the commit, which is right — evidence is a claim about a specific
 * tree. But the merge only ever looked for a file with the identical sha, so the first commit
 * after a gate was run produced a blank template and printed `Ready to push: NO` with every
 * gate blocking. Nothing had regressed: the migration had been proven hours earlier and a
 * documentation commit erased the record of it.
 *
 * That is the same failure the merge was added to fix, one level up — the checker destroying
 * its own inputs and then correctly reporting that nothing is proven.
 */
describe('evidence carried across commits', () => {
  function scratch() {
    return mkdtempSync(path.join(tmpdir(), 'goalplace-evidence-'));
  }

  function write(dir: string, name: string, evidence: unknown) {
    const full = path.join(dir, name);
    writeFileSync(full, JSON.stringify(evidence));
    return full;
  }

  it('finds the most recent evidence when this commit has none', () => {
    const dir = scratch();
    const proven = emptyEvidence('demo');
    proven.migration.sunsetInvariants = 'passed';
    proven.commit.sha = 'aaaaaaaaaaaa';
    write(dir, 'operations-model-v2-aaaaaaa.json', proven);

    const found = mostRecentEvidence(dir, path.join(dir, 'operations-model-v2-bbbbbbb.json'));

    expect(found?.migration.sunsetInvariants).toBe('passed');
  });

  it('never carries a file forward onto itself', () => {
    // The exclusion is what stops a re-run reading its own half-written output as history.
    const dir = scratch();
    const self = write(dir, 'operations-model-v2-aaaaaaa.json', emptyEvidence('demo'));

    expect(mostRecentEvidence(dir, self)).toBeNull();
  });

  it('skips a corrupt file rather than losing the whole history', () => {
    const dir = scratch();
    const proven = emptyEvidence('demo');
    proven.migration.sunsetInvariants = 'passed';
    write(dir, 'operations-model-v2-aaaaaaa.json', proven);
    writeFileSync(path.join(dir, 'operations-model-v2-bbbbbbb.json'), '{ not json');

    expect(mostRecentEvidence(dir, path.join(dir, 'operations-model-v2-ccccccc.json'))
      ?.migration.sunsetInvariants).toBe('passed');
  });

  it('returns null when there is genuinely nothing to inherit', () => {
    expect(mostRecentEvidence(scratch(), 'nothing.json')).toBeNull();
  });
});
