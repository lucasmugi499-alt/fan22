import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { accessIndexId } from '../../src/lib/auth/access';
import {
  authorityMatches,
  normalizeAccessAssignment,
  normalizeAccessIndex,
  projectScopeIndex,
} from '../../src/lib/auth/accessProjection';

/**
 * Time-based convergence: assignments that have lapsed, and projections that fell behind.
 *
 * Neither is a security control. An expired projection is already refused at read time, and
 * a failed search projection never blocked the write behind it. What this adds is the system
 * returning to a correct steady state without a human — the difference between "fails closed"
 * and "works".
 *
 * Two properties matter throughout, because a scheduler is the one caller guaranteed to run
 * concurrently with itself: every transition is idempotent and guarded inside a transaction,
 * and one bad record can never abort the sweep for the rest.
 */

const PAGE = 200;
const MAX_PAGES = 25;
/** Long enough to be useful, short enough not to accumulate stack traces forever. */
const MAX_ERROR_LENGTH = 300;

export type RepairJobStatus = 'pending' | 'processing' | 'retry_wait' | 'completed' | 'dead_letter';

async function pagedDocs(
  build: () => FirebaseFirestore.Query,
  orderField: string,
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (let index = 0; index < MAX_PAGES; index += 1) {
    let query = build().orderBy(orderField).limit(PAGE);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    docs.push(...snapshot.docs);
    if (snapshot.size < PAGE) break;
    cursor = snapshot.docs[snapshot.size - 1];
  }
  return docs;
}

function truncate(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.length > MAX_ERROR_LENGTH ? `${text.slice(0, MAX_ERROR_LENGTH)}…` : text;
}

/**
 * Rebuilds one user's access projections from their assignments.
 *
 * The Next server owns the same operation. This is not a second implementation of the
 * DECISION — the projection logic lives in framework-free `accessProjection` and both
 * runtimes call it — only a second copy of the Firestore plumbing, which is unavoidable
 * because the two runtimes hold different handles.
 */
export async function rebuildUserProjectionsIn(
  db: Firestore,
  userId: string,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<number> {
  const now = new Date();
  const nowIso = now.toISOString();

  const [assignmentSnapshot, indexSnapshot] = await Promise.all([
    db.collection('accessAssignments').where('userId', '==', userId).get(),
    db.collection('accessIndex').where('userId', '==', userId).get(),
  ]);

  const assignments = assignmentSnapshot.docs
    .map((entry) => normalizeAccessAssignment(entry.id, entry.data(), nowIso));

  const scopeKey = (scopeType: string, scopeId: string) => `${scopeType}:${scopeId}`;
  const currentByScope = new Map<string, ReturnType<typeof normalizeAccessIndex>>();
  for (const entry of indexSnapshot.docs) {
    const index = normalizeAccessIndex(entry.data());
    currentByScope.set(scopeKey(index.scopeType, index.scopeId), index);
  }

  const scopes = new Map<string, { userId: string; scopeType: string; scopeId: string }>();
  for (const assignment of assignments) {
    scopes.set(scopeKey(assignment.scopeType, assignment.scopeId), {
      userId, scopeType: assignment.scopeType, scopeId: assignment.scopeId,
    });
  }
  for (const [key, index] of currentByScope) {
    scopes.set(key, { userId, scopeType: index.scopeType, scopeId: index.scopeId });
  }

  const batch = db.batch();
  let changed = 0;

  for (const [key, scope] of scopes) {
    const current = currentByScope.get(key) ?? null;
    const desired = projectScopeIndex({ scope: scope as never, assignments, updatedAt: nowIso, now });
    if (authorityMatches(current, desired)) continue;

    const ref = db.collection('accessIndex')
      .doc(accessIndexId(scope.scopeType as never, scope.scopeId, scope.userId));
    if (desired) {
      batch.set(ref, {
        ...desired,
        accessVersion: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: false });
    } else {
      batch.delete(ref);
    }
    changed += 1;
  }

  if (changed && !dryRun) {
    batch.set(db.collection('users').doc(userId), {
      accessVersion: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
  }
  return changed;
}

export type ExpiryReport = {
  lapsedFound: number;
  transitioned: number;
  skippedAlreadyHandled: number;
  usersRebuilt: number;
  projectionsChanged: number;
  errors: string[];
};

/**
 * Retires assignments whose `validUntil` has passed, and rebuilds the projections behind them.
 *
 * The security half of expiry is already closed: the projection carries its earliest expiry
 * and every reader refuses a lapsed one. What remains is an availability problem, and a real
 * one. A scope held through a permanent Team Admin grant AND a temporary reporter grant
 * expiring tonight projects the EARLIEST expiry, correctly. Tomorrow the whole projection is
 * refused — permanent grant included — until something unrelated rewrites it.
 *
 * Only assignments carrying `validUntil` are touched, and only after a transactional re-read
 * confirms they are still active and still lapsed. A permanent grant has no `validUntil` and
 * is never matched by the query, so it cannot be swept up alongside a temporary one; the
 * rebuild afterwards re-derives the scope from whatever legitimately remains.
 */
export async function expireLapsedAssignments(
  db: Firestore,
  {
    dryRun = false,
    rebuild = (userId: string, options: { dryRun?: boolean }) => rebuildUserProjectionsIn(db, userId, options),
  }: {
    dryRun?: boolean;
    rebuild?: (userId: string, options: { dryRun?: boolean }) => Promise<number>;
  } = {},
): Promise<ExpiryReport> {
  const now = new Date().toISOString();
  const report: ExpiryReport = {
    lapsedFound: 0, transitioned: 0, skippedAlreadyHandled: 0,
    usersRebuilt: 0, projectionsChanged: 0, errors: [],
  };

  const lapsed = await pagedDocs(
    () => db.collection('accessAssignments')
      .where('status', '==', 'active')
      .where('validUntil', '<=', now),
    'validUntil',
  );
  report.lapsedFound = lapsed.length;

  const affectedUsers = new Set<string>();
  for (const assignment of lapsed) {
    try {
      const userId = String(assignment.data()?.userId ?? '');
      if (!userId) continue;

      if (dryRun) {
        report.transitioned += 1;
        affectedUsers.add(userId);
        continue;
      }

      /**
       * Re-read inside the transaction before writing.
       *
       * A scheduler overlaps with itself: a retry, a slow invocation, two regions. Two runs
       * finding the same lapsed assignment must not both transition it and both bump the
       * access version. The guard makes the second run a no-op rather than a duplicate.
       */
      const applied = await db.runTransaction(async (transaction) => {
        const current = await transaction.get(assignment.ref);
        const data = current.data();
        if (!current.exists || data?.status !== 'active') return false;
        if (!data?.validUntil || String(data.validUntil) > now) return false;
        transaction.update(assignment.ref, {
          status: 'expired',
          expiredAt: now,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return true;
      });

      if (applied) {
        report.transitioned += 1;
        affectedUsers.add(userId);
      } else {
        report.skippedAlreadyHandled += 1;
      }
    } catch (error) {
      // One malformed assignment must not stop the sweep for everyone else.
      report.errors.push(`assignment ${assignment.id}: ${truncate(error)}`);
    }
  }

  // Rebuilt once per user, not once per assignment: the projector recomputes every scope for
  // a user in one pass either way, and a user may hold several lapsed grants.
  for (const userId of affectedUsers) {
    try {
      report.projectionsChanged += await rebuild(userId, { dryRun });
      report.usersRebuilt += 1;
    } catch (error) {
      report.errors.push(`rebuild ${userId}: ${truncate(error)}`);
    }
  }

  return report;
}

export type RepairReport = {
  claimed: number;
  completed: number;
  retryScheduled: number;
  deadLettered: number;
  verificationFailed: number;
  errors: string[];
};

/** Exponential backoff, capped, so a persistently failing job stops hammering the projector. */
function backoffMinutes(attempt: number) {
  return Math.min(2 ** attempt, 120);
}

/**
 * Works the projection repair backlog.
 *
 * The queue made drift visible; visible drift only a human can clear is still permanent drift
 * with a dashboard in front of it. This closes the loop.
 *
 * A completed repair is one whose RESULT was verified, not one where the projector returned
 * without throwing. Those are different claims: a projector can complete happily and still
 * leave the projection disagreeing with its source, which is the exact failure the queue
 * exists to catch.
 */
export async function runProjectionRepairs(
  db: Firestore,
  repair: (entityType: string, entityId: string) => Promise<unknown>,
  verify: (entityType: string, entityId: string) => Promise<boolean>,
  { maxAttempts = 5, dryRun = false }: { maxAttempts?: number; dryRun?: boolean } = {},
): Promise<RepairReport> {
  const nowIso = new Date().toISOString();
  const report: RepairReport = {
    claimed: 0, completed: 0, retryScheduled: 0,
    deadLettered: 0, verificationFailed: 0, errors: [],
  };

  const due = await pagedDocs(
    () => db.collection('projectionRepairJobs').where('status', 'in', ['pending', 'retry_wait']),
    'entityId',
  );

  for (const job of due) {
    const data = job.data() ?? {};
    const attemptCount = Number(data.attemptCount ?? data.attempts ?? 0);
    const entityType = String(data.entityType ?? '');
    const entityId = String(data.entityId ?? '');

    // Not yet due for another attempt.
    if (data.nextAttemptAt && String(data.nextAttemptAt) > nowIso) continue;

    if (attemptCount >= maxAttempts) {
      // A job that has failed its budget will not succeed on the next attempt for the same
      // reason, and leaving it queued buries the jobs that would.
      if (!dryRun) {
        await job.ref.update({
          status: 'dead_letter' satisfies RepairJobStatus,
          deadLetteredAt: nowIso,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      report.deadLettered += 1;
      continue;
    }

    if (dryRun) {
      report.claimed += 1;
      continue;
    }

    /**
     * Claim the job before working it.
     *
     * Two overlapping invocations must not repair the same entity twice and both count it.
     * The transaction is the claim: whoever moves it to `processing` owns it.
     */
    const claimed = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(job.ref);
      const status = current.data()?.status;
      if (!current.exists || (status !== 'pending' && status !== 'retry_wait')) return false;
      transaction.update(job.ref, {
        status: 'processing' satisfies RepairJobStatus,
        lastAttemptAt: nowIso,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    }).catch(() => false);

    if (!claimed) continue;
    report.claimed += 1;

    try {
      await repair(entityType, entityId);
      const converged = await verify(entityType, entityId);

      if (!converged) {
        // The projector finished and the projection still disagrees. Treated as a failure,
        // because "it did not throw" is not the property anyone wanted.
        report.verificationFailed += 1;
        await job.ref.update({
          status: 'retry_wait' satisfies RepairJobStatus,
          attemptCount: attemptCount + 1,
          nextAttemptAt: new Date(Date.now() + backoffMinutes(attemptCount + 1) * 60_000).toISOString(),
          lastErrorCode: 'verification_failed',
          lastAttemptAt: nowIso,
          updatedAt: FieldValue.serverTimestamp(),
        });
        report.retryScheduled += 1;
        continue;
      }

      await job.ref.update({
        status: 'completed' satisfies RepairJobStatus,
        completedAt: nowIso,
        attemptCount: attemptCount + 1,
        lastErrorCode: FieldValue.delete(),
        nextAttemptAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      report.completed += 1;
    } catch (error) {
      const nextAttempt = attemptCount + 1;
      await job.ref.update({
        status: 'retry_wait' satisfies RepairJobStatus,
        attemptCount: nextAttempt,
        nextAttemptAt: new Date(Date.now() + backoffMinutes(nextAttempt) * 60_000).toISOString(),
        lastErrorCode: truncate(error),
        lastAttemptAt: nowIso,
        updatedAt: FieldValue.serverTimestamp(),
      }).catch(() => undefined);
      report.retryScheduled += 1;
      report.errors.push(`${entityType}/${entityId}: ${truncate(error)}`);
    }
  }

  return report;
}
