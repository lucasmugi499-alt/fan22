import { describe, expect, it, vi } from 'vitest';
import { expireLapsedAssignments, runProjectionRepairs } from './lifecycle';

function firestore(collections: Record<string, Record<string, unknown>[]>) {
  const updates: { id: string; patch: Record<string, unknown> }[] = [];

  const query = (name: string, clauses: [string, string, unknown][] = [], after?: string, cap = 200) => ({
    where: (f: string, o: string, v: unknown) => query(name, [...clauses, [f, o, v]], after, cap),
    orderBy: () => query(name, clauses, after, cap),
    limit: (n: number) => query(name, clauses, after, n),
    startAfter: (cursor: { id: string }) => query(name, clauses, cursor.id, cap),
    get: async () => {
      let rows = (collections[name] ?? []).filter((row) => clauses.every(([field, op, value]) =>
        op === '==' ? row[field] === value
          : op === '<=' ? String(row[field] ?? '') <= String(value)
            : op === 'in' ? (value as unknown[]).includes(row[field])
              : true));
      rows = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
      if (after) rows = rows.slice(rows.findIndex((row) => row.id === after) + 1);
      const page = rows.slice(0, cap);
      const ref = (row: Record<string, unknown>) => ({
        id: String(row.id),
        update: vi.fn(async (patch: Record<string, unknown>) => {
          updates.push({ id: String(row.id), patch });
          Object.assign(row, patch);
        }),
      });
      return {
        empty: page.length === 0,
        size: page.length,
        docs: page.map((row) => ({ id: String(row.id), data: () => row, ref: ref(row) })),
      };
    },
  });

  const db = {
    collection: (name: string) => query(name),
    runTransaction: async (handler: (tx: unknown) => Promise<unknown>) => handler({
      get: async (ref: { id: string }) => {
        const row = Object.values(collections).flat().find((item) => String(item.id) === ref.id);
        return { exists: Boolean(row), id: ref.id, data: () => row };
      },
      update: (ref: { id: string }, patch: Record<string, unknown>) => {
        updates.push({ id: ref.id, patch });
        const row = Object.values(collections).flat().find((item) => String(item.id) === ref.id);
        if (row) Object.assign(row, patch);
      },
    }),
  };
  return { db, updates, collections };
}

const past = new Date(Date.now() - 86_400_000).toISOString();
const future = new Date(Date.now() + 86_400_000).toISOString();

describe('lapsed assignments converge without touching what is still valid', () => {
  it('transitions only assignments whose validUntil has passed', async () => {
    const { db, updates } = firestore({
      accessAssignments: [
        { id: 'a_lapsed', userId: 'user_1', status: 'active', validUntil: past },
        { id: 'a_future', userId: 'user_1', status: 'active', validUntil: future },
      ],
    });

    const report = await expireLapsedAssignments(db as never, { rebuild: async () => 0 });

    expect(report).toMatchObject({ lapsedFound: 1, transitioned: 1 });
    expect(updates.map((u) => u.id)).toEqual(['a_lapsed']);
  });

  it('never sweeps up a permanent grant alongside a temporary one', async () => {
    /**
     * The scenario the earliest-expiry projection creates: one scope, two grants. The
     * permanent one has no `validUntil`, so the query cannot match it — and the rebuild
     * afterwards re-derives the scope from what legitimately remains.
     */
    const { db, updates } = firestore({
      accessAssignments: [
        { id: 'a_permanent', userId: 'user_1', status: 'active' },
        { id: 'a_temporary', userId: 'user_1', status: 'active', validUntil: past },
      ],
    });

    const report = await expireLapsedAssignments(db as never, { rebuild: async () => 1 });

    expect(report.transitioned).toBe(1);
    expect(updates.map((u) => u.id)).toEqual(['a_temporary']);
    expect(report.usersRebuilt).toBe(1);
  });

  it('is idempotent when two invocations overlap', async () => {
    // A scheduler is the one caller guaranteed to run concurrently with itself.
    const { db, updates } = firestore({
      accessAssignments: [{ id: 'a1', userId: 'user_1', status: 'active', validUntil: past }],
    });

    await expireLapsedAssignments(db as never, { rebuild: async () => 0 });
    const second = await expireLapsedAssignments(db as never, { rebuild: async () => 0 });

    // The second run finds nothing active to transition, and does not re-count it.
    expect(second.transitioned).toBe(0);
    expect(updates.filter((u) => u.patch.status === 'expired')).toHaveLength(1);
  });

  it('keeps sweeping when one rebuild fails', async () => {
    const { db } = firestore({
      accessAssignments: [
        { id: 'a1', userId: 'user_bad', status: 'active', validUntil: past },
        { id: 'a2', userId: 'user_ok', status: 'active', validUntil: past },
      ],
    });

    const report = await expireLapsedAssignments(db as never, {
      rebuild: async (userId) => { if (userId === 'user_bad') throw new Error('projector down'); return 1; },
    });

    expect(report.transitioned).toBe(2);
    expect(report.usersRebuilt).toBe(1);
    expect(report.errors.join(' ')).toContain('user_bad');
  });

  it('reports without writing in dry run', async () => {
    const { db, updates } = firestore({
      accessAssignments: [{ id: 'a1', userId: 'user_1', status: 'active', validUntil: past }],
    });

    const report = await expireLapsedAssignments(db as never, { dryRun: true, rebuild: async () => 3 });

    expect(report).toMatchObject({ lapsedFound: 1, transitioned: 1, projectionsChanged: 3 });
    expect(updates).toEqual([]);
  });
});

describe('projection repairs converge, and prove they converged', () => {
  const job = (overrides: Record<string, unknown> = {}) => ({
    id: 'search_athlete_a1', status: 'pending', projectionType: 'searchIndex',
    entityType: 'athlete', entityId: 'a1', attemptCount: 0, ...overrides,
  });

  it('completes a job only when the projection verifies', async () => {
    const { db, updates } = firestore({ projectionRepairJobs: [job()] });

    const report = await runProjectionRepairs(db as never, async () => undefined, async () => true);

    expect(report).toMatchObject({ claimed: 1, completed: 1 });
    expect(updates.at(-1)?.patch.status).toBe('completed');
  });

  it('retries with backoff when the projector finishes but the projection still disagrees', async () => {
    /**
     * "It did not throw" is not the property anyone wanted. A projector can complete happily
     * and leave the projection out of step with its source — the exact drift the queue exists
     * to catch.
     */
    const { db, updates } = firestore({ projectionRepairJobs: [job()] });

    const report = await runProjectionRepairs(db as never, async () => undefined, async () => false);

    expect(report).toMatchObject({ verificationFailed: 1, retryScheduled: 1, completed: 0 });
    const final = updates.at(-1)?.patch as Record<string, unknown>;
    expect(final.status).toBe('retry_wait');
    expect(final.lastErrorCode).toBe('verification_failed');
    expect(final.nextAttemptAt).toBeTruthy();
  });

  it('does not pick up a job before its backoff window elapses', async () => {
    const { db } = firestore({
      projectionRepairJobs: [job({ status: 'retry_wait', attemptCount: 1, nextAttemptAt: future })],
    });
    const repair = vi.fn(async () => undefined);

    const report = await runProjectionRepairs(db as never, repair, async () => true);

    expect(repair).not.toHaveBeenCalled();
    expect(report.claimed).toBe(0);
  });

  it('dead-letters a job that has spent its attempt budget', async () => {
    const { db, updates } = firestore({ projectionRepairJobs: [job({ attemptCount: 5 })] });
    const repair = vi.fn(async () => undefined);

    const report = await runProjectionRepairs(db as never, repair, async () => true);

    expect(report.deadLettered).toBe(1);
    expect(repair).not.toHaveBeenCalled();
    expect(updates.at(-1)?.patch.status).toBe('dead_letter');
  });

  it('never reprocesses a dead-lettered job', async () => {
    const { db } = firestore({ projectionRepairJobs: [job({ status: 'dead_letter', attemptCount: 5 })] });
    const repair = vi.fn(async () => undefined);

    const report = await runProjectionRepairs(db as never, repair, async () => true);

    expect(report).toMatchObject({ claimed: 0, deadLettered: 0 });
    expect(repair).not.toHaveBeenCalled();
  });

  it('truncates the error it stores', async () => {
    const { db, updates } = firestore({ projectionRepairJobs: [job()] });

    await runProjectionRepairs(
      db as never,
      async () => { throw new Error('x'.repeat(5000)); },
      async () => true,
    );

    expect(String((updates.at(-1)?.patch as Record<string, unknown>).lastErrorCode).length)
      .toBeLessThanOrEqual(301);
  });

  it('reports without claiming anything in dry run', async () => {
    const { db, updates } = firestore({ projectionRepairJobs: [job()] });
    const repair = vi.fn(async () => undefined);

    const report = await runProjectionRepairs(db as never, repair, async () => true, { dryRun: true });

    expect(report.claimed).toBe(1);
    expect(repair).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });
});
