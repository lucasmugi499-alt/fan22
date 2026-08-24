import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Which Result Workflow V1 submissions still need a team to answer them.
 *
 * ## Why this has to run before the projection rebuild
 *
 * The two-sided guard on `resultSubmissions` is in Firestore Rules, and it works by
 * negation:
 *
 *   create: hasTeamOperatorCapability(submittedByTeamId) && !hasTeamOperatorCapability(opponentTeamId)
 *   answer: hasTeamOperatorCapability(opponentTeamId) && !hasTeamOperatorCapability(submittedByTeamId)
 *
 * `hasTeamOperatorCapability` tests exactly the eight capabilities ADR-004 versioned to
 * zero. The moment projections rebuild, both the positive and the negative term fail
 * together, and every team-side write to this collection is denied. V1 does not become
 * permissive; it becomes inert.
 *
 * The handbook's staged migration expects that at Stage D. In the shipped rules it happens at
 * Stage A, because zeroing the bundles IS the block. So an open claim awaiting its opponent
 * stops being answerable by that opponent, and the only route left is league adjudication,
 * which still works because `hasLeagueOperatorCapability` is untouched.
 *
 * That is survivable and it is not silent, but somebody has to know how many are affected
 * before the rebuild rather than after. This report is that number.
 */

/** States in which a team, rather than the league, is the party expected to act next. */
export const TEAM_ANSWERABLE_STATUSES = [
  'pending_confirmation',
  'confirmation_overdue',
] as const;

/** States that are open but already the league's to resolve, so the rebuild does not strand them. */
export const LEAGUE_ANSWERABLE_STATUSES = ['disputed', 'confirmed'] as const;

export type SubmissionRow = {
  id: string;
  status?: string;
  leagueId?: string;
  submittedByTeamId?: string;
  opponentTeamId?: string;
  confirmationDeadline?: string;
};

export type DrainReport = {
  total: number;
  /** Blocked by the rebuild: nobody can answer these except the league. */
  strandedByRebuild: SubmissionRow[];
  /** Open, but already the league's to act on. Unaffected. */
  leagueResolvable: SubmissionRow[];
  byLeague: Record<string, number>;
  safeToRebuild: boolean;
};

export function buildDrainReport(submissions: SubmissionRow[]): DrainReport {
  const stranded = submissions.filter((row) =>
    TEAM_ANSWERABLE_STATUSES.includes(String(row.status) as (typeof TEAM_ANSWERABLE_STATUSES)[number]));
  const leagueResolvable = submissions.filter((row) =>
    LEAGUE_ANSWERABLE_STATUSES.includes(String(row.status) as (typeof LEAGUE_ANSWERABLE_STATUSES)[number]));

  const byLeague: Record<string, number> = {};
  for (const row of stranded) {
    const leagueId = row.leagueId ?? 'unknown';
    byLeague[leagueId] = (byLeague[leagueId] ?? 0) + 1;
  }

  return {
    total: submissions.length,
    strandedByRebuild: stranded,
    leagueResolvable,
    byLeague,
    // Deliberately not "there are no open submissions". A disputed claim is already the
    // league's to resolve and is unaffected by the rebuild; blocking on those would make the
    // gate unreachable in any league with a live dispute.
    safeToRebuild: stranded.length === 0,
  };
}

function initialize() {
  if (getApps().length) return getFirestore();
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  initializeApp(raw ? { credential: cert(JSON.parse(raw)) } : { credential: applicationDefault() });
  return getFirestore();
}

async function main() {
  const db = initialize();
  const snapshot = await db.collection('resultSubmissions').get();
  const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as SubmissionRow);
  const report = buildDrainReport(rows);

  console.log('Result Workflow V1 drain report');
  console.log(`Submissions: ${report.total}`);
  console.log(`Awaiting a team answer (stranded by the rebuild): ${report.strandedByRebuild.length}`);
  console.log(`Open but league-resolvable (unaffected): ${report.leagueResolvable.length}`);
  if (report.strandedByRebuild.length) {
    console.log('\nBy league:');
    for (const [leagueId, count] of Object.entries(report.byLeague).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${leagueId}  ${count}`);
    }
    console.log('\nResolve or withdraw these before rebuilding access projections.');
    console.log('After the rebuild the opponent cannot confirm, dispute or withdraw them.');
  }
  console.log(`\nSafe to rebuild: ${report.safeToRebuild ? 'yes' : 'NO'}`);
  process.exitCode = report.safeToRebuild ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
