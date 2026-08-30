import type { Firestore } from 'firebase-admin/firestore';

/**
 * Uploads that were authorized, landed, and were never confirmed.
 *
 * ## Why they exist at all
 *
 * `/api/uploads/session` mints a signed URL and records the authorization. `/confirm` is what
 * inspects the stored object, checks it against what was authorized, and creates the media
 * record. Confirmation is the caller's move, and nothing compels it, so from an attacker's
 * point of view every check that lives there is optional: mint a session, upload, never
 * confirm, repeat to the rate limit. The signature now bounds the SIZE of each object, which
 * is the more important half. This is the other half, because thirty unconfirmed 15MB objects
 * every five minutes is still a bill nobody agreed to, and none of them is referenced by
 * anything.
 *
 * ## Why it deletes rather than reports
 *
 * An unconfirmed object past its session expiry cannot become addressable: publication reads
 * the media record, and there is no media record. It is not evidence of anything, nobody can
 * reach it, and it is not recoverable through any product surface. Leaving it costs storage
 * and tells nobody anything.
 *
 * Genuinely interrupted uploads are the case this must not punish, and the session TTL is what
 * protects them: a caller has the whole window to confirm, and this only ever touches sessions
 * whose window has closed.
 */

export type OrphanSweepReport = {
  /** Expired sessions examined. */
  examined: number;
  /** Objects that existed in the bucket and were removed. */
  objectsDeleted: number;
  /** Sessions closed without an object to remove, because nothing was ever uploaded. */
  sessionsClosed: number;
  errors: string[];
};

/** Bounded so one sweep cannot become an unbounded read on a busy day. */
const MAX_PER_PASS = 500;

export async function sweepUnconfirmedUploads(
  db: Firestore,
  deleteObject: (storagePath: string) => Promise<boolean>,
  now: Date = new Date(),
): Promise<OrphanSweepReport> {
  const report: OrphanSweepReport = {
    examined: 0, objectsDeleted: 0, sessionsClosed: 0, errors: [],
  };

  const due = await db.collection('uploadSessions')
    .where('status', '==', 'authorized')
    .where('expiresAt', '<=', now.toISOString())
    .limit(MAX_PER_PASS)
    .get();

  for (const session of due.docs) {
    report.examined += 1;
    const storagePath = String(session.data()?.storagePath ?? '');
    try {
      /*
       * The object is removed before the session is closed, in that order. A session marked
       * expired with the object still present is an orphan this sweep would never look at
       * again; an object removed under a session still marked authorized is picked up on the
       * next pass and removed again harmlessly.
       */
      const deleted = storagePath ? await deleteObject(storagePath) : false;
      if (deleted) report.objectsDeleted += 1;
      else report.sessionsClosed += 1;

      await session.ref.set({
        status: 'expired',
        expiredBySweepAt: now.toISOString(),
        sweptObjectDeleted: deleted,
        updatedAt: now.toISOString(),
      }, { merge: true });
    } catch (error) {
      // One unreachable object must not stop the pass: the rest of the backlog is the point.
      report.errors.push(`${session.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return report;
}
