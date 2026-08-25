import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * A real Firestore, from the emulator.
 *
 * `FIRESTORE_EMULATOR_HOST` is what makes the Admin SDK talk to the emulator instead of a
 * project, and it is asserted rather than assumed: running this suite against production
 * credentials would write official sporting records into a live league.
 */
export const PROJECT_ID = 'goalplace256-integration';

export function requireEmulator() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST is not set. Run this suite through `npm run test:integration`, '
      + 'which starts the emulator. It must never run against a real project.',
    );
  }
}

export function integrationDb(): Firestore {
  requireEmulator();
  const existing = getApps().find((app) => app.name === 'integration');
  // No credential at all. With FIRESTORE_EMULATOR_HOST set the SDK talks to the emulator and
  // never authenticates, and supplying a placeholder service account only gives the key parser
  // something to reject.
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, 'integration');
  return getFirestore(app);
}

export async function clearFirestore() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
    method: 'DELETE',
  });
}

export async function shutdown() {
  await Promise.all(getApps().filter((app) => app.name === 'integration').map((app) => deleteApp(app)));
}

/** Finalizer activation, fully on. The gate is tested separately in the unit suite. */
export const ENABLED = { mode: 'enabled' as const, canaryAllowlist: [] as string[] };
