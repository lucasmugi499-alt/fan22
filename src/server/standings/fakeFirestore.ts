/**
 * A small in-memory Firestore, enough to exercise the standings projection honestly.
 *
 * The projection's whole job is to read a season's worth of documents and write a row per
 * team, so a fake that cannot do `where`, `limit` and `batch` would only be able to test the
 * arithmetic — which already has its own tests against the pure function. What needs proving
 * here is the READ AND WRITE behaviour: that the query is scoped to one season, that stale
 * rows are deleted, that two runs produce identical documents.
 *
 * Deliberately not a general Firestore emulator. It supports exactly the operations this
 * module uses, and throws on anything else, so a future change that reaches for an unsupported
 * query fails loudly here instead of silently passing against a permissive stub.
 */

type Data = Record<string, unknown>;

/** Internal to the fake: signals that a transaction's read set moved, so it should retry. */
class TransactionConflict extends Error {
  constructor(readonly path: string) {
    super(`fakeFirestore: transaction conflict on ${path}`);
    this.name = 'TransactionConflict';
  }
}

type Where = { field: string; value: unknown };

export type FakeFirestore = {
  seed(collection: string, docs: Data[]): void;
  documents(collection: string): Data[];
  /** Every read issued, so a test can assert the query was scoped rather than a full scan. */
  reads: string[];
  /** Batch commits, so a test can assert writes were batched rather than issued one by one. */
  commits: number;
  db: unknown;
};

export type FakeFirestoreHooks = {
  /**
   * Awaited immediately before each transaction body runs.
   *
   * Exists so a test can interleave a competing writer at the exact point that matters. The
   * projection's compare-and-swap protects against a pass whose INPUTS were read before
   * another pass committed — and inputs are read outside the transaction, so reproducing that
   * needs a controlled pause between the read and the commit. Without a hook here a
   * concurrency test can only run two identical passes over unchanging data, which proves
   * nothing: both compute the same table whether or not the guard exists.
   */
  beforeTransaction?: () => Promise<void> | void;
};

export function fakeFirestore(hooks: FakeFirestoreHooks = {}): FakeFirestore {
  const store = new Map<string, Map<string, Data>>();
  const reads: string[] = [];
  const state = { commits: 0 };
  /** Per-document write counter, so a transaction can detect that its read set moved. */
  const versions = new Map<string, number>();
  let hookFired = false;

  const collectionOf = (name: string) => {
    const existing = store.get(name);
    if (existing) return existing;
    const created = new Map<string, Data>();
    store.set(name, created);
    return created;
  };

  const snapshotOf = (name: string, id: string) => {
    const data = collectionOf(name).get(id);
    return {
      id,
      exists: data !== undefined,
      data: () => (data === undefined ? undefined : { ...data }),
      ref: { path: `${name}/${id}` },
    };
  };

  const query = (name: string, wheres: Where[], limit?: number) => ({
    where(field: string, op: string, value: unknown) {
      if (op !== '==') throw new Error(`fakeFirestore supports only '==', got '${op}'`);
      return query(name, [...wheres, { field, value }], limit);
    },
    limit(count: number) {
      return query(name, wheres, count);
    },
    async get() {
      reads.push(
        `${name}[${wheres.map((w) => `${w.field}==${String(w.value)}`).join(',')}]`
        + (limit === undefined ? '' : `:${limit}`),
      );
      let docs = [...collectionOf(name).entries()]
        .filter(([, data]) => wheres.every((w) => data[w.field] === w.value))
        // Key order, so a test can prove the projection does not depend on it.
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id]) => snapshotOf(name, id));
      if (limit !== undefined) docs = docs.slice(0, limit);
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });

  const db = {
    collection(name: string) {
      return {
        doc(id: string) {
          return {
            path: `${name}/${id}`,
            id,
            async get() {
              reads.push(`${name}/${id}`);
              return snapshotOf(name, id);
            },
            async set(data: Data, opts?: { merge?: boolean }) {
              const path = `${name}/${id}`;
              const existing = opts?.merge ? collectionOf(name).get(id) ?? {} : {};
              collectionOf(name).set(id, { ...existing, ...data });
              versions.set(path, (versions.get(path) ?? 0) + 1);
            },
          };
        },
        where(field: string, op: string, value: unknown) {
          return query(name, [], undefined).where(field, op, value);
        },
        limit(count: number) {
          return query(name, [], count);
        },
        async get() {
          return query(name, [], undefined).get();
        },
      };
    },
    /**
     * Optimistic-concurrency semantics, deliberately.
     *
     * The projection's correctness under concurrency depends on Firestore aborting a
     * transaction whose read set changed. A fake that always commits would let the
     * compare-and-swap tests pass while proving nothing, so this records what the callback
     * read and re-checks it at commit — which is the property being relied on.
     */
    async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      // Firestore RETRIES a transaction whose read set moved; it does not surface the
      // conflict to the caller. Modelling that matters here: the projection's compare-and-swap
      // relies on the retry re-running the callback, which re-reads the revision, sees it has
      // advanced, and reports `superseded` so the caller can re-read its inputs. A fake that
      // threw instead would make the production code look broken when it is the fake that is.
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
          return await runOnce(fn);
        } catch (error) {
          if (!(error instanceof TransactionConflict)) throw error;
        }
      }
      throw new Error('fakeFirestore: transaction retries exhausted');
    },
    batch: () => batchImpl(),
  };

  async function runOnce<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      // Fired once, not per retry: a hook that ran on every attempt would make a test that
      // spawns a competing pass here recurse.
      if (hooks.beforeTransaction && !hookFired) {
        hookFired = true;
        await hooks.beforeTransaction();
      }
      const readVersions = new Map<string, number>();
      const operations: Array<() => void> = [];

      const tx = {
        async get(ref: { path: string }) {
          const [name, id] = splitPath(ref.path);
          readVersions.set(ref.path, versions.get(ref.path) ?? 0);
          reads.push(ref.path);
          return snapshotOf(name, id);
        },
        set(ref: { path: string }, data: Data) {
          const [name, id] = splitPath(ref.path);
          operations.push(() => {
            collectionOf(name).set(id, { ...data });
            versions.set(ref.path, (versions.get(ref.path) ?? 0) + 1);
          });
        },
        delete(ref: { path: string }) {
          const [name, id] = splitPath(ref.path);
          operations.push(() => {
            collectionOf(name).delete(id);
            versions.set(ref.path, (versions.get(ref.path) ?? 0) + 1);
          });
        },
      };

      const result = await fn(tx);

      for (const [path, seen] of readVersions) {
        if ((versions.get(path) ?? 0) !== seen) throw new TransactionConflict(path);
      }
      state.commits += 1;
      operations.forEach((run) => run());
      return result;
  }

  function batchImpl() {
      const operations: Array<() => void> = [];
      return {
        set(ref: { path: string }, data: Data) {
          const [name, id] = splitPath(ref.path);
          operations.push(() => {
            collectionOf(name).set(id, { ...data });
            versions.set(ref.path, (versions.get(ref.path) ?? 0) + 1);
          });
        },
        delete(ref: { path: string }) {
          const [name, id] = splitPath(ref.path);
          operations.push(() => {
            collectionOf(name).delete(id);
            versions.set(ref.path, (versions.get(ref.path) ?? 0) + 1);
          });
        },
        async commit() {
          state.commits += 1;
          operations.forEach((run) => run());
        },
      };
  }

  return {
    seed(name, docs) {
      docs.forEach((doc) => collectionOf(name).set(String(doc.id), { ...doc }));
    },
    documents(name) {
      return [...collectionOf(name).values()].map((data) => ({ ...data }));
    },
    reads,
    get commits() {
      return state.commits;
    },
    db,
  };
}

function splitPath(path: string): [string, string] {
  const index = path.indexOf('/');
  return [path.slice(0, index), path.slice(index + 1)];
}
