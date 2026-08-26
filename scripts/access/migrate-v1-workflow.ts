import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { initializeMigrationFirestore } from '../lib/firestoreTarget';

/**
 * Move one stranded V1 claim from the bilateral workflow to league resolution.
 *
 * The drain's preferred outcome is that the parties finish what they started. This is for the
 * ones that will not: a club that has folded, an admin who has left, a fixture from three
 * months ago that nobody will ever confirm. Without a path for those, the drain can never
 * reach zero and team authority can never be retired.
 *
 * ## What this is not
 *
 * It is not a bulk sweep, and that is deliberate. "Move everything still open to league
 * resolution" would clear the gate in one command and would also silently convert live
 * negotiations into decisions one party never got to contest. Each migration names a match and
 * a reason, and both go into the audit trail, so a club asking later why their dispute became
 * a league ruling gets an answer.
 *
 * The claim itself is never rewritten. Its scores, its parties and its history stay exactly as
 * they were; what changes is who is expected to act next.
 */

export const MIGRATION_AUDIT_ACTION = 'result.workflow.migrated';

/** Claims where a team is the party expected to act, and therefore the ones that can strand. */
const MIGRATABLE_STATUSES = ['pending_confirmation', 'confirmation_overdue'];

export type MigrationVerdict =
  | { ok: true; from: string; to: 'disputed' }
  | { ok: false; reason: string };

export function planWorkflowMigration(submission: { status?: string } | undefined): MigrationVerdict {
  if (!submission) return { ok: false, reason: 'No submission for that match.' };
  const status = String(submission.status ?? '');

  if (!MIGRATABLE_STATUSES.includes(status)) {
    return {
      ok: false,
      reason: `A ${status || 'missing'} claim is not waiting on a team, so it does not need migrating.`,
    };
  }

  /**
   * `disputed` rather than a new state.
   *
   * The league's existing resolution workflow already knows how to settle a disputed claim,
   * with its resolution reasons, its correction path and its audit trail. Inventing a
   * `migrated_to_league` state would mean a second thing the resolver has to understand, and
   * the honest description of an unanswered claim that a league must now decide IS a dispute.
   */
  return { ok: true, from: status, to: 'disputed' };
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

export async function migrateWorkflow(db: Firestore, matchId: string, reason: string, apply: boolean) {
  const ref = db.collection('resultSubmissions').doc(matchId);
  const snapshot = await ref.get();
  const verdict = planWorkflowMigration(snapshot.data());

  if (!verdict.ok) {
    console.log(`  ${matchId}: ${verdict.reason}`);
    return verdict;
  }

  console.log(`  ${matchId}: ${verdict.from} -> ${verdict.to}`);
  if (!apply) return verdict;

  await db.runTransaction(async (transaction) => {
    transaction.update(ref, {
      status: verdict.to,
      disputeReason: `Migrated from the bilateral workflow: ${reason}`,
      workflowMigratedFrom: verdict.from,
      workflowMigratedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // The claim's own timeline, so the parties see what happened to their claim where they
    // would look for it.
    transaction.create(ref.collection('events').doc(), {
      submissionId: matchId,
      from: verdict.from,
      to: verdict.to,
      actor: 'system',
      actorUserId: 'system:team_admin_sunset',
      note: `Workflow migrated to league resolution: ${reason}`,
      createdAt: new Date().toISOString(),
    });

    transaction.create(db.collection('adminAuditEvents').doc(), {
      actorUserId: 'system:team_admin_sunset',
      action: MIGRATION_AUDIT_ACTION,
      targetCollection: 'resultSubmissions',
      targetId: matchId,
      afterSummary: {
        from: 'bilateral_v1',
        to: 'league_resolution',
        previousStatus: verdict.from,
        reason: 'team_admin_sunset',
        detail: reason,
      },
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return verdict;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const matchId = args[args.indexOf('--match') + 1];
  const reason = args[args.indexOf('--reason') + 1];

  if (!args.includes('--match') || !matchId?.trim()) {
    console.error('Usage: --match <matchId> --reason "<why>" [--apply]');
    process.exitCode = 1;
    return;
  }
  if (!args.includes('--reason') || !reason?.trim() || reason.length < 10) {
    // A reason short enough to be meaningless is the same as no reason, and this decision is
    // one somebody may have to defend to a club.
    console.error('A reason of at least ten characters is required. It goes into the audit trail.');
    process.exitCode = 1;
    return;
  }

  const { db, label } = initialize();
  console.log(`Migrating V1 workflow${apply ? '' : ' (dry run)'} on ${label}:`);
  const verdict = await migrateWorkflow(db, matchId, reason, apply);

  if (!apply) console.log('\nDry run. Re-run with --apply to write.');
  process.exitCode = verdict.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
