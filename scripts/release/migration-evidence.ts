import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/**
 * Machine-collected evidence for the Operations Model V2 migration.
 *
 * Every field here is either measured or explicitly marked as not yet proven. Nothing is
 * asserted in prose. The reason is narrow and specific: the six statuses this migration turns
 * on (implemented, tested, migrated, deployed, enabled, cloud-verified) are easy to conflate in
 * a sentence and impossible to conflate in a field that says `"not_run"`.
 *
 * What this deliberately does NOT do is claim a deployment state. Deployment facts come from
 * querying the plane, and a generator that filled them in from a config file would be producing
 * exactly the false confidence it exists to prevent.
 */

export type EvidenceStatus = 'passed' | 'failed' | 'not_run' | 'not_applicable';

export type MigrationEvidence = {
  milestone: 'operations_model_v2';
  generatedAt: string;
  commit: { sha: string; branch: string; pushed: boolean };
  local: {
    unitTests: { status: EvidenceStatus; count?: number };
    rulesTests: { status: EvidenceStatus; count?: number };
    integrationTests: { status: EvidenceStatus; count?: number };
    functionsBuild: EvidenceStatus;
    deployReady: EvidenceStatus;
  };
  migration: {
    environment: string;
    v1DrainBefore: EvidenceStatus | Record<string, number>;
    workflowsMigrated: string[];
    v1DrainAfter: EvidenceStatus | Record<string, number>;
    teamAuthorityStage: string;
    projectionsRebuilt: EvidenceStatus | number;
    legacyTeamCapabilitiesRemaining: EvidenceStatus | number;
    sunsetInvariants: EvidenceStatus;
  };
  deployment: Record<string, { revision: string | null; status: EvidenceStatus }>;
  canary: {
    matchId: string | null;
    reportId: string | null;
    candidateId: string | null;
    officialResultVersion: number | null;
    officialEventCount: number | null;
    duplicateReplay: EvidenceStatus;
    badReportException: EvidenceStatus;
  };
  unreportedSweep: {
    matchId: string | null;
    dryRunBeforeCanary: EvidenceStatus;
    deployment: EvidenceStatus;
    firstDelivery: EvidenceStatus;
    duplicateReplay: EvidenceStatus;
    officialWritesAbsent: EvidenceStatus;
  };
  exclusions: string[];
  /**
   * The commit this evidence was carried forward from, when it was not produced against this
   * tree. Absent when the evidence and the commit are the same thing.
   */
  carriedFrom?: string;
};

/**
 * The newest evidence file other than this commit's own.
 *
 * Ordered by file modification time rather than by name: the sha in the filename is not
 * sortable into history, and reading each file to compare commit dates would mean trusting a
 * field the file itself supplies. When this run is the first for a commit, whatever was most
 * recently written is the state being inherited.
 */
export function mostRecentEvidence(dir: string, exclude: string): MigrationEvidence | null {
  if (!existsSync(dir)) return null;
  const candidates = readdirSync(dir)
    .filter((name) => name.startsWith('operations-model-v2-') && name.endsWith('.json'))
    .map((name) => path.join(dir, name))
    .filter((full) => full !== exclude)
    .map((full) => ({ full, at: statSync(full).mtimeMs }))
    .sort((a, b) => b.at - a.at);

  for (const candidate of candidates) {
    try {
      return JSON.parse(readFileSync(candidate.full, 'utf8')) as MigrationEvidence;
    } catch {
      // A corrupt file is not a reason to lose the rest of the history.
      continue;
    }
  }
  return null;
}

function git(command: string) {
  try {
    return execSync(`git ${command}`, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/**
 * The template every run starts from.
 *
 * Everything defaults to `not_run`, so a field that was never measured says so rather than
 * being absent and read as fine.
 */
export function emptyEvidence(environment: string): MigrationEvidence {
  return {
    milestone: 'operations_model_v2',
    generatedAt: new Date().toISOString(),
    commit: {
      sha: git('rev-parse HEAD'),
      branch: git('rev-parse --abbrev-ref HEAD'),
      // Measured, not assumed: an unpushed branch has no upstream ref.
      pushed: git('rev-parse --abbrev-ref --symbolic-full-name @{u}') !== '',
    },
    local: {
      unitTests: { status: 'not_run' },
      rulesTests: { status: 'not_run' },
      integrationTests: { status: 'not_run' },
      functionsBuild: 'not_run',
      deployReady: 'not_run',
    },
    migration: {
      environment,
      v1DrainBefore: 'not_run',
      workflowsMigrated: [],
      v1DrainAfter: 'not_run',
      teamAuthorityStage: process.env.GOALPLACE_TEAM_AUTHORITY_STAGE ?? 'frozen',
      projectionsRebuilt: 'not_run',
      legacyTeamCapabilitiesRemaining: 'not_run',
      sunsetInvariants: 'not_run',
    },
    deployment: {
      appHosting: { revision: null, status: 'not_run' },
      firestoreRules: { revision: null, status: 'not_run' },
      storageRules: { revision: null, status: 'not_run' },
      cloudFunctions: { revision: null, status: 'not_run' },
      scheduledFunctions: { revision: null, status: 'not_applicable' },
    },
    canary: {
      matchId: null,
      reportId: null,
      candidateId: null,
      officialResultVersion: null,
      officialEventCount: null,
      duplicateReplay: 'not_run',
      badReportException: 'not_run',
    },
    unreportedSweep: {
      matchId: null,
      dryRunBeforeCanary: 'not_run',
      deployment: 'not_run',
      firstDelivery: 'not_run',
      duplicateReplay: 'not_run',
      officialWritesAbsent: 'not_run',
    },
    exclusions: [],
  };
}

/** Whether every gate that must pass before a push has actually passed. */
export function readyToPush(evidence: MigrationEvidence): { ready: boolean; blocking: string[] } {
  const blocking: string[] = [];
  const check = (label: string, status: EvidenceStatus | number | Record<string, number>) => {
    if (status !== 'passed') blocking.push(label);
  };

  check('unit tests', evidence.local.unitTests.status);
  check('rules tests', evidence.local.rulesTests.status);
  check('integration tests', evidence.local.integrationTests.status);
  check('functions build', evidence.local.functionsBuild);
  check('deploy:ready', evidence.local.deployReady);
  check('sunset invariants', evidence.migration.sunsetInvariants);

  if (evidence.migration.teamAuthorityStage !== 'retired') blocking.push('team authority still ' + evidence.migration.teamAuthorityStage);
  if (evidence.migration.legacyTeamCapabilitiesRemaining !== 0) blocking.push('legacy team capabilities not proven zero');
  if (typeof evidence.migration.v1DrainAfter === 'string') blocking.push('V1 drain not re-run after migration');

  return { ready: blocking.length === 0, blocking };
}

function main() {
  const environment = process.argv.includes('--env')
    ? process.argv[process.argv.indexOf('--env') + 1]
    : 'demo';

  const fresh = emptyEvidence(environment);
  const dir = path.join(process.cwd(), 'docs/evidence');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `operations-model-v2-${fresh.commit.sha.slice(0, 7)}.json`);

  /**
   * Evidence accumulates. Re-running this must not wipe a gate somebody already ran.
   *
   * The first version overwrote the file every time, so checking readiness destroyed the record
   * of what had been proven. That is worse than useless in a migration whose whole point is
   * that a claim without evidence is not a claim: it would quietly return every field to
   * `not_run` and make the checker look correct while erasing its own inputs.
   */
  const reset = process.argv.includes('--reset');
  const sameCommit = existsSync(file) && !reset
    ? (JSON.parse(readFileSync(file, 'utf8')) as MigrationEvidence)
    : null;

  /**
   * Evidence also carries forward ACROSS commits, not just across re-runs of one.
   *
   * The file is named for the commit, which is right — evidence is a claim about a specific
   * tree. But the merge above only found a file with the identical sha, so the first commit
   * after a gate was run produced a blank template and printed `Ready to push: NO` with every
   * gate listed as blocking. Nothing had regressed. The migration had been proven hours
   * earlier and a documentation commit erased the record of it.
   *
   * That is the same failure the merge was added to fix, one level up: the checker destroying
   * its own inputs and then correctly reporting that nothing is proven. Carrying forward keeps
   * the claim attached to the commit that inherited it, and `carriedFrom` says where it came
   * from — so a reader can see that a gate was proven on an earlier tree and judge for
   * themselves whether the commits since could have invalidated it.
   *
   * `--reset` still gives a blank one deliberately.
   */
  const previous = sameCommit ?? (reset ? null : mostRecentEvidence(dir, file));

  const evidence: MigrationEvidence = previous
    ? {
      ...previous,
      generatedAt: fresh.generatedAt,
      commit: fresh.commit,
      ...(sameCommit ? {} : { carriedFrom: previous.commit.sha.slice(0, 7) }),
    }
    : fresh;

  writeFileSync(file, `${JSON.stringify(evidence, null, 2)}\n`);

  const { ready, blocking } = readyToPush(evidence);
  const origin = sameCommit
    ? 'Evidence updated at'
    : previous
      ? `Evidence carried forward from ${previous.commit.sha.slice(0, 7)} to`
      : 'Evidence template written to';
  console.log(`${origin} ${path.relative(process.cwd(), file)}`);
  console.log(`Commit ${evidence.commit.sha.slice(0, 7)} on ${evidence.commit.branch}, pushed: ${evidence.commit.pushed}`);
  console.log(`\nReady to push: ${ready ? 'YES' : 'NO'}`);
  if (!ready) {
    console.log('Blocking:');
    for (const item of blocking) console.log(`  ${item}`);
    console.log('\nFill each field as its gate is actually run. Do not edit a status to passed');
    console.log('without the command output that proves it.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
