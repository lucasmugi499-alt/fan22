import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { finalizeSubmission, sweepOverdueConfirmations, retryStalledFinalizations } from './finalize';

/**
 * GoalPlace256 trusted finalizer.
 *
 * Clients submit, confirm, dispute and record league decisions. Only this code promotes a
 * settled submission onto the official match record — the Admin SDK bypasses security
 * rules, and firestore.rules denies every client path to `official`. That asymmetry is the
 * trust boundary.
 *
 * All decision logic lives in ../src/lib/resultSubmission.ts as pure functions with test
 * coverage. These handlers only read, apply and write.
 */

initializeApp();

/**
 * The Firestore instance is the NAMED database `fg256`, not `(default)`.
 *
 * This matters twice over: `getFirestore()` must be given the id, and the trigger below
 * must declare `database` too. A v1 trigger, or a v2 trigger without `database`, listens to
 * `(default)` — which in this project is empty. It would deploy cleanly, report healthy and
 * never fire.
 */
export const DATABASE_ID = 'fg256';
const db = getFirestore(DATABASE_ID);

const REGION = 'us-central1';

/**
 * Fires whenever a submission changes. Finalization runs only when the document is in a
 * finalizable state; every other write is a cheap no-op.
 */
export const onResultSubmissionWritten = onDocumentWritten(
  {
    document: 'resultSubmissions/{matchId}',
    database: DATABASE_ID,
    region: REGION,
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const matchId = event.params.matchId;
    const result = await finalizeSubmission(db, matchId);

    if (result.action === 'finalized') {
      logger.info('Result finalized', { matchId, key: result.finalizationKey });
    } else {
      logger.debug('No finalization required', { matchId, reason: result.reason });
    }
  }
);

/**
 * Hourly reconciliation.
 *
 * Two jobs, both of which must survive a transient trigger failure:
 *  1. escalate submissions whose 72h confirmation window has lapsed;
 *  2. retry any settled submission that never got finalized.
 *
 * Silence is never consent — this sweep only ever moves a lapsed submission to
 * `confirmation_overdue`, which escalates it to the league. It never confirms anything.
 */
export const reconcileResultSubmissions = onSchedule(
  {
    schedule: 'every 60 minutes',
    region: REGION,
    timeoutSeconds: 300,
  },
  async () => {
    const escalated = await sweepOverdueConfirmations(db);
    const retried = await retryStalledFinalizations(db);
    logger.info('Reconciliation sweep complete', {
      escalated: escalated.length,
      retried: retried.length,
    });
  }
);
