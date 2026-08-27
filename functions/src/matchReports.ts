import { shouldAutoFinalize } from '../../src/server/finalization/autoFinalize';

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
