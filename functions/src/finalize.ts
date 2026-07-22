import { Firestore, Transaction } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import {
  isConfirmationOverdue,
  matchVerificationFor,
  planFinalization,
} from '../../src/lib/resultSubmission';
import { Match, ResultSubmission } from '../../src/types';

const SUBMISSIONS = 'resultSubmissions';
const MATCHES = 'matches';
/**
 * Ledger of applied finalization keys. Existence of `finalizations/{key}` is the
 * idempotency guarantee: it is created inside the same transaction that applies the
 * result, so a retried trigger, a duplicate event, or the hourly sweep re-running all
 * collide on it and no-op rather than applying a result twice.
 */
const FINALIZATIONS = 'finalizations';

export type FinalizeOutcome =
  | { action: 'finalized'; finalizationKey: string }
  | { action: 'skipped'; reason: string };

/**
 * Promotes a settled submission onto the official match record.
 *
 * The decision is made by `planFinalization()`, a pure function covered by unit tests. This
 * function re-reads state inside a transaction and applies that plan — it never trusts
 * anything the client wrote about the submission's own readiness.
 */
export async function finalizeSubmission(
  db: Firestore,
  matchId: string
): Promise<FinalizeOutcome> {
  const submissionRef = db.collection(SUBMISSIONS).doc(matchId);

  return db.runTransaction(async (tx: Transaction) => {
    const submissionSnap = await tx.get(submissionRef);
    if (!submissionSnap.exists) return { action: 'skipped', reason: 'no_submission' };

    const submission = { id: submissionSnap.id, ...submissionSnap.data() } as ResultSubmission;

    const matchRef = db.collection(MATCHES).doc(submission.matchId);
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) return { action: 'skipped', reason: 'no_match' };

    const match = { id: matchSnap.id, ...matchSnap.data() } as Match;

    const decision = planFinalization({
      submission,
      match,
      processedKeys: [],
      now: new Date().toISOString(),
    });

    if (decision.action === 'noop') {
      return { action: 'skipped', reason: decision.reason };
    }

    const { plan } = decision;
    const ledgerRef = db.collection(FINALIZATIONS).doc(plan.finalizationKey);

    // Read the ledger last so the whole check-and-apply is inside one transaction.
    const ledgerSnap = await tx.get(ledgerRef);
    if (ledgerSnap.exists) {
      return { action: 'skipped', reason: 'already_finalized' };
    }

    // A correction replaces an earlier official version. The earlier version is copied to
    // an immutable archive rather than edited — `resultSubmissions/{matchId}` holds exactly
    // one document (its id IS the matchId, which is what makes submission creation
    // atomic), so prior versions live in the `versions` subcollection.
    if (typeof plan.supersedesVersion === 'number') {
      tx.create(submissionRef.collection('versions').doc(String(plan.supersedesVersion)), {
        ...submissionSnap.data(),
        status: 'superseded',
        supersededBySubmissionId: submission.id,
        supersededAt: plan.submission.finalizedAt,
      });
    }

    tx.update(matchRef, {
      status: plan.match.status,
      verificationStatus: plan.match.verificationStatus,
      score: plan.match.score,
      teamAScore: plan.match.score.home,
      teamBScore: plan.match.score.away,
      // Records which version is live, so a late event for an older version is refused
      // rather than silently overwriting a correction.
      officialResultVersion: plan.resultVersion,
      verifiedBy: 'system:finalizer',
      updatedAt: plan.submission.finalizedAt,
    });

    tx.update(submissionRef, {
      status: plan.submission.status,
      finalizationSource: plan.submission.finalizationSource,
      finalizationKey: plan.finalizationKey,
      finalizedAt: plan.submission.finalizedAt,
    });

    // Immutable audit entry. firestore.rules makes this subcollection append-only, so the
    // history of a disputed result cannot be rewritten after the fact.
    tx.create(submissionRef.collection('events').doc(), {
      submissionId: submission.id,
      from: submission.status,
      to: plan.submission.status,
      actor: 'system',
      actorUserId: 'system:finalizer',
      note: `Finalized via ${plan.submission.finalizationSource}`,
      createdAt: plan.submission.finalizedAt,
    });

    tx.create(ledgerRef, {
      matchId: submission.matchId,
      submissionId: submission.id,
      resultVersion: submission.resultVersion,
      finalizedAt: plan.submission.finalizedAt,
    });

    return { action: 'finalized', finalizationKey: plan.finalizationKey };
  });
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
