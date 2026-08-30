import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { sweepUnconfirmedUploads } from './orphanSweep';

/**
 * Confirmation is where an upload is checked against what was authorized, and calling it is
 * the caller's move. From an attacker's point of view that made every check there optional:
 * mint a session, upload, never confirm, repeat to the rate limit, and the objects sit in the
 * bucket referenced by nothing and billed to us.
 */

type Session = { id: string; storagePath?: string };

function db(sessions: Session[]) {
  const writes: Record<string, Record<string, unknown>> = {};
  const query = {
    where: () => query,
    limit: () => query,
    get: async () => ({
      docs: sessions.map((session) => ({
        id: session.id,
        data: () => session,
        ref: {
          set: async (data: Record<string, unknown>) => {
            writes[session.id] = { ...(writes[session.id] ?? {}), ...data };
          },
        },
      })),
    }),
  };
  return { firestore: { collection: () => query } as unknown as Firestore, writes };
}

const NOW = new Date('2026-08-30T18:00:00.000Z');

describe('sweeping uploads that were never confirmed', () => {
  it('deletes the object and closes the session', async () => {
    const { firestore, writes } = db([{ id: 's1', storagePath: 'publishedMedia/a/b/c.jpg' }]);
    const remove = vi.fn(async () => true);

    const report = await sweepUnconfirmedUploads(firestore, remove, NOW);

    expect(remove).toHaveBeenCalledWith('publishedMedia/a/b/c.jpg');
    expect(report).toMatchObject({ examined: 1, objectsDeleted: 1, sessionsClosed: 0, errors: [] });
    expect(writes.s1).toMatchObject({ status: 'expired', sweptObjectDeleted: true });
  });

  it('closes a session whose upload never arrived, without counting a deletion', async () => {
    const { firestore, writes } = db([{ id: 's2', storagePath: 'publishedMedia/a/b/none.jpg' }]);
    const report = await sweepUnconfirmedUploads(firestore, async () => false, NOW);

    expect(report).toMatchObject({ examined: 1, objectsDeleted: 0, sessionsClosed: 1 });
    expect(writes.s2).toMatchObject({ status: 'expired', sweptObjectDeleted: false });
  });

  it('keeps going when one object cannot be removed', async () => {
    // A backlog is the point of a sweep. One unreachable object must not stop the pass.
    const { firestore, writes } = db([
      { id: 'bad', storagePath: 'a/b/1.jpg' },
      { id: 'good', storagePath: 'a/b/2.jpg' },
    ]);
    const report = await sweepUnconfirmedUploads(firestore, async (path) => {
      if (path.endsWith('1.jpg')) throw new Error('permission denied');
      return true;
    }, NOW);

    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain('bad');
    expect(report.objectsDeleted).toBe(1);
    expect(writes.good).toMatchObject({ status: 'expired' });
    // The failed one is NOT closed, so the next pass picks it up again.
    expect(writes.bad).toBeUndefined();
  });

  it('reports nothing to do on an empty backlog', async () => {
    const { firestore } = db([]);
    expect(await sweepUnconfirmedUploads(firestore, async () => true, NOW)).toEqual({
      examined: 0, objectsDeleted: 0, sessionsClosed: 0, errors: [],
    });
  });
});
