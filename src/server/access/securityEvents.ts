import 'server-only';

import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { goalPlaceEnvironment } from '@/lib/environment';
import type { AccessScopeType, PermissionCapability } from '@/lib/auth/access';

/**
 * Durable record of a security-relevant access observation.
 *
 * Divergence between the legacy and canonical authority was previously reported with
 * `console.warn`, which is neither reviewable nor alertable — a disagreement that
 * silently broadened access could exist for months without anyone being able to find it
 * afterwards. The canonical cutover cannot be approved without evidence that divergence
 * has reached zero, and that evidence has to survive a log rotation.
 *
 * Never record invitation tokens, credentials, session material or personal data. A
 * divergence event needs identifiers and decisions, nothing more.
 */

export type AccessDecisionSource = 'legacy' | 'assignments';

export type AccessDivergenceEvent = {
  userId: string;
  scopeType: AccessScopeType;
  scopeId: string;
  capability?: PermissionCapability;
  resource?: string;
  legacyDecision: boolean;
  assignmentDecision: boolean;
  assignmentIds?: string[];
  accessVersion?: number;
  requestId?: string;
};

export type AccessDivergenceKind =
  /** Legacy allows, canonical denies — the shape that preserves stale privilege. */
  | 'legacy_broader'
  /** Canonical allows, legacy denies — a legitimate operator blocked before cutover. */
  | 'assignments_broader'
  /** Whole-context projections disagree without a single capability in question. */
  | 'context_mismatch';

function divergenceKind(event: AccessDivergenceEvent): AccessDivergenceKind {
  if (event.legacyDecision && !event.assignmentDecision) return 'legacy_broader';
  if (!event.legacyDecision && event.assignmentDecision) return 'assignments_broader';
  return 'context_mismatch';
}

/**
 * Deterministic id so a repeatedly-hit disagreement is one reviewable record with an
 * occurrence count, rather than a flood that buries the distinct cases.
 */
function divergenceId(event: AccessDivergenceEvent, kind: AccessDivergenceKind) {
  return createHash('sha256')
    .update([
      event.userId,
      event.scopeType,
      event.scopeId,
      event.capability ?? 'context',
      kind,
    ].join(':'))
    .digest('hex')
    .slice(0, 40);
}

/**
 * Writes (or increments) one access-divergence security event.
 *
 * Never throws: a failure to record an observation must not fail the request that made
 * it, or the act of monitoring would itself become an outage.
 */
export async function recordAccessDivergence(event: AccessDivergenceEvent): Promise<void> {
  try {
    const kind = divergenceKind(event);
    const ref = adminDb.collection('securityEvents').doc(divergenceId(event, kind));
    await adminDb.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      transaction.set(ref, {
        type: 'access_authority_divergence',
        kind,
        userId: event.userId,
        scopeType: event.scopeType,
        scopeId: event.scopeId,
        ...(event.capability ? { capability: event.capability } : {}),
        ...(event.resource ? { resource: event.resource } : {}),
        legacyDecision: event.legacyDecision,
        assignmentDecision: event.assignmentDecision,
        ...(event.assignmentIds ? { assignmentIds: [...event.assignmentIds].sort() } : {}),
        ...(typeof event.accessVersion === 'number' ? { accessVersion: event.accessVersion } : {}),
        ...(event.requestId ? { requestId: event.requestId } : {}),
        environment: goalPlaceEnvironment(),
        occurrences: FieldValue.increment(1),
        lastSeenAt: FieldValue.serverTimestamp(),
        // Set once, so the record keeps showing how long the disagreement has existed.
        ...(existing.exists ? {} : { firstSeenAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  } catch (cause) {
    console.error('GoalPlace256 could not record an access divergence security event', cause);
  }
}
