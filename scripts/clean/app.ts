/**
 * Admin app construction for the cleanup scripts.
 *
 * The credentials in `.env.local` belong to PRODUCTION. To make that impossible to use by
 * accident, this loader reports which project the credentials belong to so `validate()` can
 * refuse a mismatch, and it never falls back to application-default credentials.
 */

import { readFileSync } from 'node:fs';
import { initializeApp, cert, deleteApp, type App } from 'firebase-admin/app';

export interface Credentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  storageBucket?: string;
}

/** Reads KEY=value pairs from an env file without pulling in a dependency. */
function readEnvFile(path: string): Record<string, string> {
  let raw = '';
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    out[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

/**
 * Loads service-account credentials. `--credentials <path>` selects an explicit service
 * account JSON, which is how a staging run should be pointed at staging. With no flag we fall
 * back to the env file, whose project is surfaced to the caller for the mismatch check.
 */
export function loadCredentials(credentialsPath?: string, envPath = '.env.local'): Credentials | null {
  if (credentialsPath) {
    const json = JSON.parse(readFileSync(credentialsPath, 'utf8'));
    if (!json.project_id || !json.client_email || !json.private_key) {
      throw new Error(`${credentialsPath} is not a valid service account key file.`);
    }
    return {
      projectId: json.project_id,
      clientEmail: json.client_email,
      privateKey: json.private_key,
      storageBucket: `${json.project_id}.firebasestorage.app`,
    };
  }

  const env = { ...readEnvFile(envPath), ...process.env } as Record<string, string>;
  const projectId = env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) return null;

  return {
    projectId,
    clientEmail,
    // Env files store the PEM with escaped newlines.
    privateKey: privateKey.replace(/\\n/g, '\n'),
    storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
  };
}

export function createApp(creds: Credentials, name: string): App {
  return initializeApp(
    {
      credential: cert({
        projectId: creds.projectId,
        clientEmail: creds.clientEmail,
        privateKey: creds.privateKey,
      }),
      storageBucket: creds.storageBucket,
    },
    name
  );
}

export async function destroyApp(app: App): Promise<void> {
  await deleteApp(app);
}
