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
import { applySearchIndexChange } from './searchIndex';
import { currentFinalizerActivation, decideFinalization } from './finalizerMode';
import type { SearchEntityType } from '../../src/lib/search/searchProjection';

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
/**
 * Deliberately the camelCase Secret Manager id that App Hosting already references, not
 * the SCREAMING_SNAKE env-var name.
 *
 * App Hosting exposes env `GOALPLACE_FANTASY_SCORING_SECRET` backed by the Secret Manager
 * secret `goalplaceFantasyScoringSecret`. Declaring the SCREAMING_SNAKE name here would
 * demand a SECOND Secret Manager secret holding the same credential — and the function
 * authenticates to `/api/fantasy/lock-lineups`, which compares against App Hosting's copy.
 * Two copies of one shared credential drift on rotation: rotate one and lineup locking
 * starts failing authentication with nothing obviously wrong.
 *
 * The code reads `.value()`, so the identifier is internal only.
 */
const fantasyScoringSecret = defineSecret('goalplaceFantasyScoringSecret');

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

    // Activation gate. Checked before any read of the submission so an 'off' deployment
    // cannot write an official record even if the rest of the handler regressed.
    const activation = currentFinalizerActivation();
    const decision = decideFinalization({
      submissionId: matchId,
      mode: activation.mode,
      canaryAllowlist: activation.canaryAllowlist,
    });
    if (!decision.proceed) {
      logger.info('Finalization suppressed by activation mode', {
        matchId,
        mode: decision.mode,
        reason: decision.reason,
      });
      return;
    }

    const result = await finalizeSubmission(db, matchId);

    if (result.action === 'finalized') {
      logger.info('Result finalized', { matchId, key: result.finalizationKey, mode: decision.mode });
    } else if (result.action === 'blocked') {
      // A contradictory result is the one outcome an operator has to find out about. It
      // was previously indistinguishable from an ordinary no-op: both logged `debug` with
      // "No finalization required", so a blocked official result was invisible in the
      // very logs you would watch after activation.
      logger.warn('Finalization blocked for League review', {
        matchId,
        reason: result.reason,
        exceptionId: result.exceptionId,
        mode: decision.mode,
      });
    } else {
      logger.debug('No finalization required', { matchId, reason: result.reason, mode: decision.mode });
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
    if (!response.ok) {
      // The endpoint returns its reason in the body. Logging only the status made a real
      // failure — a competition pointing at a scoring profile that does not exist — look
      // like a bare 409, and the cause had to be found by reproducing the call by hand.
      const detail = await response.text().catch(() => '');
      throw new Error(`Fantasy scoring endpoint returned ${response.status}: ${detail.slice(0, 400)}`);
    }
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


/**
 * Search index freshness.
 *
 * The index is a projection, and a stale projection fails silently: a newly created
 * athlete simply never appears in search, with nothing erroring. These triggers keep it
 * in step with the entities it describes, so `search:index:apply` is a repair and
 * backfill tool rather than the only thing keeping search correct.
 *
 * Each handler is a cheap no-op when nothing searchable changed.
 */
function searchIndexTrigger(collection: string, type: SearchEntityType) {
  return onDocumentWritten(
    {
      document: `${collection}/{entityId}`,
      database: DATABASE_ID,
      region: REGION,
    },
    async (event) => {
      const entityId = event.params.entityId as string;
      const after = event.data?.after?.exists ? event.data.after.data() : undefined;
      try {
        const outcome = await applySearchIndexChange(db, type, entityId, after);
        if (outcome !== 'unchanged') {
          logger.info('Search index updated', { type, entityId, outcome });
        }
      } catch (error) {
        // Never fail the originating write because a discovery projection could not be
        // updated. A repair pass can rebuild it; a blocked roster edit cannot be undone.
        logger.error('Search index update failed', { type, entityId, error });
      }
    },
  );
}

export const onAthleteWrittenIndexSearch = searchIndexTrigger('athletes', 'athlete');
export const onTeamWrittenIndexSearch = searchIndexTrigger('teams', 'team');
export const onLeagueWrittenIndexSearch = searchIndexTrigger('leagues', 'league');
export const onSeasonWrittenIndexSearch = searchIndexTrigger('seasons', 'season');
