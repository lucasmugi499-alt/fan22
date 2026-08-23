import { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import {
  dueReminders,
  isConfirmationOverdue,
  matchVerificationFor,
} from '../../src/lib/resultSubmission';
import { ResultSubmission } from '../../src/types';
import { finalizeSubmission } from '../../src/server/resultFinalizer';
import type { FinalizerActivation } from '../../src/server/finalizerActivation';

export { finalizeSubmission } from '../../src/server/resultFinalizer';

const SUBMISSIONS = 'resultSubmissions';
const MATCHES = 'matches';
const NOTIFICATIONS = 'notifications';

/**
 * Creates deterministic 24h/48h action reminders for every active opponent Team Admin.
 * Re-running the sweep cannot duplicate a notification because both the marker and
 * notification document id include the reminder hour.
 */
/**
 * Who is actually responsible for confirming this team's results, right now.
 *
 * Resolved from the canonical access projection rather than `team.adminUserIds`. That array
 * is a legacy membership list which no longer carries authority, and it goes stale in the
 * one direction that matters: a revoked operator keeps receiving "confirm this result"
 * notifications about a club they no longer represent, while the person who actually
 * replaced them is never told. That is a privacy leak and an operational failure at the same
 * time — the result quietly ages toward escalation because nobody who could act was asked.
 *
 * Filtered in memory on capabilities rather than with an array-contains clause, so this
 * needs no composite index; the number of operators scoped to one club is small.
 */
async function resolveConfirmationRecipients(db: Firestore, teamId: string): Promise<string[]> {
  if (!teamId) return [];
  const projections = await db
    .collection('accessIndex')
    .where('scopeType', '==', 'team')
    .where('scopeId', '==', teamId)
    .get();

  const nowMillis = Date.now();
  return projections.docs
    .map((entry) => entry.data())
    .filter((data) => {
      const capabilities = data?.capabilities;
      if (!Array.isArray(capabilities) || !capabilities.includes('team.result.confirm')) return false;
      // An expired projection is not a recipient either — the same rule the authorization
      // path applies, applied to who gets told.
      const expiry = data?.expiresAtMillis;
      return typeof expiry !== 'number' || nowMillis < expiry;
    })
    .map((data) => String(data.userId))
    .filter(Boolean);
}

export async function sendDueConfirmationReminders(db: Firestore): Promise<string[]> {
  const now = new Date().toISOString();
  const earliest = new Date(Date.now() - 72 * 3_600_000).toISOString();

  /**
   * Ordered, cursored traversal rather than a bare `.limit(200)`.
   *
   * Without an order, "the first 200 matching records" is whatever Firestore returns, and
   * the same 200 can occupy the window on every run — so records beyond them starve
   * indefinitely and their reminders never fire. Ordering by the range field and paging with
   * a cursor means every pending submission is reached exactly once per sweep.
   */
  const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  const PAGE = 200;
  const MAX_PAGES = 25;
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let query = db
      .collection(SUBMISSIONS)
      .where('status', '==', 'pending_confirmation')
      .where('submittedAt', '>=', earliest)
      .orderBy('submittedAt')
      .limit(PAGE);
    if (cursor) query = query.startAfter(cursor);
    const page_ = await query.get();
    if (page_.empty) break;
    docs.push(...page_.docs);
    if (page_.size < PAGE) break;
    cursor = page_.docs[page_.size - 1];
  }

  const sent: string[] = [];

  for (const doc of docs) {
    const preliminary = doc.data() as ResultSubmission;
    const recipients = await resolveConfirmationRecipients(db, preliminary.opponentTeamId);
    if (!recipients.length) {
      // Said out loud rather than skipped silently. No canonical confirmer for a club with a
      // result pending is an access-configuration problem, and the visible symptom would
      // otherwise be a result that escalates for no apparent reason.
      console.warn(
        `[reminders] no operator holds team.result.confirm for team ${preliminary.opponentTeamId}; `
        + `submission ${doc.id} has nobody to notify.`,
      );
      // `continue`, not `return`: one misconfigured club must not abort the sweep for every
      // other pending result.
      continue;
    }
    await db.runTransaction(async (transaction) => {
      const currentSnapshot = await transaction.get(doc.ref);
      if (!currentSnapshot.exists) return;
      const submission = { id: currentSnapshot.id, ...currentSnapshot.data() } as ResultSubmission;
      if (submission.status !== 'pending_confirmation') return;
      const due = dueReminders(submission.submittedAt, now);
      const markers = new Set(submission.remindersSentAt ?? []);
      const pendingHours = due.filter((hour) => !markers.has(`${hour}h`));
      if (!pendingHours.length) return;
      for (const hour of pendingHours) {
        for (const userId of recipients) {
          const notificationId = `result_${submission.id}_${hour}h_${userId}`;
          transaction.set(db.collection(NOTIFICATIONS).doc(notificationId), {
            id: notificationId,
            userId,
            type: 'result_confirmation_required',
            title: hour === 48 ? 'Result confirmation due soon' : 'Result confirmation required',
            body: `${hour} hours have passed. Confirm or dispute the submitted result before it escalates to the league.`,
            read: false,
            href: '/team-admin/fixtures',
            createdAt: now,
          }, { merge: false });
          sent.push(notificationId);
        }
        markers.add(`${hour}h`);
      }
      transaction.update(doc.ref, {
        remindersSentAt: [...markers],
        updatedAt: now,
      });
    });
  }
  return sent;
}

/**
 * Moves submissions whose 72h window has lapsed to `confirmation_overdue`.
 *
 * This escalates to the league. It never confirms — non-response is not consent.
 */
export async function sweepOverdueConfirmations(db: Firestore): Promise<string[]> {
  const now = new Date().toISOString();
  const snap = await db
    .collection(SUBMISSIONS)
    .where('status', '==', 'pending_confirmation')
    .where('confirmationDeadline', '<=', now)
    .limit(200)
    .get();

  const escalated: string[] = [];

  for (const doc of snap.docs) {
    const submission = { id: doc.id, ...doc.data() } as ResultSubmission;
    if (!isConfirmationOverdue(submission, now)) continue;

    await doc.ref.update({
      status: 'confirmation_overdue',
      // Keep the public match record honest about where the result stands.
      updatedAt: now,
    });

    await doc.ref.collection('events').doc().create({
      submissionId: submission.id,
      from: 'pending_confirmation',
      to: 'confirmation_overdue',
      actor: 'system',
      actorUserId: 'system:sweep',
      note: 'Confirmation window lapsed without an opponent response.',
      createdAt: now,
    });

    await db.collection(MATCHES).doc(submission.matchId).update({
      verificationStatus: matchVerificationFor('confirmation_overdue'),
    });

    escalated.push(submission.id);
  }

  return escalated;
}

/**
 * Retries settled submissions that never reached `official`, covering transient trigger
 * failures. Safe to run repeatedly — `finalizeSubmission` is idempotent via the ledger.
 */
export async function retryStalledFinalizations(
  db: Firestore,
  activation: FinalizerActivation,
): Promise<string[]> {
  const snap = await db
    .collection(SUBMISSIONS)
    .where('status', '==', 'confirmed')
    .limit(200)
    .get();

  const retried: string[] = [];

  for (const doc of snap.docs) {
    const outcome = await finalizeSubmission(db, doc.id, activation);
    if (outcome.action === 'finalized') {
      logger.warn('Sweep finalized a submission the trigger missed', { matchId: doc.id });
      retried.push(doc.id);
    }
  }

  return retried;
}
