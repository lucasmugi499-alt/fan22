import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { gateMatchReport } from './matchReports';
import { defineSecret, defineString } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import {
  finalizeSubmission,
  finalizeFieldReport,
  retryStalledFinalizations,
  sendDueConfirmationReminders,
  sweepOverdueConfirmations,
} from './finalize';
import { applySearchIndexChange } from './searchIndex';
import { currentFinalizerActivation } from './finalizerMode';
import { expireLapsedAssignments, runProjectionRepairs } from './lifecycle';
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

    // The gate now lives inside finalizeSubmission, so every caller honours it rather
    // than just this one. The activation is still resolved here because only the Functions
    // runtime can read the deployed params.
    const activation = currentFinalizerActivation();
    const result = await finalizeSubmission(db, matchId, activation);
    if (result.action === 'skipped'
      && (result.reason === 'finalizer_off' || result.reason === 'not_in_canary_allowlist')) {
      logger.info('Finalization suppressed by activation mode', {
        matchId,
        mode: activation.mode,
        reason: result.reason,
      });
      return;
    }

    if (result.action === 'finalized') {
      logger.info('Result finalized', { matchId, key: result.finalizationKey, mode: activation.mode });
    } else if (result.action === 'blocked') {
      // A contradictory result is the one outcome an operator has to find out about. It
      // was previously indistinguishable from an ordinary no-op: both logged `debug` with
      // "No finalization required", so a blocked official result was invisible in the
      // very logs you would watch after activation.
      logger.warn('Finalization blocked for League review', {
        matchId,
        reason: result.reason,
        exceptionId: result.exceptionId,
        mode: activation.mode,
      });
    } else {
      logger.debug('No finalization required', { matchId, reason: result.reason, mode: activation.mode });
    }
  }
);

/**
 * A finalization document is immutable and version-specific, making it the durable handoff
 * to Fantasy. If the App Hosting call fails, this trigger retries the same event and the
 * scoring service's idempotency keys make repeated delivery safe.
 */
/**
 * A field report reaching full time, and what happens next.
 *
 * Two stages in one trigger, deliberately. The gate decides whether anything blocks the
 * report and writes that decision; only a report the gate cleared is handed to the finalizer.
 * Separating them means the state a league sees in its queue is the state the finalizer acted
 * on, rather than two evaluations that can disagree.
 *
 * A clean report becomes official here with no human involved. There is no confirmation step,
 * and adding one would reintroduce the friction the redesign removes while adding no
 * information: the League Admin was not at the match.
 */
export const onMatchReportWritten = onDocumentWritten(
  {
    document: 'matchReports/{matchId}',
    database: DATABASE_ID,
    region: REGION,
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const matchId = event.params.matchId;
    const report = after.data() as Record<string, unknown>;

    const outcome = gateMatchReport({
      status: String(report.status ?? ''),
      exceptions: Array.isArray(report.exceptions) ? report.exceptions.map(String) : [],
      declaredHomeScore: Number(report.declaredHomeScore ?? 0),
      declaredAwayScore: Number(report.declaredAwayScore ?? 0),
      reconstructedHomeScore: Number(report.reconstructedHomeScore ?? 0),
      reconstructedAwayScore: Number(report.reconstructedAwayScore ?? 0),
    });

    if (outcome) {
      // Written first, so the report's own state reflects the decision even if the
      // finalization that follows fails or is suppressed by the activation mode.
      await db.collection('matchReports').doc(matchId).update({
        status: outcome.status,
        updatedAt: new Date().toISOString(),
      });
      if (outcome.status === 'league_review') {
        logger.info('Match report held for league review', { matchId, blocking: outcome.blocking });
        return;
      }
    }

    // Only a gated report proceeds. A report already `official` or under review returns null
    // above and reaches here unchanged, where the loader refuses it.
    const activation = currentFinalizerActivation();
    const result = await finalizeFieldReport(db, matchId, activation);
    if (result.action === 'finalized') {
      logger.info('Field report finalized', { matchId, finalizationKey: result.finalizationKey });
    } else if (result.action === 'skipped') {
      logger.info('Field report not finalized', { matchId, reason: result.reason });
    }
  },
);

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
    // Forwards the same activation the trigger uses: a scheduled sweep must not be able
    // to finalize while the mode is off or canary.
    const retried = await retryStalledFinalizations(db, currentFinalizerActivation());
    logger.info('Reconciliation sweep complete', {
      escalated: escalated.length,
      reminders: reminders.length,
      retried: retried.length,
    });
  }
);

/**
 * Time-based convergence: lapsed assignments and stalled projections.
 *
 * Neither of these is a security control — expired projections are already refused at read
 * time, and a failed search projection never blocked the write behind it. What this adds is
 * the system returning to a correct steady state without a human, which is the difference
 * between "fails closed" and "works".
 */
export const convergeLifecycle = onSchedule(
  {
    // Hourly. Expiry is a lifecycle boundary measured in days; running it every minute would
    // be cost without meaning.
    schedule: 'every 60 minutes',
    region: REGION,
    timeoutSeconds: 300,
  },
  async () => {
    const expiry = await expireLapsedAssignments(db);
    const repairs = await runProjectionRepairs(
      db,
      async (entityType, entityId) => {
        const snapshot = await db.collection(`${entityType}s`).doc(entityId).get();
        // The same projector the trigger uses; a repair that re-derived the projection
        // differently would be a second implementation of the thing that already drifted.
        await applySearchIndexChange(
          db,
          entityType as SearchEntityType,
          entityId,
          snapshot.exists ? snapshot.data() : undefined,
        );
      },
      /**
       * Verification, not optimism. Confirms the projection now agrees with its source —
       * present when the entity exists, absent when it does not. A projector that returns
       * without throwing has not proven convergence, and convergence is the whole job.
       */
      async (entityType, entityId) => {
        const [entity, projection] = await Promise.all([
          db.collection(`${entityType}s`).doc(entityId).get(),
          db.collection('searchIndex').doc(`${entityType}_${entityId}`).get(),
        ]);
        return entity.exists === projection.exists;
      },
    );
    logger.info('Lifecycle convergence complete', {
      lapsedFound: expiry.lapsedFound,
      assignmentsExpired: expiry.transitioned,
      alreadyHandled: expiry.skippedAlreadyHandled,
      usersRebuilt: expiry.usersRebuilt,
      projectionsChanged: expiry.projectionsChanged,
      expiryErrors: expiry.errors.length,
      repairsClaimed: repairs.claimed,
      repairsCompleted: repairs.completed,
      repairsRetryScheduled: repairs.retryScheduled,
      repairsVerificationFailed: repairs.verificationFailed,
      repairsDeadLettered: repairs.deadLettered,
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

        /**
         * A durable record of the failure, not just a log line.
         *
         * Swallowing the error is right — a search outage must not block a roster edit. But
         * swallowing it into a log only means the entity silently stays stale forever: the
         * write succeeded, the projection did not, the log scrolls away, and nothing brings
         * the two back together until somebody happens to run a repair. Availability was
         * preserved by accepting silent divergence, which is the trade this codebase
         * refuses everywhere else.
         *
         * The repair queue makes the divergence a thing that exists and can be retried,
         * counted and alerted on. A deterministic id means repeated failures for the same
         * entity update one row rather than growing an unbounded backlog of duplicates.
         */
        try {
          const repairId = `search_${type}_${entityId}`;
          const message = error instanceof Error ? error.message : String(error);
          await db.collection('projectionRepairJobs').doc(repairId).set({
            id: repairId,
            projectionType: 'searchIndex',
            entityType: type,
            entityId,
            // Reset to pending on a fresh failure even if a previous attempt had backed off:
            // the entity changed again, so the old backoff window is about stale information.
            status: 'pending',
            // Truncated. A queue is not a place to accumulate stack traces forever.
            lastErrorCode: message.length > 300 ? `${message.slice(0, 300)}…` : message,
            lastAttemptAt: new Date().toISOString(),
            attemptCount: FieldValue.increment(0),
            nextAttemptAt: FieldValue.delete(),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        } catch (queueError) {
          // If even the repair queue is unwritable the incident is larger than search, and
          // there is nothing useful left to do here except say so loudly.
          logger.error('Search repair job could not be queued', { type, entityId, queueError });
        }
      }
    },
  );
}

export const onAthleteWrittenIndexSearch = searchIndexTrigger('athletes', 'athlete');
export const onTeamWrittenIndexSearch = searchIndexTrigger('teams', 'team');
export const onLeagueWrittenIndexSearch = searchIndexTrigger('leagues', 'league');
export const onSeasonWrittenIndexSearch = searchIndexTrigger('seasons', 'season');
