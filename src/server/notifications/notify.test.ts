import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  leagueOperatorUserIds,
  notificationDocument,
  notificationId,
  notify,
  notifyAll,
} from './notify';

/**
 * Notifications were built end to end on the read side and written by almost nothing.
 *
 * A notifications page, a live subscription hook, read/unread handling, a batch mark-all, and
 * a Firestore rule letting an owner update their own read state and nothing else — all of it
 * existed. Exactly two places in the codebase created a notification, both inside the fantasy
 * scoring service. Nothing notified on a result submitted, a confirmation falling due, a
 * confirmation going overdue, a result disputed, a result finalized, or a reconciliation
 * exception raised.
 *
 * The bilateral confirmation workflow and the exception queue both depend on somebody
 * noticing. Without a writer the platform relies on grassroots volunteers voluntarily checking
 * a dashboard, and it looks slow when it is actually waiting.
 */

type Written = { path: string; data: Record<string, unknown> };

function fakeDb(options: { failWrites?: boolean; operators?: string[] } = {}) {
  const written: Written[] = [];
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        set: async (data: Record<string, unknown>) => {
          if (options.failWrites) throw new Error('firestore is down');
          written.push({ path: `${name}/${id}`, data });
        },
      }),
      where: () => ({
        where: () => ({
          limit: () => ({
            get: async () => {
              if (options.failWrites) throw new Error('firestore is down');
              return {
                docs: (options.operators ?? []).map((userId) => ({ data: () => ({ userId }) })),
              };
            },
          }),
        }),
      }),
    }),
  } as unknown as Firestore;
  return { db, written };
}

const INPUT = {
  userId: 'user_1',
  event: 'result_finalized' as const,
  entityId: 'match_1',
  title: 'Result finalized',
  body: 'A match result has been verified.',
  href: '/matches/match_1',
};

describe('the document id', () => {
  it('is derived from the event, the thing, and the recipient', () => {
    // Not `.add()`. Firestore triggers are retried by design, and `.add()` mints a new
    // document every time — at-least-once delivery plus `.add()` is a duplicate generator.
    expect(notificationId(INPUT)).toBe(notificationId({ ...INPUT }));
  });

  it('differs per recipient, so a fan-out is one notification each', () => {
    expect(notificationId({ ...INPUT, userId: 'user_2' })).not.toBe(notificationId(INPUT));
  });

  it('differs per thing, so two matches are two notifications', () => {
    expect(notificationId({ ...INPUT, entityId: 'match_2' })).not.toBe(notificationId(INPUT));
  });

  it('differs per event, so being told two things about one match is two notifications', () => {
    expect(notificationId({ ...INPUT, event: 'result_disputed' })).not.toBe(notificationId(INPUT));
  });

  it('is a legal Firestore document id even for ids containing slashes', () => {
    // Entity ids are not guaranteed to be free of `/`, which Firestore forbids in a document
    // id, and the raw concatenation can exceed the 1500-byte limit. Hence the hash.
    const id = notificationId({ ...INPUT, entityId: 'leagues/l1/matches/m1' });
    expect(id).not.toContain('/');
    expect(id.length).toBeLessThanOrEqual(40);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });
});

describe('writing one', () => {
  it('writes to a deterministic id rather than appending', async () => {
    const { db, written } = fakeDb();
    await notify(db, INPUT);
    expect(written).toHaveLength(1);
    expect(written[0].path).toBe(`notifications/${notificationId(INPUT)}`);
  });

  it('makes a redelivered trigger a no-op rather than a duplicate', async () => {
    const { db, written } = fakeDb();
    await notify(db, INPUT);
    await notify(db, INPUT);
    await notify(db, INPUT);
    // Three writes, one document. A Cloud Function retried three times produces one
    // notification — the acceptance criterion, verbatim.
    expect(new Set(written.map((item) => item.path)).size).toBe(1);
  });

  it('starts unread and carries a destination', async () => {
    const document = notificationDocument(INPUT);
    expect(document.read).toBe(false);
    // A notification with no destination tells somebody that something happened and then
    // makes them go and find it.
    expect(document.href).toBe('/matches/match_1');
  });

  it('never throws, so a courtesy cannot fail the operation it announces', async () => {
    // A finalization rolled back because a notification write failed would trade a real
    // guarantee for a cosmetic one — and on a retried trigger, repeatedly.
    const { db } = fakeDb({ failWrites: true });
    await expect(notify(db, INPUT)).resolves.toBe(false);
  });
});

describe('writing to several people', () => {
  it('writes one per recipient', async () => {
    const { db, written } = fakeDb();
    const count = await notifyAll(db, ['user_1', 'user_2', 'user_3'], INPUT);
    expect(count).toBe(3);
    expect(new Set(written.map((item) => item.path)).size).toBe(3);
  });

  it('collapses a duplicated recipient', async () => {
    const { db, written } = fakeDb();
    await notifyAll(db, ['user_1', 'user_1'], INPUT);
    expect(written).toHaveLength(1);
  });

  it('ignores empty recipients rather than writing a document with no owner', async () => {
    const { db, written } = fakeDb();
    await notifyAll(db, ['user_1', '', undefined as unknown as string], INPUT);
    expect(written).toHaveLength(1);
  });

  it('writes nothing when there is nobody to tell', async () => {
    const { db, written } = fakeDb();
    expect(await notifyAll(db, [], INPUT)).toBe(0);
    expect(written).toHaveLength(0);
  });
});

describe('resolving who to tell', () => {
  it('reads league operators from the capability index', async () => {
    // The same projection the server and Firestore Rules consult — not a role claim and not
    // the legacy adminUserIds field. A recipient list derived differently from the authority
    // list would eventually notify somebody who cannot act and miss somebody who can.
    const { db } = fakeDb({ operators: ['op_1', 'op_2'] });
    expect(await leagueOperatorUserIds(db, 'league_1')).toEqual(['op_1', 'op_2']);
  });

  it('de-duplicates an operator holding more than one assignment', async () => {
    const { db } = fakeDb({ operators: ['op_1', 'op_1', 'op_2'] });
    expect(await leagueOperatorUserIds(db, 'league_1')).toEqual(['op_1', 'op_2']);
  });

  it('returns nobody rather than throwing when the index cannot be read', async () => {
    const { db } = fakeDb({ failWrites: true });
    expect(await leagueOperatorUserIds(db, 'league_1')).toEqual([]);
  });
});

describe('what a redelivery restores', () => {
  it('resets read state, because a recurrence is news again', async () => {
    // Deliberately not `{ merge: true }`. Merging would leave a stale `read: true` on a fact
    // that has genuinely happened again.
    const { db, written } = fakeDb();
    await notify(db, INPUT);
    expect(written[0].data.read).toBe(false);
  });

  it('stamps a creation time, defaulting to now', () => {
    expect(notificationDocument(INPUT).createdAt).toBeTruthy();
    expect(notificationDocument({ ...INPUT, createdAt: '2026-08-29T00:00:00.000Z' }).createdAt)
      .toBe('2026-08-29T00:00:00.000Z');
  });
});

describe('the console error on failure', () => {
  it('names the event and entity, not the recipient', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { db } = fakeDb({ failWrites: true });
    await notify(db, INPUT);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('could not write a notification'),
      expect.objectContaining({ event: 'result_finalized', entityId: 'match_1' }),
    );
    spy.mockRestore();
  });
});
