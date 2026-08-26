import process from 'node:process';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Which project and which DATABASE a migration script is about to act on.
 *
 * ## Why this exists
 *
 * Every GoalPlace environment stores its data in a NAMED Firestore database, `fg256`. There
 * is no `(default)` database on the demo project at all — `firestore:databases:list` returns
 * exactly one entry. `getFirestore()` with no id asks for `(default)`.
 *
 * Four of the migration scripts did precisely that: the V1 drain report, the straggler
 * migration, the sunset invariants and the field capture canary all initialized with
 * `getFirestore()` and no database id. Every one of them is a gate whose whole output is a
 * count, and every one of them would have been counting a database that does not exist.
 *
 * On this project that surfaces as `5 NOT_FOUND` and the script dies, which is survivable.
 * It is not survivable on a project that HAS a `(default)` database, because an empty one
 * answers every query with zero and the drain report's own summary line then reads
 * `Safe to retire team authority: YES` — the exact false green the whole gate exists to
 * prevent, produced by a script that appeared to run correctly. The handoff already names
 * this shape of mistake: a bridge load-tested with zero trucks.
 *
 * So the target is resolved in one place, it is never implicit, and every caller prints it
 * beside its counts. A count with no stated target is not evidence.
 */

/** The named database every GoalPlace environment uses. There is no `(default)`. */
export const GOALPLACE_DATABASE_ID = 'fg256';

export type FirestoreTarget = {
  db: Firestore;
  projectId: string;
  databaseId: string;
  /** `project/database`, for the header line of whatever is about to be reported. */
  label: string;
};

function flagValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--')) return argv[index + 1];
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

/**
 * The database id, from the flag, then the environment, then the platform default.
 *
 * `(default)` is reachable only by asking for it by name. Falling back to it is what made
 * this a bug rather than a configuration choice.
 */
export function resolveDatabaseId(argv: string[] = process.argv): string {
  return flagValue(argv, '--database')
    ?? process.env.GOALPLACE_FIRESTORE_DATABASE_ID
    ?? process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID
    ?? GOALPLACE_DATABASE_ID;
}

export function resolveProjectId(argv: string[] = process.argv): string | undefined {
  return flagValue(argv, '--project')
    ?? process.env.GOALPLACE_FIREBASE_PROJECT_ID
    ?? process.env.FIREBASE_ADMIN_PROJECT_ID
    ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    ?? process.env.GOOGLE_CLOUD_PROJECT;
}

/**
 * Credentials, then the named database.
 *
 * `GOOGLE_APPLICATION_CREDENTIALS_JSON` holds the service account inline, which is how the
 * runbook passes it. `applicationDefault()` covers `GOOGLE_APPLICATION_CREDENTIALS` pointing
 * at a file, which is what `.env.local` on a developer machine already does — the scripts do
 * not load that file themselves, so it has to be exported into the environment.
 */
export function initializeMigrationFirestore(argv: string[] = process.argv): FirestoreTarget {
  const databaseId = resolveDatabaseId(argv);
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const projectId = resolveProjectId(argv);

  if (!getApps().length) {
    initializeApp(
      raw
        ? { credential: cert(JSON.parse(raw)), projectId }
        : { credential: applicationDefault(), projectId },
    );
  }

  const app = getApps()[0];
  return {
    db: getFirestore(app, databaseId),
    projectId: projectId ?? app.options.projectId ?? 'unknown',
    databaseId,
    label: `${projectId ?? app.options.projectId ?? 'unknown'}/${databaseId}`,
  };
}
