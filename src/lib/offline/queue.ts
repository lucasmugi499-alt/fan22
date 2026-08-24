/**
 * The append-only outbox a Field Manager captures into.
 *
 * A match is recorded on a cheap Android phone with no signal, and the queue is what makes
 * that survivable: every event is written locally first, given an identity and a position in
 * a sequence, and replayed when the radio comes back.
 *
 * ## The two rules that make the server able to trust it
 *
 * `clientEventId` is generated on the device and is the idempotency key. Posting the same
 * one ten times records one event, which is what makes a retry safe when the response was
 * lost rather than the request.
 *
 * `clientSequence` is monotonic and never skips. The server uses gaps to detect events that
 * were captured and never arrived, so a hole means "something is missing, reconcile before
 * finalizing". That only works if nothing else can create a hole, which is why this queue has
 * no remove operation at all. An eight-second undo appends a superseding entry and leaves the
 * original in place; deleting it would put a hole in the sequence and make the server report
 * a phantom missing event on every corrected goal.
 *
 * `clientSequence` is therefore a transmission counter, not an event count. It counts what
 * was written to this queue, including corrections and including entries that were later
 * superseded.
 *
 * ## Storage
 *
 * The store is an interface rather than IndexedDB directly, so the sequencing rules can be
 * tested without a browser and so a device where IndexedDB is unavailable (private mode on
 * some Android browsers) degrades to memory rather than failing to capture at all. Memory is
 * genuinely worse: it does not survive a force quit. It is still better than refusing to
 * record a match that is already being played.
 */

export type QueueEntry<TPayload = unknown> = {
  /** Device-generated idempotency key. The server records one event per value, ever. */
  clientEventId: string;
  /** Monotonic within a match. Never skips, never reused, never removed. */
  clientSequence: number;
  matchId: string;
  payload: TPayload;
  /** An observation, never authority. The clock comes from the server anchor. */
  deviceTime: string;
  syncState: 'pending' | 'synced';
  /** Set when this entry supersedes an earlier one, rather than replacing it. */
  supersedesClientEventId?: string;
};

export interface QueueStore {
  readAll(matchId: string): Promise<QueueEntry[]>;
  put(entry: QueueEntry): Promise<void>;
  putMany(entries: QueueEntry[]): Promise<void>;
}

/** In-memory store. Used in tests, and as the fallback when IndexedDB is unavailable. */
export function createMemoryQueueStore(): QueueStore {
  const rows = new Map<string, QueueEntry>();
  return {
    async readAll(matchId) {
      return [...rows.values()]
        .filter((entry) => entry.matchId === matchId)
        .sort((a, b) => a.clientSequence - b.clientSequence);
    },
    async put(entry) {
      rows.set(entry.clientEventId, entry);
    },
    async putMany(entries) {
      for (const entry of entries) rows.set(entry.clientEventId, entry);
    },
  };
}

const DB_NAME = 'goalplace-match-ops';
const DB_VERSION = 1;
const STORE = 'queue';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'clientEventId' });
        store.createIndex('matchId', 'matchId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createIndexedDbQueueStore(): QueueStore {
  let database: Promise<IDBDatabase> | null = null;
  const db = () => (database ??= openDatabase());

  async function write(entries: QueueEntry[]) {
    const handle = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = handle.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const entry of entries) store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    async readAll(matchId) {
      const handle = await db();
      return new Promise<QueueEntry[]>((resolve, reject) => {
        const tx = handle.transaction(STORE, 'readonly');
        const request = tx.objectStore(STORE).index('matchId').getAll(matchId);
        request.onsuccess = () => {
          resolve((request.result as QueueEntry[]).sort((a, b) => a.clientSequence - b.clientSequence));
        };
        request.onerror = () => reject(request.error);
      });
    },
    put: (entry) => write([entry]),
    putMany: (entries) => write(entries),
  };
}

/** Prefers durable storage, falls back to memory rather than refusing to capture. */
export function createQueueStore(): QueueStore {
  if (typeof indexedDB === 'undefined') return createMemoryQueueStore();
  try {
    return createIndexedDbQueueStore();
  } catch {
    return createMemoryQueueStore();
  }
}

export type OfflineQueue<TPayload = unknown> = {
  /** Append a new observation. Returns the entry, including the sequence it was given. */
  append(payload: TPayload, options?: { clientEventId?: string }): Promise<QueueEntry<TPayload>>;
  /**
   * Append an entry that supersedes an earlier one.
   *
   * Not a deletion and not an edit. The original keeps its sequence number and its place, so
   * the record shows what was observed, that it was corrected, and in what order.
   */
  supersede(
    supersedesClientEventId: string,
    payload: TPayload,
    options?: { clientEventId?: string },
  ): Promise<QueueEntry<TPayload>>;
  /** Everything still waiting to reach the server, in sequence order. */
  pending(): Promise<QueueEntry<TPayload>[]>;
  all(): Promise<QueueEntry<TPayload>[]>;
  markSynced(clientEventIds: string[]): Promise<void>;
  /** The gap check the server performs, run locally so the app can warn before attestation. */
  sequenceGaps(): Promise<number[]>;
};

export function createOfflineQueue<TPayload = unknown>(input: {
  matchId: string;
  store?: QueueStore;
  now?: () => Date;
  newId?: () => string;
}): OfflineQueue<TPayload> {
  const store = input.store ?? createQueueStore();
  const now = input.now ?? (() => new Date());
  const newId = input.newId ?? (() =>
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `evt_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`));

  /**
   * Derived from what is already stored rather than held in a variable.
   *
   * A counter in memory resets when the app is force-quit and reopened mid-match, which would
   * restart the sequence at 1 and make every subsequent event collide with one already sent.
   * Reading the maximum back from storage costs one query per append and cannot drift.
   */
  async function nextSequence() {
    const entries = await store.readAll(input.matchId);
    return entries.reduce((highest, entry) => Math.max(highest, entry.clientSequence), 0) + 1;
  }

  async function write(
    payload: TPayload,
    extras: { clientEventId?: string; supersedesClientEventId?: string },
  ) {
    // Fields assigned rather than spread. An earlier version spread `extras` over the entry,
    // which wrote `clientEventId: undefined` whenever a caller did not supply one, so every
    // entry collided on the same key and the queue held exactly one row.
    const entry: QueueEntry<TPayload> = {
      clientEventId: extras.clientEventId ?? newId(),
      clientSequence: await nextSequence(),
      matchId: input.matchId,
      payload,
      deviceTime: now().toISOString(),
      syncState: 'pending',
      ...(extras.supersedesClientEventId
        ? { supersedesClientEventId: extras.supersedesClientEventId }
        : {}),
    };
    await store.put(entry as QueueEntry);
    return entry;
  }

  return {
    append: (payload, options) => write(payload, { clientEventId: options?.clientEventId }),
    supersede: (supersedesClientEventId, payload, options) =>
      write(payload, { clientEventId: options?.clientEventId, supersedesClientEventId }),
    async pending() {
      const entries = await store.readAll(input.matchId);
      return entries.filter((entry) => entry.syncState === 'pending') as QueueEntry<TPayload>[];
    },
    async all() {
      return (await store.readAll(input.matchId)) as QueueEntry<TPayload>[];
    },
    async markSynced(clientEventIds) {
      if (!clientEventIds.length) return;
      const ids = new Set(clientEventIds);
      const entries = await store.readAll(input.matchId);
      const touched = entries
        .filter((entry) => ids.has(entry.clientEventId))
        .map((entry) => ({ ...entry, syncState: 'synced' as const }));
      await store.putMany(touched);
    },
    async sequenceGaps() {
      const entries = await store.readAll(input.matchId);
      const seen = new Set(entries.map((entry) => entry.clientSequence));
      const highest = entries.reduce((max, entry) => Math.max(max, entry.clientSequence), 0);
      const gaps: number[] = [];
      for (let sequence = 1; sequence <= highest; sequence += 1) {
        if (!seen.has(sequence)) gaps.push(sequence);
      }
      return gaps;
    },
  };
}
