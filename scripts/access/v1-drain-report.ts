import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { initializeMigrationFirestore } from '../lib/firestoreTarget';

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

export type AssignmentRow = { id: string; scopeType?: string; scopeId?: string; status?: string; userId?: string };
export type InvitationRow = { id: string; scopeType?: string; status?: string; roleKey?: string };

/**
 * Everything that still depends on team-scoped authority.
 *
 * Five counts, and the reason there are five rather than one: each is a different way a live
 * workflow can be stranded, and a single number would let a zero in one hide a non-zero in
 * another. The gate is the sum, and the breakdown is what tells an operator who to call.
 */
export type DrainReport = {
  /** Open claims where a TEAM is the party expected to act next. Blocked by retirement. */
  strandedByRetirement: SubmissionRow[];
  /** Open, but already the league's to settle. Unaffected by retirement. */
  leagueResolvable: SubmissionRow[];
  /** Team-scoped assignments still active. Their authority is what retirement removes. */
  activeTeamAssignments: AssignmentRow[];
  /** Team invitations somebody could still accept. */
  pendingTeamInvitations: InvitationRow[];
  byLeague: Record<string, number>;
  totals: {
    submissions: number;
    strandedByRetirement: number;
    leagueResolvable: number;
    activeTeamAssignments: number;
    pendingTeamInvitations: number;
  };
  /**
   * Whether team authority may be retired.
   *
   * Deliberately not "there are no team assignments". An assignment that grants authority
   * nobody is using strands nothing, and requiring zero of those would make the gate
   * unreachable in any league that ever had a Team Admin. What must be zero is work that
   * cannot be completed once the authority behind it is gone.
   */
  safeToRetire: boolean;
};

const OPEN_INVITATION_STATUSES = ['sent', 'delivered', 'viewed', 'queued', 'invited'];

export function buildDrainReport(input: {
  submissions: SubmissionRow[];
  assignments?: AssignmentRow[];
  invitations?: InvitationRow[];
}): DrainReport {
  const submissions = input.submissions;
  const stranded = submissions.filter((row) =>
    TEAM_ANSWERABLE_STATUSES.includes(String(row.status) as (typeof TEAM_ANSWERABLE_STATUSES)[number]));
  const leagueResolvable = submissions.filter((row) =>
    LEAGUE_ANSWERABLE_STATUSES.includes(String(row.status) as (typeof LEAGUE_ANSWERABLE_STATUSES)[number]));

  const activeTeamAssignments = (input.assignments ?? []).filter((row) =>
    row.scopeType === 'team' && row.status === 'active');
  const pendingTeamInvitations = (input.invitations ?? []).filter((row) =>
    row.scopeType === 'team' && OPEN_INVITATION_STATUSES.includes(String(row.status)));

  const byLeague: Record<string, number> = {};
  for (const row of stranded) {
    const leagueId = row.leagueId ?? 'unknown';
    byLeague[leagueId] = (byLeague[leagueId] ?? 0) + 1;
  }

  return {
    strandedByRetirement: stranded,
    leagueResolvable,
    activeTeamAssignments,
    pendingTeamInvitations,
    byLeague,
    totals: {
      submissions: submissions.length,
      strandedByRetirement: stranded.length,
      leagueResolvable: leagueResolvable.length,
      activeTeamAssignments: activeTeamAssignments.length,
      pendingTeamInvitations: pendingTeamInvitations.length,
    },
    /**
     * An open invitation counts, because accepting one after retirement creates an assignment
     * that grants nothing and reads to its holder as a role. A merely-active assignment does
     * not, because losing authority nobody is exercising strands no work.
     */
    safeToRetire: stranded.length === 0 && pendingTeamInvitations.length === 0,
  };
}

/**
 * The NAMED database, never `(default)`.
 *
 * This used to be `getFirestore()`, which asks for `(default)` — a database that does not
 * exist on any GoalPlace project. The whole output of this script is a count, and a count
 * taken against the wrong database is worse than no count at all: on a project that happens
 * to have an empty `(default)`, every number here would read zero and the verdict would read
 * green. See `scripts/lib/firestoreTarget.ts`.
 */
function initialize() {
  return initializeMigrationFirestore();
}

async function main() {
  const { db, label } = initialize();
  const [submissionsSnap, assignmentsSnap, invitationsSnap] = await Promise.all([
    db.collection('resultSubmissions').get(),
    db.collection('accessAssignments').where('scopeType', '==', 'team').get(),
    db.collection('invitations').where('scopeType', '==', 'team').get(),
  ]);

  const report = buildDrainReport({
    submissions: submissionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as SubmissionRow),
    assignments: assignmentsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AssignmentRow),
    invitations: invitationsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as InvitationRow),
  });

  console.log('Result Workflow V1 drain report');
  // Stated on every run. These counts are recorded as migration evidence, and a count
  // whose target is not written down beside it cannot be checked by anybody later.
  console.log(`  Target                             ${label}`);
  console.log(`  Submissions total                  ${report.totals.submissions}`);
  console.log(`  Awaiting a TEAM answer             ${report.totals.strandedByRetirement}   <- blocks retirement`);
  console.log(`  Open but league-resolvable         ${report.totals.leagueResolvable}`);
  console.log(`  Active team-scoped assignments     ${report.totals.activeTeamAssignments}`);
  console.log(`  Pending team invitations           ${report.totals.pendingTeamInvitations}   <- blocks retirement`);

  if (report.strandedByRetirement.length) {
    console.log('\nClaims awaiting a team answer, by league:');
    for (const [leagueId, count] of Object.entries(report.byLeague).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${leagueId}  ${count}`);
    }
    console.log('\nFinish or migrate these before retiring team authority.');
    console.log('After retirement the opponent cannot confirm, dispute or withdraw them.');
    console.log('Migrate with: npm run access:migrate-v1 -- --match <matchId> --reason "<why>"');
  }

  if (report.pendingTeamInvitations.length) {
    console.log('\nOpen team invitations. Accepting one after retirement creates an assignment');
    console.log('that grants nothing and reads to its holder as a role. Revoke them first.');
  }

  console.log(`\nSafe to retire team authority: ${report.safeToRetire ? 'YES' : 'NO'}`);
  process.exitCode = report.safeToRetire ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
