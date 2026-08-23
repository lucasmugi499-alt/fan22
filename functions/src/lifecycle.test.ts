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
        op === '==' ? row[field] === value : op === '<=' ? String(row[field]) <= String(value) : true));
      rows = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
      if (after) rows = rows.slice(rows.findIndex((row) => row.id === after) + 1);
      const page = rows.slice(0, cap);
      return {
        empty: page.length === 0,
        size: page.length,
        docs: page.map((row) => ({
          id: String(row.id),
          data: () => row,
          ref: {
            id: String(row.id),
            update: vi.fn(async (patch: Record<string, unknown>) => {
              updates.push({ id: String(row.id), patch });
              Object.assign(row, patch);
            }),
          },
        })),
      };
    },
  });

  const db = { collection: (name: string) => query(name) };
  return { db, updates };
}

describe('lapsed assignments are retired, not left to fail closed forever', () => {
  /**
   * The security half of expiry was already closed — a lapsed projection is refused at read
   * time. What remained was an availability defect, and a real one: a scope held through a
   * permanent grant AND a temporary one projects the EARLIEST expiry, correctly. The day the
   * temporary grant lapses, the whole projection is refused — including the permanent grant —
   * until something unrelated happens to rewrite it.
   *
   * Failing closed is the right direction to fail. It is not the same as being correct.
   */
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();

  it('expires only assignments whose validUntil has passed', async () => {
    const { db, updates } = firestore({
      accessAssignments: [
        { id: 'a_lapsed', userId: 'user_1', status: 'active', validUntil: past },
        { id: 'a_future', userId: 'user_1', status: 'active', validUntil: future },
        { id: 'a_permanent', userId: 'user_1', status: 'active' },
      ],
    });
    const rebuild = vi.fn(async () => undefined);

    const outcome = await expireLapsedAssignments(db as never, rebuild);

    expect(outcome.expired).toBe(1);
    expect(updates.map((u) => u.id)).toEqual(['a_lapsed']);
    expect(updates[0].patch.status).toBe('expired');
  });

  it('rebuilds each affected user once, not once per assignment', async () => {
    const { db } = firestore({
      accessAssignments: [
        { id: 'a1', userId: 'user_1', status: 'active', validUntil: past },
        { id: 'a2', userId: 'user_1', status: 'active', validUntil: past },
        { id: 'a3', userId: 'user_2', status: 'active', validUntil: past },
      ],
    });
    const rebuild = vi.fn(async () => undefined);

    const outcome = await expireLapsedAssignments(db as never, rebuild);

    expect(outcome.expired).toBe(3);
    expect(rebuild).toHaveBeenCalledTimes(2);
    expect(outcome.rebuiltUsers.sort()).toEqual(['user_1', 'user_2']);
  });
});

describe('projection repairs actually converge', () => {
  it('repairs a pending job and marks it done', async () => {
    const { db, updates } = firestore({
      projectionRepairJobs: [
        { id: 'search_athlete_a1', status: 'pending', entityType: 'athlete', entityId: 'a1', attempts: 1 },
      ],
    });

    const outcome = await runProjectionRepairs(db as never, async () => undefined);

    expect(outcome).toMatchObject({ repaired: 1, deadLettered: 0, failed: 0 });
    expect(updates[0].patch.status).toBe('repaired');
  });

  it('counts a failure and leaves the job pending for another run', async () => {
    const { db, updates } = firestore({
      projectionRepairJobs: [
        { id: 'search_athlete_a1', status: 'pending', entityType: 'athlete', entityId: 'a1', attempts: 1 },
      ],
    });

    const outcome = await runProjectionRepairs(db as never, async () => { throw new Error('still broken'); });

    expect(outcome).toMatchObject({ repaired: 0, failed: 1 });
    expect(updates[0].patch.lastError).toBe('still broken');
    expect(updates[0].patch.status).toBeUndefined();
  });

  it('dead-letters a job that has already failed its attempt budget', async () => {
    // A job failing five times will not succeed on the sixth for the same reason, and
    // leaving it pending buries the jobs that would.
    const { db, updates } = firestore({
      projectionRepairJobs: [
        { id: 'search_athlete_bad', status: 'pending', entityType: 'athlete', entityId: 'bad', attempts: 5 },
      ],
    });
    const repair = vi.fn(async () => undefined);

    const outcome = await runProjectionRepairs(db as never, repair);

    expect(outcome).toMatchObject({ repaired: 0, deadLettered: 1 });
    expect(repair).not.toHaveBeenCalled();
    expect(updates[0].patch.status).toBe('dead_letter');
  });
});
