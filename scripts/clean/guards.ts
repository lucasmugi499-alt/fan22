/**
 * Safety guards for the destructive cleanup scripts.
 *
 * These are pure functions with no Firebase imports so they can be unit-tested without
 * credentials. Every refusal is deliberate: this repository's `.env.local` carries Admin SDK
 * credentials for the PRODUCTION project, so an unguarded script run from a developer laptop
 * would delete live data. Nothing here may be inferred from ambient state, a CLI alias, or a
 * default project.
 */

export type Environment = 'production' | 'staging';

export const CONFIRM_PHRASES: Record<Environment, string> = {
  production: 'RESET-GOALPLACE-PRODUCTION',
  staging: 'RESET-GOALPLACE-STAGING',
};

/** Placeholder left in .firebaserc until a real staging project exists. */
export const STAGING_PLACEHOLDER = 'REPLACE-WITH-STAGING-PROJECT-ID';

export interface CleanupArgs {
  project?: string;
  database?: string;
  env?: string;
  confirm?: string;
  preserve?: string[];
  dryRun?: boolean;
}

export interface ProjectMap {
  /** projectId -> environment, from .firebaserc aliases. */
  [projectId: string]: Environment;
}

export interface ValidatedPlan {
  projectId: string;
  databaseId: string;
  environment: Environment;
  preserveUids: string[];
  dryRun: boolean;
}

export class GuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GuardError';
  }
}

/** Minimal argv parser: `--flag value`, `--flag=value`, and boolean `--flag`. */
export function parseArgs(argv: string[]): CleanupArgs {
  const out: CleanupArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    const value = inlineValue ?? (next && !next.startsWith('--') ? next : undefined);
    if (value === undefined) {
      if (key === 'dryRun') out.dryRun = true;
      continue;
    }
    if (inlineValue === undefined && next === value) i++;
    if (key === 'preserve') {
      out.preserve = value.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (key === 'dryRun') {
      out.dryRun = value !== 'false';
    } else {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

/**
 * Builds projectId -> environment from the .firebaserc alias map, ignoring the unconfigured
 * staging placeholder so it can never be mistaken for a real target.
 */
export function buildProjectMap(aliases: Record<string, string>): ProjectMap {
  const map: ProjectMap = {};
  for (const [alias, projectId] of Object.entries(aliases)) {
    if (!projectId || projectId === STAGING_PLACEHOLDER) continue;
    if (alias === 'prod' || alias === 'production') map[projectId] = 'production';
    else if (alias === 'staging' || alias === 'stage') map[projectId] = 'staging';
  }
  return map;
}

/**
 * Refuses anything ambiguous or unsafe. `credentialProjectId` is the project the loaded
 * Admin credentials actually belong to: if it disagrees with `--project`, we would be
 * pointing a staging command at another project's data, so we stop.
 */
export function validate(
  args: CleanupArgs,
  projectMap: ProjectMap,
  options: { requireConfirm: boolean; credentialProjectId?: string | null }
): ValidatedPlan {
  const problems: string[] = [];

  if (!args.project) problems.push('--project is required (no project is ever inferred).');
  if (!args.database) problems.push('--database is required (for example: --database fg256).');
  if (!args.env) problems.push('--env is required and must be "staging" or "production".');

  if (problems.length) throw new GuardError(problems.join('\n'));

  const projectId = args.project as string;
  const databaseId = args.database as string;
  const declaredEnv = args.env as string;

  if (declaredEnv !== 'staging' && declaredEnv !== 'production') {
    throw new GuardError(`--env must be "staging" or "production", received "${declaredEnv}".`);
  }

  const knownEnv = projectMap[projectId];
  if (!knownEnv) {
    throw new GuardError(
      `Project "${projectId}" is not a known alias in .firebaserc.\n` +
        'Add it under "projects" first. Unrecognised projects are refused so a typo can ' +
        'never delete an unrelated project.'
    );
  }

  // The declared environment must match what .firebaserc says the project is. This is what
  // stops "--env staging" being pointed at the production project.
  if (knownEnv !== declaredEnv) {
    throw new GuardError(
      `Refusing to continue: .firebaserc maps "${projectId}" to ${knownEnv}, but --env says ` +
        `${declaredEnv}. Fix the command or the alias; never override this.`
    );
  }

  if (options.credentialProjectId && options.credentialProjectId !== projectId) {
    throw new GuardError(
      `Credential mismatch: the loaded Admin credentials belong to ` +
        `"${options.credentialProjectId}" but --project is "${projectId}". ` +
        'Load credentials for the target project instead of relying on whatever is in ' +
        '.env.local, which points at production.'
    );
  }

  if (options.requireConfirm) {
    const expected = CONFIRM_PHRASES[declaredEnv];
    if (args.confirm !== expected) {
      throw new GuardError(
        `This is a destructive operation on ${declaredEnv}.\n` +
          `Re-run with --confirm ${expected}`
      );
    }
  }

  return {
    projectId,
    databaseId,
    environment: declaredEnv,
    preserveUids: args.preserve ?? [],
    dryRun: args.dryRun ?? false,
  };
}
