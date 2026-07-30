import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { defineSecret, defineString } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import {
  finalizeSubmission,
  retryStalledFinalizations,
  sendDueConfirmationReminders,
  sweepOverdueConfirmations,
} from './finalize';

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
const paymentCallbackBaseUrl = defineString('GOALPLACE_PAYMENT_CALLBACK_BASE_URL', {
  default: '',
  description: 'Registered App Hosting HTTPS origin used by the sandbox reconciliation job.',
});
const paymentReconciliationSecret = defineSecret('GOALPLACE_RECONCILIATION_SECRET');
const fantasyScoringSecret = defineSecret('GOALPLACE_FANTASY_SCORING_SECRET');

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
 * A finalization document is immutable and version-specific, making it the durable handoff
 * to Fantasy. If the App Hosting call fails, this trigger retries the same event and the
 * scoring service's idempotency keys make repeated delivery safe.
 */
export const onOfficialResultFinalized = onDocumentCreated(
  {
    document: 'finalizations/{finalizationId}',
    database: DATABASE_ID,
    region: REGION,
    secrets: [fantasyScoringSecret],
  },
  async (event) => {
    const finalization = event.data?.data();
    const matchId = finalization?.matchId as string | undefined;
    if (!matchId) {
      logger.error('Fantasy scoring skipped: finalization has no matchId.', {
        finalizationId: event.params.finalizationId,
      });
      return;
    }
    const baseUrl = paymentCallbackBaseUrl.value();
    if (!baseUrl.startsWith('https://')) {
      throw new Error('Fantasy scoring App Hosting base URL is not configured.');
    }
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/fantasy/score-finalized`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goalplace-fantasy-secret': fantasyScoringSecret.value(),
      },
      body: JSON.stringify({ matchId }),
    });
    if (!response.ok) throw new Error(`Fantasy scoring endpoint returned ${response.status}.`);
    logger.info('Official Fantasy Points generated', {
      matchId,
      finalizationId: event.params.finalizationId,
      result: await response.json(),
    });
  },
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
    const reminders = await sendDueConfirmationReminders(db);
    const escalated = await sweepOverdueConfirmations(db);
    const retried = await retryStalledFinalizations(db);
    logger.info('Reconciliation sweep complete', {
      escalated: escalated.length,
      reminders: reminders.length,
      retried: retried.length,
    });
  }
);

export const lockFantasyLineups = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: REGION,
    timeoutSeconds: 120,
    secrets: [fantasyScoringSecret],
  },
  async () => {
    const baseUrl = paymentCallbackBaseUrl.value();
    if (!baseUrl.startsWith('https://')) {
      throw new Error('Fantasy lineup locking App Hosting base URL is not configured.');
    }
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/fantasy/lock-lineups`, {
      method: 'POST',
      headers: {
        'x-goalplace-fantasy-secret': fantasyScoringSecret.value(),
      },
    });
    if (!response.ok) throw new Error(`Fantasy lineup lock endpoint returned ${response.status}.`);
    logger.info('Fantasy lineup deadline sweep complete', await response.json());
  },
);

/**
 * Sandbox payment recovery path for callbacks that are delayed or never delivered.
 * This only calls the App Hosting reconciliation boundary; provider credentials remain
 * in the web runtime and no payout operation is exposed here.
 */
export const reconcilePaymentIntents = onSchedule(
  {
    schedule: 'every 10 minutes',
    region: REGION,
    timeoutSeconds: 300,
    secrets: [paymentReconciliationSecret],
  },
  async () => {
    const baseUrl = paymentCallbackBaseUrl.value();
    if (!baseUrl.startsWith('https://')) {
      logger.warn('Payment reconciliation skipped: callback base URL is not configured.');
      return;
    }
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/payments/reconcile`, {
      method: 'POST',
      headers: {
        'x-goalplace-reconciliation-secret': paymentReconciliationSecret.value(),
      },
    });
    if (!response.ok) {
      throw new Error(`Payment reconciliation endpoint returned ${response.status}.`);
    }
    logger.info('Payment reconciliation sweep complete', await response.json());
  },
);
