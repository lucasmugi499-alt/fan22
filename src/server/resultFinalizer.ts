import { Firestore, Transaction } from 'firebase-admin/firestore';
import { planFinalization } from '../lib/resultSubmission';
import { Match, ResultSubmission } from '../types';

const SUBMISSIONS = 'resultSubmissions';
const MATCHES = 'matches';
const FINALIZATIONS = 'finalizations';

export type FinalizeOutcome =
  | { action: 'finalized'; finalizationKey: string }
  | { action: 'skipped'; reason: string };

/**
 * Promote a settled claim onto the official match record in one idempotent transaction.
 * This module is server-only and is shared by App Hosting and Cloud Functions.
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
    const ledgerSnap = await tx.get(ledgerRef);
    if (ledgerSnap.exists) {
      return { action: 'skipped', reason: 'already_finalized' };
    }

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
