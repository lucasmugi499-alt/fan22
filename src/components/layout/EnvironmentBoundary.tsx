'use client';

import { useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { clearPrivateCaches } from '@/lib/offline';
import type { PublicEnvironment } from '@/lib/environment';

const STORAGE_KEY = 'goalplace256.environment';
const APP_PREFIXES = ['goalplace256.', 'goalplace256:', 'goalplace:', 'firebase:'];

function currentEnvironment(): PublicEnvironment {
  return {
    environment: (process.env.NEXT_PUBLIC_GOALPLACE_ENVIRONMENT ?? 'local') as PublicEnvironment['environment'],
    environmentVersion: process.env.NEXT_PUBLIC_GOALPLACE_ENVIRONMENT_VERSION ?? 'local-dev',
    firebaseProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'unconfigured',
    dataMode: process.env.NEXT_PUBLIC_DATA_MODE ?? 'mock',
  };
}

function sameEnvironment(left: PublicEnvironment, right: PublicEnvironment) {
  return (
    left.environment === right.environment &&
    left.environmentVersion === right.environmentVersion &&
    left.firebaseProjectId === right.firebaseProjectId &&
    left.dataMode === right.dataMode
  );
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
    const next = currentEnvironment();
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return;
    }

    let previous: PublicEnvironment | null = null;
    try {
      previous = JSON.parse(stored) as PublicEnvironment;
    } catch {
      previous = null;
    }

    if (previous && sameEnvironment(previous, next)) return;

    void clearBrowserState().finally(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.location.reload();
    });
  }, []);

  return <>{children}</>;
}
