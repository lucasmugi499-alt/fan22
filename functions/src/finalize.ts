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
const TEAMS = 'teams';
const NOTIFICATIONS = 'notifications';

/**
 * Creates deterministic 24h/48h action reminders for every active opponent Team Admin.
 * Re-running the sweep cannot duplicate a notification because both the marker and
 * notification document id include the reminder hour.
 */
export async function sendDueConfirmationReminders(db: Firestore): Promise<string[]> {
  const now = new Date().toISOString();
  const earliest = new Date(Date.now() - 72 * 3_600_000).toISOString();
  const snap = await db
    .collection(SUBMISSIONS)
    .where('status', '==', 'pending_confirmation')
    .where('submittedAt', '>=', earliest)
    .limit(200)
    .get();
  const sent: string[] = [];

  for (const doc of snap.docs) {
    await db.runTransaction(async (transaction) => {
      const currentSnapshot = await transaction.get(doc.ref);
      if (!currentSnapshot.exists) return;
      const submission = { id: currentSnapshot.id, ...currentSnapshot.data() } as ResultSubmission;
      if (submission.status !== 'pending_confirmation') return;
      const due = dueReminders(submission.submittedAt, now);
      const markers = new Set(submission.remindersSentAt ?? []);
      const pendingHours = due.filter((hour) => !markers.has(`${hour}h`));
      if (!pendingHours.length) return;
      const teamRef = db.collection(TEAMS).doc(submission.opponentTeamId);
      const teamSnapshot = await transaction.get(teamRef);
      const adminUserIds = Array.isArray(teamSnapshot.data()?.adminUserIds)
        ? teamSnapshot.data()!.adminUserIds as string[]
        : [];

      for (const hour of pendingHours) {
        for (const userId of adminUserIds) {
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
