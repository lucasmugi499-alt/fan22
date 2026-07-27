'use client';

import { del, get, set } from 'idb-keyval';
import type { CreateResultSubmissionInput } from '@/data/providers/types';

const CACHE_PREFIX = 'goalplace256:data:';
const RESULT_PREFIX = 'goalplace256:result-draft:';

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

export async function queueResultDraft(matchId: string, draft: QueuedResultDraft) {
  await set(`${RESULT_PREFIX}${matchId}`, draft);
}

export async function readQueuedResultDraft(matchId: string): Promise<QueuedResultDraft | undefined> {
  return get(`${RESULT_PREFIX}${matchId}`);
}

export async function clearQueuedResultDraft(matchId: string) {
  await del(`${RESULT_PREFIX}${matchId}`);
}
