import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  exclusions: string[];
};

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
  const existing = existsSync(file) && !process.argv.includes('--reset')
    ? (JSON.parse(readFileSync(file, 'utf8')) as MigrationEvidence)
    : null;

  const evidence: MigrationEvidence = existing
    ? { ...existing, generatedAt: fresh.generatedAt, commit: fresh.commit }
    : fresh;

  writeFileSync(file, `${JSON.stringify(evidence, null, 2)}\n`);

  const { ready, blocking } = readyToPush(evidence);
  console.log(`${existing ? 'Evidence updated at' : 'Evidence template written to'} ${path.relative(process.cwd(), file)}`);
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
