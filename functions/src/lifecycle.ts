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
 * Time-based lifecycle work: assignments that have lapsed, and projections that fell behind.
 *
 * Both of these are convergence rather than security. The security properties already hold
 * without this file running — an expired projection is refused at read time, and a failed
 * search projection never blocked the write that caused it. What is missing without a worker
 * is the system returning to a correct steady state on its own.
 */

/** Bounded per run so one invocation cannot become an unbounded job. */
const PAGE = 200;
const MAX_PAGES = 25;

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

/**
 * Rebuilds one user's access projections from their assignments.
 *
 * The Next server owns the same operation. This is not a second implementation of the
 * DECISION — the projection logic lives in framework-free `accessProjection` and both
 * runtimes call it — only a second copy of the Firestore plumbing, which is unavoidable
 * because the two runtimes hold different Firestore handles. Reimplementing
 * `projectScopeIndex` here is exactly the divergence this codebase keeps removing.
 */
export async function rebuildUserProjectionsIn(db: Firestore, userId: string): Promise<number> {
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

  if (changed) {
    batch.set(db.collection('users').doc(userId), {
      accessVersion: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
  }
  return changed;
}

/**
 * Retires assignments whose `validUntil` has passed, and rebuilds the projections behind them.
 *
 * The security half of expiry is already closed: the projection carries its earliest expiry
 * and every reader refuses a lapsed one. What that leaves is an availability problem, and it
 * is a real one. A scope held through two assignments — a permanent Team Admin grant and a
 * temporary result-reporter grant expiring tonight — projects the EARLIEST expiry, correctly.
 * Tomorrow the whole projection is refused, including the permanent grant, until something
 * unrelated happens to rewrite it.
 *
 * So the user is denied authority they still hold. That fails closed, which is the right
 * direction to fail, but it is not correct — and "it will fix itself the next time someone
 * touches this user" is not a lifecycle.
 *
 * Marking the assignment expired and rebuilding makes the projection re-derive from what
 * genuinely remains: the permanent grant, with no expiry.
 */
export async function expireLapsedAssignments(
  db: Firestore,
  rebuildUserProjections: (userId: string) => Promise<unknown> = (userId) => rebuildUserProjectionsIn(db, userId),
): Promise<{ expired: number; rebuiltUsers: string[] }> {
  const now = new Date().toISOString();
  const lapsed = await pagedDocs(
    () => db.collection('accessAssignments')
      .where('status', '==', 'active')
      .where('validUntil', '<=', now),
    'validUntil',
  );

  const affectedUsers = new Set<string>();
  for (const assignment of lapsed) {
    const userId = String(assignment.data()?.userId ?? '');
    if (!userId) continue;
    await assignment.ref.update({
      status: 'expired',
      expiredAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
    affectedUsers.add(userId);
  }

  // Rebuilt per user rather than per assignment: one user may hold several lapsed grants,
  // and the projector recomputes every scope for them in one pass either way.
  for (const userId of affectedUsers) {
    await rebuildUserProjections(userId);
  }

  return { expired: lapsed.length, rebuiltUsers: [...affectedUsers] };
}

/**
 * Retries projections that fell behind their source.
 *
 * The repair queue made drift visible; visible drift that only a human can clear is still
 * permanent drift with a dashboard in front of it. This closes the loop: retry with a
 * bounded attempt count, and dead-letter what keeps failing so the queue cannot fill with
 * work that will never succeed and hide the entries that would.
 */
export async function runProjectionRepairs(
  db: Firestore,
  repair: (entityType: string, entityId: string) => Promise<unknown>,
  { maxAttempts = 5 }: { maxAttempts?: number } = {},
): Promise<{ repaired: number; deadLettered: number; failed: number }> {
  const pending = await pagedDocs(
    () => db.collection('projectionRepairJobs').where('status', '==', 'pending'),
    'entityId',
  );

  let repaired = 0;
  let deadLettered = 0;
  let failed = 0;

  for (const job of pending) {
    const data = job.data() ?? {};
    const attempts = Number(data.attempts ?? 0);

    if (attempts >= maxAttempts) {
      // Dead-lettered rather than retried forever. A job failing five times is not going to
      // succeed on the sixth for the same reason, and leaving it pending buries the ones
      // that would.
      await job.ref.update({
        status: 'dead_letter',
        deadLetteredAt: new Date().toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      deadLettered += 1;
      continue;
    }

    try {
      await repair(String(data.entityType ?? ''), String(data.entityId ?? ''));
      await job.ref.update({
        status: 'repaired',
        repairedAt: new Date().toISOString(),
        lastError: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      repaired += 1;
    } catch (error) {
      await job.ref.update({
        attempts: FieldValue.increment(1),
        lastError: error instanceof Error ? error.message : String(error),
        lastFailedAt: new Date().toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      failed += 1;
    }
  }

  return { repaired, deadLettered, failed };
}
