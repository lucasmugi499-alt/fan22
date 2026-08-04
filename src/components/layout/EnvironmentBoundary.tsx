'use client';

import { useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { clearPrivateCaches } from '@/lib/offline';
import type { PublicEnvironment } from '@/lib/environment';

const STORAGE_KEY = 'goalplace256.environment';

/** Identity as reported by the origin actually serving the request. */
type ServedIdentity = PublicEnvironment & { servedBy?: string };
const APP_PREFIXES = ['goalplace256.', 'goalplace256:', 'goalplace:', 'firebase:'];

function currentEnvironment(): PublicEnvironment {
  return {
    environment: (process.env.NEXT_PUBLIC_GOALPLACE_ENVIRONMENT ?? 'local') as PublicEnvironment['environment'],
    environmentVersion: process.env.NEXT_PUBLIC_GOALPLACE_ENVIRONMENT_VERSION ?? 'local-dev',
    firebaseProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'unconfigured',
    dataMode: process.env.NEXT_PUBLIC_DATA_MODE ?? 'mock',
  };
}

function sameEnvironment(left: ServedIdentity, right: ServedIdentity) {
  return (
    left.environment === right.environment &&
    left.environmentVersion === right.environmentVersion &&
    left.firebaseProjectId === right.firebaseProjectId &&
    left.dataMode === right.dataMode &&
    // A changed origin means the public URL was pointed somewhere else, which is exactly
    // the case build-time constants cannot see from inside a cached bundle.
    (left.servedBy ?? '') === (right.servedBy ?? '')
  );
}

/**
 * Asks the origin who it is.
 *
 * The build-time constants below are baked into the bundle, so on their own they detect
 * a redeploy but not a gateway swapping origins beneath a cached bundle. The server's
 * answer is authoritative; the constants are the fallback when it cannot be reached.
 */
async function servedIdentity(): Promise<ServedIdentity | null> {
  try {
    const response = await fetch('/api/environment', { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json() as ServedIdentity;
  } catch {
    return null;
  }
}

function clearStorage(storage: Storage) {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && APP_PREFIXES.some((prefix) => key.startsWith(prefix))) storage.removeItem(key);
  }
}

async function clearBrowserState() {
  await clearPrivateCaches().catch(() => undefined);
  if (auth) await signOut(auth).catch(() => undefined);

  clearStorage(window.localStorage);
  clearStorage(window.sessionStorage);

  if ('caches' in window) {
    const names = await window.caches.keys().catch(() => []);
    await Promise.all(names.map((name) => window.caches.delete(name))).catch(() => undefined);
  }

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
    await Promise.all(registrations.map((registration) => registration.unregister())).catch(() => undefined);
  }

  const indexedDb = window.indexedDB as IDBFactory & {
    databases?: () => Promise<Array<{ name?: string }>>;
  };
  const databases = await indexedDb.databases?.().catch(() => []) ?? [];
  await Promise.all(
    databases
      .map((database) => database.name)
      .filter((name): name is string => Boolean(name))
      .filter((name) => name.startsWith('firebase') || name.startsWith('goalplace'))
      .map((name) =>
        new Promise<void>((resolve) => {
          const request = indexedDb.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
          request.onblocked = () => resolve();
        }),
      ),
  );
}

export function EnvironmentBoundary({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let cancelled = false;

    async function reconcile() {
      // Server truth first; build constants only if the origin cannot be reached.
      const next = await servedIdentity() ?? currentEnvironment();
      if (cancelled) return;

      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return;
      }

      let previous: ServedIdentity | null = null;
      try {
        previous = JSON.parse(stored) as ServedIdentity;
      } catch {
        previous = null;
      }

      if (previous && sameEnvironment(previous, next)) return;

      await clearBrowserState().catch(() => undefined);
      if (cancelled) return;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.location.reload();
    }

    void reconcile();
    return () => {
      cancelled = true;
    };
  }, []);

  return <>{children}</>;
}
