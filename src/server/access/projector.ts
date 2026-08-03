import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { accessIndexId, type AccessIndexDocument, type AccessScopeType } from '@/lib/auth/access';
import {
  authorityMatches,
  applyPendingChanges,
  normalizeAccessAssignment,
  normalizeAccessIndex,
  projectScopeIndex,
  projectionAuthority,
  type AccessScopeKey,
  type PendingAssignmentChange,
} from '@/lib/auth/accessProjection';

export * from '@/lib/auth/accessProjection';

/**
 * The single owner of every `accessIndex` write.
 *
 * `accessIndex` is a deterministic projection of the active `accessAssignments` for one
 * (user, scope) pair — nothing more. It must carry no authority that cannot be
 * reproduced from canonical assignments and versioned permission bundles, because that
 * reproducibility is what makes repair, replay, drift detection and safe revocation
 * possible.
 *
 * Before this module, three routes wrote index documents independently and one of them
 * hand-assembled roles and capabilities with `merge: true`, so a scope holding a second
 * assignment could keep capabilities that no active assignment granted. Firestore Rules
 * cannot be allowed to authorize from a projection that any route may write freely, so
 * every mutation now routes through here.
 *
 * Firestore requires all transaction reads before any write, so the transactional API is
 * split: `readScopeProjection` performs the reads and returns an `apply` that performs
 * the writes once the caller has finished reading.
 */

export type ScopeProjection = {
  scope: AccessScopeKey;
  current: AccessIndexDocument | null;
  desired: AccessIndexDocument | null;
  changed: boolean;
  /** Writes the projection. Call only after every read in the transaction. */
  apply: (transaction: FirebaseFirestore.Transaction) => void;
};

/**
 * Only the two read shapes this module needs. Declaring both overloads keeps the query
 * and document results correctly typed without casting, which a `Pick` of the full
 * `Transaction['get']` union does not.
 */
type TransactionLike = {
  get(query: FirebaseFirestore.Query): Promise<FirebaseFirestore.QuerySnapshot>;
  get(ref: FirebaseFirestore.DocumentReference): Promise<FirebaseFirestore.DocumentSnapshot>;
};

/**
 * Reads the assignments and current projection for one scope and returns the write.
 *
 * Callers must invoke the returned `apply` after all their other transaction reads,
 * because Firestore rejects a read that follows a write in the same transaction.
 */
export async function readScopeProjection(
  transaction: TransactionLike,
  scope: AccessScopeKey,
  options: { pending?: PendingAssignmentChange[]; now?: Date } = {},
): Promise<ScopeProjection> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const indexRef = adminDb.collection('accessIndex').doc(accessIndexId(scope.scopeType, scope.scopeId, scope.userId));

  const scopedQuery = adminDb
    .collection('accessAssignments')
    .where('userId', '==', scope.userId)
    .where('scopeType', '==', scope.scopeType)
    .where('scopeId', '==', scope.scopeId);

  const [scopedSnapshot, indexSnapshot] = await Promise.all([
    transaction.get(scopedQuery),
    transaction.get(indexRef),
  ]);

  const stored = scopedSnapshot.docs
    .map((doc) => normalizeAccessAssignment(doc.id, doc.data(), nowIso));
  const assignments = applyPendingChanges(stored, options.pending ?? []);

  const current = indexSnapshot.exists ? normalizeAccessIndex(indexSnapshot.data() ?? {}) : null;
  const desired = projectScopeIndex({ scope, assignments, updatedAt: nowIso, now });

  return {
    scope,
    current,
    desired,
    changed: !authorityMatches(current, desired),
    apply(activeTransaction) {
      if (desired) {
        // merge:false — a partial merge is what allowed revoked capabilities to survive.
        activeTransaction.set(indexRef, {
          ...desired,
          accessVersion: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: false });
      } else if (current) {
        activeTransaction.delete(indexRef);
      }

      if (!authorityMatches(current, desired)) {
        // Bumping only on real authority change avoids forcing every client to refetch
        // its access context on an idempotent replay.
        activeTransaction.set(adminDb.collection('users').doc(scope.userId), {
          accessVersion: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    },
  };
}

export type ScopeDrift = {
  scope: AccessScopeKey;
  reason: 'missing_index' | 'stale_index' | 'orphan_index';
  current: ReturnType<typeof projectionAuthority>;
  desired: ReturnType<typeof projectionAuthority>;
};

export type UserProjectionReport = {
  userId: string;
  scopesChecked: number;
  drift: ScopeDrift[];
  repaired: number;
  dryRun: boolean;
};

function scopeKeyOf(value: { userId: string; scopeType: AccessScopeType; scopeId: string }): string {
  return `${value.scopeType}:${value.scopeId}:${value.userId}`;
}

/**
 * Recomputes every projection for one user and reports the difference.
 *
 * Covers three drift shapes: a scope whose assignments imply access with no index
 * (`missing_index`), an index whose authority no longer matches its assignments
 * (`stale_index`), and an index for a scope with no active assignments at all
 * (`orphan_index` — the one that keeps revoked operators working).
 *
 * Idempotent: running it twice with no intervening change repairs nothing the second
 * time. With `dryRun` it writes nothing, which is how the migration is rehearsed.
 */
export async function rebuildUserProjections(
  userId: string,
  options: { dryRun?: boolean; now?: Date } = {},
): Promise<UserProjectionReport> {
  const dryRun = options.dryRun ?? false;
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();

  const [assignmentSnapshot, indexSnapshot] = await Promise.all([
    adminDb.collection('accessAssignments').where('userId', '==', userId).get(),
    adminDb.collection('accessIndex').where('userId', '==', userId).get(),
  ]);

  const assignments = assignmentSnapshot.docs
    .map((doc) => normalizeAccessAssignment(doc.id, doc.data(), nowIso));
  const currentByScope = new Map(indexSnapshot.docs.map((doc) => {
    const index = normalizeAccessIndex(doc.data());
    return [scopeKeyOf(index), { index, id: doc.id }];
  }));

  const scopes = new Map<string, AccessScopeKey>();
  for (const assignment of assignments) {
    const scope = { userId, scopeType: assignment.scopeType, scopeId: assignment.scopeId };
    scopes.set(scopeKeyOf(scope), scope);
  }
  for (const [, entry] of currentByScope) {
    const scope = { userId, scopeType: entry.index.scopeType, scopeId: entry.index.scopeId };
    scopes.set(scopeKeyOf(scope), scope);
  }

  const drift: ScopeDrift[] = [];
  const writes: Array<() => void> = [];
  const batch = adminDb.batch();

  for (const [key, scope] of scopes) {
    const current = currentByScope.get(key)?.index ?? null;
    const desired = projectScopeIndex({ scope, assignments, updatedAt: nowIso, now });
    if (authorityMatches(current, desired)) continue;

    const reason: ScopeDrift['reason'] = !current
      ? 'missing_index'
      : !desired ? 'orphan_index' : 'stale_index';
    drift.push({
      scope,
      reason,
      current: projectionAuthority(current),
      desired: projectionAuthority(desired),
    });

    const indexRef = adminDb.collection('accessIndex')
      .doc(accessIndexId(scope.scopeType, scope.scopeId, scope.userId));
    writes.push(() => {
      if (desired) {
        batch.set(indexRef, {
          ...desired,
          accessVersion: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: false });
      } else {
        batch.delete(indexRef);
      }
    });
  }

  if (!dryRun && writes.length) {
    for (const write of writes) write();
    batch.set(adminDb.collection('users').doc(userId), {
      accessVersion: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
  }

  return {
    userId,
    scopesChecked: scopes.size,
    drift,
    repaired: dryRun ? 0 : writes.length,
    dryRun,
  };
}
