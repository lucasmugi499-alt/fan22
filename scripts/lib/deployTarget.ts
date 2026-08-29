import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * What a deploy is actually about to write to, resolved and asserted before it runs.
 *
 * ## Why this exists
 *
 * `deploy:prod:candidate-after-approval` — the script named for a production rules deploy —
 * passed `--project manifest-quasar-479416-s7`, which is the DEMO project. Running it
 * deployed `firestore.rules.next` to the demo database while the operator following the
 * runbook believed they had promoted rules to production.
 *
 * Two things made that survivable-looking rather than loud:
 *
 *   1. All three environments use the same database id, `fg256`. A wrong `--project`
 *      therefore lands on a database that exists, under the name the operator expected,
 *      instead of erroring on a missing target. The name in the output is right; the
 *      project it belongs to is not.
 *   2. Nothing compared the project being deployed to against the environment the config
 *      file was named for. The two were only ever connected in somebody's head.
 *
 * So the target is resolved in one place, out of `.firebaserc` and `config/environments.json`
 * together, and a disagreement between the two is refused rather than printed. This is the
 * deploy-time sibling of `firestoreTarget.ts`, which does the same job for the migration
 * scripts that read counts.
 *
 * A count with no stated target is not evidence. Neither is a deploy.
 */

export type DeployEnvironment = 'demo' | 'beta' | 'production' | 'staging';

export type ResolvedDeployTarget = {
  environment: DeployEnvironment;
  /** What `--project` resolved to after `.firebaserc` alias expansion. */
  projectId: string;
  /** How it was named on the command line, alias or raw id. */
  requestedProject: string;
  databaseId: string;
  configFile?: string;
  label: string;
};

export const PLACEHOLDER_PREFIX = 'REPLACE_WITH_';

type FirebaseRc = { projects?: Record<string, string> };

type EnvironmentRegistry = {
  environments: Record<string, {
    firebaseProjectId: string;
    firestoreDatabaseId: string;
    appHostingConfig: string;
  }>;
};

function readJson<T>(root: string, file: string): T {
  return JSON.parse(readFileSync(path.join(root, file), 'utf8')) as T;
}

/**
 * `.firebaserc` aliases first, then the raw value.
 *
 * An alias that is not declared is returned unchanged rather than rejected, because
 * `firebase deploy --project <raw-id>` is legal and some operators use it. The
 * environment cross-check below is what catches a wrong raw id, so this does not need to.
 */
export function resolveProjectAlias(requested: string, root = process.cwd()): string {
  const rc = readJson<FirebaseRc>(root, '.firebaserc');
  return rc.projects?.[requested] ?? requested;
}

/**
 * The project id an environment is registered to own, or `undefined` when it is still a
 * placeholder.
 *
 * Placeholders are reported as "not provisioned" rather than compared, because comparing
 * them would let `REPLACE_WITH_BETA_PROJECT` match itself and pass a deploy to a project
 * that does not exist.
 */
export function registeredProjectId(
  environment: DeployEnvironment,
  root = process.cwd(),
): string | undefined {
  if (environment === 'staging') {
    // Staging predates the environment registry and lives only in `.firebaserc`.
    const rc = readJson<FirebaseRc>(root, '.firebaserc');
    return rc.projects?.staging;
  }
  const registry = readJson<EnvironmentRegistry>(root, 'config/environments.json');
  const id = registry.environments?.[environment]?.firebaseProjectId;
  if (!id || id.startsWith(PLACEHOLDER_PREFIX)) return undefined;
  return id;
}

export function registeredDatabaseId(
  environment: DeployEnvironment,
  root = process.cwd(),
): string {
  if (environment === 'staging') return 'fg256';
  const registry = readJson<EnvironmentRegistry>(root, 'config/environments.json');
  return registry.environments?.[environment]?.firestoreDatabaseId ?? 'fg256';
}

export type PreflightInput = {
  environment: DeployEnvironment;
  requestedProject: string;
  databaseId?: string;
  configFile?: string;
  root?: string;
};

/**
 * Refuses a deploy whose resolved project is not the one the named environment owns.
 *
 * Returns the resolved target so the caller can print it. Every deploy script prints its
 * target before running, so the evidence of what was deployed where is in the operator's
 * scrollback rather than inferred afterwards from the script's name.
 */
export function assertDeployTarget(input: PreflightInput): ResolvedDeployTarget {
  const root = input.root ?? process.cwd();
  const projectId = resolveProjectAlias(input.requestedProject, root);
  const databaseId = input.databaseId ?? registeredDatabaseId(input.environment, root);
  const expected = registeredProjectId(input.environment, root);

  if (projectId.startsWith(PLACEHOLDER_PREFIX)) {
    throw new Error(
      `Refusing to deploy: --project ${input.requestedProject} resolves to the placeholder `
      + `'${projectId}'. The ${input.environment} Firebase project has not been provisioned. `
      + 'See docs/ENVIRONMENT_PROVISIONING.md.',
    );
  }

  if (!expected) {
    throw new Error(
      `Refusing to deploy: config/environments.json still carries a ${PLACEHOLDER_PREFIX} `
      + `placeholder for '${input.environment}', so there is nothing to check `
      + `--project ${input.requestedProject} against. Provision the project and fill the `
      + 'registry first — see docs/ENVIRONMENT_PROVISIONING.md.',
    );
  }

  if (projectId !== expected) {
    // The message names both, because the whole failure mode is a project id that looks
    // plausible in isolation. `manifest-quasar-479416-s7` reads like a production id.
    throw new Error(
      `Refusing to deploy: '${input.environment}' is registered to project '${expected}', but `
      + `--project ${input.requestedProject} resolves to '${projectId}'. All environments share `
      + `the database id '${databaseId}', so a wrong project lands on a database that exists `
      + 'rather than erroring. Nothing was deployed.',
    );
  }

  return {
    environment: input.environment,
    projectId,
    requestedProject: input.requestedProject,
    databaseId,
    configFile: input.configFile,
    label: `${projectId}/${databaseId}`,
  };
}

export function describeTarget(target: ResolvedDeployTarget): string {
  return [
    `  environment : ${target.environment}`,
    `  project     : ${target.projectId}${
      target.requestedProject === target.projectId ? '' : ` (alias ${target.requestedProject})`
    }`,
    `  database    : ${target.databaseId}`,
    target.configFile ? `  config      : ${target.configFile}` : undefined,
  ].filter(Boolean).join('\n');
}
