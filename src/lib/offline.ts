'use client';

import { del, get, keys, set } from 'idb-keyval';
import type { CreateResultSubmissionInput } from '@/data/providers/types';

const CACHE_PREFIX = 'goalplace256:data:';
const RESULT_PREFIX = 'goalplace256:result-draft:';
export const PRIVATE_CACHE_QUERY_VERSION = 'v2';

export type PrivateCacheScope = {
  projectId: string;
  databaseId: string;
  dataMode: string;
  uid: string;
  role: string;
  leagueId?: string;
  teamId?: string;
  queryVersion?: string;
};

export function privateCacheNamespace(scope: PrivateCacheScope) {
  const values = [
    scope.projectId || 'unconfigured',
    scope.databaseId || '(default)',
    scope.dataMode,
    scope.uid,
    scope.role,
    scope.leagueId || '-',
    scope.teamId || '-',
    scope.queryVersion ?? PRIVATE_CACHE_QUERY_VERSION,
  ];
  return values.map((value) => encodeURIComponent(value)).join(':');
}

export type QueuedResultDraft = {
  input: CreateResultSubmissionInput;
  files: File[];
  queuedAt: string;
};

export async function cacheData<T>(key: string, value: T) {
  await set(`${CACHE_PREFIX}${key}`, { value, cachedAt: new Date().toISOString() });
}

export async function readCachedData<T>(key: string): Promise<{ value: T; cachedAt: string } | undefined> {
  return get(`${CACHE_PREFIX}${key}`);
}

export async function queueResultDraft(namespace: string, matchId: string, draft: QueuedResultDraft) {
  await set(`${RESULT_PREFIX}${namespace}:${matchId}`, draft);
}

export async function readQueuedResultDraft(namespace: string, matchId: string): Promise<QueuedResultDraft | undefined> {
  return get(`${RESULT_PREFIX}${namespace}:${matchId}`);
}

export async function clearQueuedResultDraft(namespace: string, matchId: string) {
  await del(`${RESULT_PREFIX}${namespace}:${matchId}`);
}

export async function clearPrivateCaches() {
  const storedKeys = await keys();
  await Promise.all(
    storedKeys
      .filter((key): key is string =>
        typeof key === 'string' &&
        (key.startsWith(CACHE_PREFIX) || key.startsWith(RESULT_PREFIX)),
      )
      .map((key) => del(key)),
  );
}
