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

export function fakeFirestore(): FakeFirestore {
  const store = new Map<string, Map<string, Data>>();
  const reads: string[] = [];
  const state = { commits: 0 };

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
    batch() {
      const operations: Array<() => void> = [];
      return {
        set(ref: { path: string }, data: Data) {
          const [name, id] = splitPath(ref.path);
          operations.push(() => collectionOf(name).set(id, { ...data }));
        },
        delete(ref: { path: string }) {
          const [name, id] = splitPath(ref.path);
          operations.push(() => collectionOf(name).delete(id));
        },
        async commit() {
          state.commits += 1;
          operations.forEach((run) => run());
        },
      };
    },
  };

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
