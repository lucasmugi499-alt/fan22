import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
// Relative, not `@/`. This module is reachable from the Cloud Functions bundle through the
// finalizer and the lifecycle sweeps, where a path alias survives into the emitted CommonJS
// and fails at require time. verify-bundle fails the build if one reappears.
import type { Notification } from '../../types';

/**
 * The one way a notification gets written.
 *
 * ## What was missing
 *
 * Everything on the READ side existed: a notifications page, a live subscription hook,
 * read/unread handling, a batch mark-all, and a Firestore rule letting an owner update their
 * own read state and nothing else. What did not exist was a writer. Exactly two places in the
 * codebase created a notification, both inside the fantasy scoring service.
 *
 * Nothing notified on the events that actually matter operationally: a result submitted, an
 * opponent's confirmation falling due, a confirmation going overdue, a result disputed, a
 * result finalized, a reconciliation exception raised.
 *
 * The bilateral confirmation workflow and the exception queue both depend on somebody
 * noticing. Without notifications the platform relies on grassroots volunteers voluntarily
 * checking a dashboard, which they will not do — a club's 72-hour confirmation window elapses
 * with no prompt, the submission escalates to `confirmation_overdue`, and the platform looks
 * slow when it was actually waiting. It is also why the demo feels alive and a fresh
 * environment would not: the demo's 264 notifications are seeded.
 *
 * ## Deterministic ids, not `.add()`
 *
 * The two fantasy calls use `.add()`, which mints a new document every time. A Cloud Function
 * that is retried — and Firestore triggers are retried, by design, on any thrown error — then
 * produces a second identical notification. At-least-once delivery plus `.add()` is a
 * duplicate generator.
 *
 * So the id is derived from what the notification is ABOUT: `{event}:{entityId}:{userId}`,
 * hashed to keep it a legal document id. Writing the same notification twice overwrites
 * rather than duplicates, which makes redelivery a genuine no-op. This is the same reasoning
 * the finalizer applies with its idempotency keys, and the same reasoning behind keying result
 * submissions by `matchId` so "one active submission per match" is atomic by document
 * collision rather than by a read-then-write race.
 *
 * ## Never throws
 *
 * A notification is a courtesy. Failing to send one must never fail the operation it was
 * announcing — a finalization that rolled back because a notification write failed would
 * trade a real guarantee for a cosmetic one, and on a retried trigger it would do so
 * repeatedly. Every function here swallows its errors and logs them.
 */

export type NotificationEvent = NonNullable<Notification['type']>;

export type NotifyInput = {
  /** Who is being told. One document per recipient. */
  userId: string;
  event: NotificationEvent;
  /**
   * What the notification is about — a match id, a submission id, an exception id.
   *
   * Part of the document id, so the same event about the same thing for the same person is
   * one notification however many times it is delivered.
   */
  entityId: string;
  title: string;
  body: string;
  /**
   * Where this takes the reader.
   *
   * Effectively required. A notification with no destination tells somebody that something
   * happened and then makes them go and find it, which for an operator with a queue is worse
   * than not being told. The type allows it to be absent only because the two fantasy calls
   * predate this.
   */
  href?: string;
  createdAt?: string;
};

/**
 * `{event}:{entityId}:{userId}`, hashed.
 *
 * Hashed rather than concatenated because entity ids and user ids are not guaranteed to be
 * free of `/`, which Firestore forbids in a document id, and because the raw form can exceed
 * the 1500-byte limit. The hash is deterministic, so the idempotency property survives.
 */
export function notificationId(input: Pick<NotifyInput, 'event' | 'entityId' | 'userId'>): string {
  return createHash('sha256')
    .update(`${input.event}:${input.entityId}:${input.userId}`)
    .digest('hex')
    .slice(0, 40);
}

export function notificationDocument(input: NotifyInput): Notification {
  return {
    id: notificationId(input),
    userId: input.userId,
    type: input.event,
    title: input.title,
    body: input.body,
    read: false,
    ...(input.href ? { href: input.href } : {}),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

/**
 * Write one notification. Idempotent, and never throws.
 *
 * Returns whether it was written, so a caller that wants to count them can, without having to
 * decide what to do about a failure.
 */
export async function notify(db: Firestore, input: NotifyInput): Promise<boolean> {
  try {
    const document = notificationDocument(input);
    // `set` on a deterministic id, not `add`. A redelivered trigger overwrites the identical
    // document instead of creating a second one.
    //
    // Not `{ merge: true }`: a re-notification should restore the notification to its original
    // state, including `read: false` if the underlying thing genuinely happened again. Merge
    // would leave a stale `read: true` on a fact that has recurred.
    await db.collection('notifications').doc(document.id).set(document);
    return true;
  } catch (error) {
    console.error('GoalPlace256 could not write a notification', {
      event: input.event,
      entityId: input.entityId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * The same notification to several people — both clubs in a fixture, every operator of a
 * league.
 *
 * Ids stay distinct because the recipient is part of the id, so this is not a fan-out of one
 * notification but one notification each, individually idempotent. Duplicate recipients are
 * collapsed, since a user listed twice would otherwise write the same document twice.
 */
export async function notifyAll(
  db: Firestore,
  userIds: readonly string[],
  input: Omit<NotifyInput, 'userId'>,
): Promise<number> {
  const recipients = [...new Set(userIds.filter(Boolean))];
  const results = await Promise.all(
    recipients.map((userId) => notify(db, { ...input, userId })),
  );
  return results.filter(Boolean).length;
}

/**
 * Everyone holding operator authority over a league.
 *
 * Read from `accessIndex`, which is the same projection the server and Firestore Rules
 * consult, rather than from a role claim or the legacy `adminUserIds` field. A notification
 * list derived differently from the authority list would eventually notify somebody who
 * cannot act and miss somebody who can.
 */
export async function leagueOperatorUserIds(
  db: Firestore,
  leagueId: string,
): Promise<string[]> {
  try {
    const snapshot = await db.collection('accessIndex')
      .where('scopeType', '==', 'league')
      .where('scopeId', '==', leagueId)
      .limit(50)
      .get();
    return [...new Set(
      snapshot.docs
        .map((doc) => doc.data()?.userId as string | undefined)
        .filter((userId): userId is string => Boolean(userId)),
    )];
  } catch (error) {
    console.error('GoalPlace256 could not resolve league operators to notify', {
      leagueId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
