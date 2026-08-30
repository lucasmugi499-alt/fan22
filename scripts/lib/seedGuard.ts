import { GOALPLACE_DATABASE_ID } from './firestoreTarget';

/**
 * What a mock-data seed is allowed to write to, and how an operator says so.
 *
 * ## Why this exists
 *
 * `npm run seed:firebase` writes every document in `src/data/mockDatabase.ts` — demo users,
 * fabricated balances, invented career statistics — using whichever Admin credentials happen
 * to be in the environment. It took no project argument, no database argument and no
 * confirmation. This repository's `.env.local` carries Admin credentials, and the name on the
 * command is `seed:firebase`, which reads like a setup step rather than a bulk write of
 * fictional records into whatever the shell was last pointed at.
 *
 * `npm run seed:demo` had the same problem twice over: no guard, and `getFirestore()` with no
 * database id, so it wrote to `(default)` rather than to `fg256`. On the demo project there is
 * no `(default)` and it fails loudly. On a project that has one it succeeds silently into a
 * database nothing reads.
 *
 * ## The shape of the guard
 *
 * Everything is named, nothing is inferred. The project must appear in `.firebaserc` so an
 * arbitrary credential cannot be a target at all; the database must be the named one; the
 * environment must be confirmed by typing a phrase that carries its name, so a phrase for one
 * environment cannot confirm a command against another.
 *
 * Production is refused outright and has no phrase. There is no version of "seed the mock
 * database into production" that is a thing somebody meant to do, so it is not a confirmation
 * question — it is a wall.
 */

export type SeedEnvironment = 'staging' | 'demo' | 'beta';

/**
 * One phrase per seedable environment, each naming its own environment.
 *
 * Production is deliberately absent. Adding it here is the only way to make a production seed
 * possible, which is exactly the review this should require.
 */
export const SEED_CONFIRM_PHRASES: Record<SeedEnvironment, string> = {
  staging: 'SEED-GOALPLACE-STAGING',
  demo: 'SEED-GOALPLACE-DEMO',
  beta: 'SEED-GOALPLACE-BETA',
};

/** Aliases whose value is still a placeholder name a project that does not exist. */
export function isPlaceholderProject(projectId: string | undefined): boolean {
  return !projectId || projectId.startsWith('REPLACE_WITH_') || projectId.startsWith('REPLACE-WITH-');
}

export type SeedDecision =
  | { ok: true; projectId: string; databaseId: string; environment: SeedEnvironment; label: string }
  | { ok: false; reason: string };

export function decideSeedTarget(input: {
  projectId?: string;
  databaseId?: string;
  confirm?: string;
  /** The `.firebaserc` alias map: alias -> projectId. */
  aliases: Record<string, string>;
}): SeedDecision {
  const { projectId, confirm, aliases } = input;
  const databaseId = input.databaseId ?? GOALPLACE_DATABASE_ID;

  if (!projectId) {
    return {
      ok: false,
      reason: 'Name the project with --project. A seed must never run against whatever credentials happen to be set.',
    };
  }

  const alias = Object.entries(aliases).find(([, id]) => id === projectId)?.[0];
  if (!alias) {
    return {
      ok: false,
      reason: `${projectId} is not an environment in .firebaserc, so this command has no idea what it would be writing to.`,
    };
  }
  if (isPlaceholderProject(projectId)) {
    return { ok: false, reason: `The ${alias} project has not been provisioned yet.` };
  }
  if (alias === 'production' || alias === 'prod') {
    return {
      ok: false,
      reason: 'Mock data is never seeded into production. If production needs data, it needs a migration, not a fixture set.',
    };
  }

  const environment = alias as SeedEnvironment;
  const phrase = SEED_CONFIRM_PHRASES[environment];
  if (!phrase) {
    return { ok: false, reason: `No seed confirmation phrase exists for "${alias}", so it cannot be seeded.` };
  }

  if (databaseId !== GOALPLACE_DATABASE_ID) {
    return {
      ok: false,
      reason: `GoalPlace stores everything in the named database "${GOALPLACE_DATABASE_ID}". `
        + `Writing to "${databaseId}" would fill a database nothing reads.`,
    };
  }

  if (confirm !== phrase) {
    return {
      ok: false,
      reason: `This writes fictional records to ${projectId}/${databaseId}. Re-run with --confirm ${phrase}`,
    };
  }

  return { ok: true, projectId, databaseId, environment, label: `${projectId}/${databaseId}` };
}
