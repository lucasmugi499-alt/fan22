import { logger } from 'firebase-functions';
import type { Firestore } from 'firebase-admin/firestore';
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
export async function sweepUnreportedMatches(db: Firestore, now = new Date()) {
  const cutoff = new Date(now.getTime() - 3 * 86_400_000).toISOString();
  const played = await db
    .collection('matches')
    .where('scheduledAt', '<=', cutoff)
    .limit(200)
    .get();

  let opened = 0;
  for (const doc of played.docs) {
    const match = doc.data();
    if (match.verificationStatus === 'verified') continue;

    const report = await db.collection('matchReports').doc(doc.id).get();
    const stale = isUnreportedAndStale({
      scheduledAt: String(match.scheduledAt ?? ''),
      hasReport: report.exists,
      effectiveCapturePolicy: match.effectiveCapturePolicy,
      now,
    });
    if (!stale) continue;

    const exceptionId = `${doc.id}_result_never_reported`;
    const existing = await db.collection('matchOperationalExceptions').doc(exceptionId).get();
    // Created once. A sweep that reopened the same case every hour would bury the queue it is
    // supposed to keep readable.
    if (existing.exists) continue;

    await db.collection('matchOperationalExceptions').doc(exceptionId).set({
      id: exceptionId,
      matchId: doc.id,
      leagueId: match.leagueId ?? '',
      code: 'result_never_reported',
      blocking: true,
      detail: {
        scheduledAt: match.scheduledAt,
        effectiveCapturePolicy: match.effectiveCapturePolicy ?? 'POST_MATCH_ALLOWED',
      },
      status: 'open',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    opened += 1;
  }

  if (opened) logger.info('[matchReports] opened result_never_reported cases', { opened });
  return { scanned: played.size, opened };
}
