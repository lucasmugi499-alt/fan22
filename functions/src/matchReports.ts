import { logger } from 'firebase-functions';
import type { DocumentData, Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { shouldAutoFinalize } from '../../src/server/finalization/autoFinalize';
import { isUnreportedAndStale } from '../../src/server/finalization/escalation';

/**
 * What happens to a match report once a Field Manager has attested to it.
 *
 * The gates were already evaluated at submission. This re-evaluates them, and that is
 * deliberate rather than redundant: submission is a request from a device on a bad connection,
 * and a worker that trusts the exception list it was handed cannot notice a report that was
 * written when a gate was buggy or a race left an exception unwritten.
 */

export type ReportGateOutcome =
  | { status: 'ready_for_finalization' }
  | { status: 'league_review'; blocking: string[] };

export function gateMatchReport(report: {
  status: string;
  exceptions?: string[];
  declaredHomeScore: number;
  declaredAwayScore: number;
  reconstructedHomeScore: number;
  reconstructedAwayScore: number;
}): ReportGateOutcome | null {
  // Only a freshly submitted report is a candidate. Anything else has already been decided,
  // and re-deciding it is how a resolved case reopens itself on the next write.
  if (report.status !== 'submitted') return null;

  const verdict = shouldAutoFinalize({
    status: report.status,
    exceptions: report.exceptions ?? [],
    declaredHomeScore: report.declaredHomeScore,
    declaredAwayScore: report.declaredAwayScore,
    reconstructedHomeScore: report.reconstructedHomeScore,
    reconstructedAwayScore: report.reconstructedAwayScore,
  });

  if (verdict.finalize) return { status: 'ready_for_finalization' };
  return { status: 'league_review', blocking: verdict.blocking };
}

/**
 * Fixtures nobody reported.
 *
 * A fixture with no field report and no post-match entry stays a fixture forever, and the
 * standings quietly go wrong: the table shows every other result as if it were complete, and
 * nobody reading it can tell that one is simply absent. This makes the gap visible rather
 * than silent, which is the whole of the remedy. It does not invent a result.
 */
export type UnreportedSweepOptions = {
  /** Read and classify the exact live graph without writing any exception. */
  dryRun?: boolean;
  /** Query page size. Exposed so the pagination boundary can be proven in tests. */
  pageSize?: number;
  /** Safety brake for one invocation. Later invocations converge the rest. */
  maxOpened?: number;
};

export type UnreportedSweepResult = {
  scanned: number;
  eligible: number;
  alreadyOpen: number;
  wouldOpen: number;
  opened: number;
  candidateMatchIds: string[];
  openLimitReached: boolean;
};

function officialResultExists(match: Record<string, unknown>) {
  return match.verificationStatus === 'verified'
    || (typeof match.officialResultVersion === 'number' && match.officialResultVersion > 0);
}

function isEligible(
  match: Record<string, unknown>,
  sources: { hasReport: boolean; hasResultSubmission: boolean },
  now: Date,
) {
  return isUnreportedAndStale({
    scheduledAt: String(match.scheduledAt ?? ''),
    status: String(match.status ?? ''),
    verificationStatus: String(match.verificationStatus ?? ''),
    hasReport: sources.hasReport,
    hasResultSubmission: sources.hasResultSubmission,
    hasOfficialResult: officialResultExists(match),
    effectiveCapturePolicy: typeof match.effectiveCapturePolicy === 'string'
      ? match.effectiveCapturePolicy
      : undefined,
    capturePolicyBoundAt: typeof match.capturePolicyBoundAt === 'string'
      ? match.capturePolicyBoundAt
      : undefined,
    now,
  });
}

function exceptionRecord(
  matchId: string,
  match: Record<string, unknown>,
  now: Date,
) {
  const timestamp = now.toISOString();
  return {
    id: `${matchId}_result_never_reported`,
    matchId,
    leagueId: match.leagueId ?? '',
    code: 'result_never_reported',
    blocking: true,
    detail: {
      scheduledAt: match.scheduledAt,
      effectiveCapturePolicy: match.effectiveCapturePolicy,
      capturePolicyBoundAt: match.capturePolicyBoundAt,
    },
    status: 'open',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function sweepUnreportedMatches(
  db: Firestore,
  now = new Date(),
  options: UnreportedSweepOptions = {},
): Promise<UnreportedSweepResult> {
  const dryRun = options.dryRun ?? false;
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 200, 500));
  const maxOpened = Math.max(0, options.maxOpened ?? 50);
  const cutoff = new Date(now.getTime() - 3 * 86_400_000).toISOString();
  let cursor: QueryDocumentSnapshot<DocumentData> | undefined;
  let scanned = 0;
  let eligible = 0;
  let alreadyOpen = 0;
  let wouldOpen = 0;
  let opened = 0;
  const candidateMatchIds: string[] = [];

  while (true) {
    let query = db.collection('matches')
      .where('scheduledAt', '<=', cutoff)
      .orderBy('scheduledAt')
      .limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    scanned += page.size;

    // Apply the cheap, source-independent guards before any secondary reads. In particular,
    // legacy fixtures have no capturePolicyBoundAt and therefore cost one match read rather
    // than three more reads every hour forever.
    const possible = page.docs.filter((doc) => isEligible(doc.data(), {
      hasReport: false,
      hasResultSubmission: false,
    }, now));

    if (possible.length) {
      const reports = possible.map((doc) => db.collection('matchReports').doc(doc.id));
      const submissions = possible.map((doc) => db.collection('resultSubmissions').doc(doc.id));
      const exceptions = possible.map((doc) => db.collection('matchOperationalExceptions')
        .doc(`${doc.id}_result_never_reported`));
      const snapshots = await db.getAll(...reports, ...submissions, ...exceptions);
      const reportOffset = 0;
      const submissionOffset = possible.length;
      const exceptionOffset = possible.length * 2;

      for (let index = 0; index < possible.length; index += 1) {
        const matchDoc = possible[index];
        const match = matchDoc.data();
        if (!isEligible(match, {
          hasReport: snapshots[reportOffset + index].exists,
          hasResultSubmission: snapshots[submissionOffset + index].exists,
        }, now)) continue;

        eligible += 1;
        if (snapshots[exceptionOffset + index].exists) {
          alreadyOpen += 1;
          continue;
        }

        wouldOpen += 1;
        if (candidateMatchIds.length < 100) candidateMatchIds.push(matchDoc.id);
        if (dryRun || opened >= maxOpened) continue;

        // Re-read every fact that controls the write under the same transaction. A report can
        // arrive between the scan and this point; opening a missing-report case beside it
        // would turn a normal trigger race into a false operational incident.
        const transactionOutcome = await db.runTransaction(async (transaction) => {
          const matchRef = db.collection('matches').doc(matchDoc.id);
          const reportRef = db.collection('matchReports').doc(matchDoc.id);
          const submissionRef = db.collection('resultSubmissions').doc(matchDoc.id);
          const exceptionRef = db.collection('matchOperationalExceptions')
            .doc(`${matchDoc.id}_result_never_reported`);
          const [freshMatch, freshReport, freshSubmission, freshException] = await transaction
            .getAll(matchRef, reportRef, submissionRef, exceptionRef);

          if (freshException.exists) return 'already_open' as const;
          if (!freshMatch.exists || !isEligible(freshMatch.data() ?? {}, {
            hasReport: freshReport.exists,
            hasResultSubmission: freshSubmission.exists,
          }, now)) return 'ineligible' as const;

          transaction.create(exceptionRef, exceptionRecord(matchDoc.id, freshMatch.data() ?? {}, now));
          return 'opened' as const;
        });

        if (transactionOutcome === 'opened') opened += 1;
        if (transactionOutcome === 'already_open') alreadyOpen += 1;
      }
    }

    cursor = page.docs.at(-1);
    if (page.size < pageSize) break;
  }

  const result = {
    scanned,
    eligible,
    alreadyOpen,
    wouldOpen,
    opened,
    candidateMatchIds,
    openLimitReached: !dryRun && opened >= maxOpened && wouldOpen > opened,
  };
  logger.info('[matchReports] unreported match sweep complete', { dryRun, ...result });
  return result;
}
