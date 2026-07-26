import { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import {
  isConfirmationOverdue,
  matchVerificationFor,
} from '../../src/lib/resultSubmission';
import { ResultSubmission } from '../../src/types';
import { finalizeSubmission } from '../../src/server/resultFinalizer';

export { finalizeSubmission } from '../../src/server/resultFinalizer';

const SUBMISSIONS = 'resultSubmissions';
const MATCHES = 'matches';

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
export async function retryStalledFinalizations(db: Firestore): Promise<string[]> {
  const snap = await db
    .collection(SUBMISSIONS)
    .where('status', '==', 'confirmed')
    .limit(200)
    .get();

  const retried: string[] = [];

  for (const doc of snap.docs) {
    const outcome = await finalizeSubmission(db, doc.id);
    if (outcome.action === 'finalized') {
      logger.warn('Sweep finalized a submission the trigger missed', { matchId: doc.id });
      retried.push(doc.id);
    }
  }

  return retried;
}
