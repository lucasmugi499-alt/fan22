/**
 * The pure access projection: how active assignments become an `accessIndex` document.
 *
 * Deliberately free of `server-only` and of any Firestore client, so the migration and
 * drift-report scripts compute the projection with the exact code the runtime uses. A
 * second implementation for tooling would defeat the point of having one projector.
 *
 * Firestore-facing behaviour (transactional rebuild, repair, deletion) lives in
 * `src/server/access/projector.ts`.
 */

import type { DocumentData } from 'firebase-admin/firestore';
import {
  buildAccessIndexDocuments,
  type AccessAssignment,
  type AccessIndexDocument,
  type AccessRoleKey,
  type AccessScopeType,
} from './access';

export type AccessScopeKey = {
  userId: string;
  scopeType: AccessScopeType;
  scopeId: string;
};

type FirestoreValue = { toDate?: () => Date };

export function isoFromFirestoreValue(value: unknown, fallback: string) {
  if (typeof value === 'string') return value;
  const maybeTimestamp = value as FirestoreValue | undefined;
  const date = maybeTimestamp?.toDate?.();
  return date instanceof Date ? date.toISOString() : fallback;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** Coerces a stored assignment document into the canonical shape. */
export function normalizeAccessAssignment(
  id: string,
  data: DocumentData,
  fallbackNow: string,
): AccessAssignment {
  return {
    id: typeof data.id === 'string' ? data.id : id,
    userId: String(data.userId ?? ''),
    roleKey: String(data.roleKey ?? '') as AccessRoleKey,
    scopeType: String(data.scopeType ?? '') as AccessScopeType,
    scopeId: String(data.scopeId ?? ''),
    permissionBundleId: String(data.permissionBundleId ?? data.roleKey ?? ''),
    status: String(data.status ?? 'pending') as AccessAssignment['status'],
    grantedByUserId: String(data.grantedByUserId ?? ''),
    invitationId: typeof data.invitationId === 'string' ? data.invitationId : undefined,
    applicationId: typeof data.applicationId === 'string' ? data.applicationId : undefined,
    validFrom: isoFromFirestoreValue(data.validFrom, fallbackNow),
    validUntil: data.validUntil ? isoFromFirestoreValue(data.validUntil, fallbackNow) : undefined,
    suspendedAt: data.suspendedAt ? isoFromFirestoreValue(data.suspendedAt, fallbackNow) : undefined,
    revokedAt: data.revokedAt ? isoFromFirestoreValue(data.revokedAt, fallbackNow) : undefined,
    revocationReason: typeof data.revocationReason === 'string' ? data.revocationReason : undefined,
    createdAt: isoFromFirestoreValue(data.createdAt, fallbackNow),
    updatedAt: isoFromFirestoreValue(data.updatedAt, fallbackNow),
  };
}

/** Coerces a stored index document into the canonical shape. */
export function normalizeAccessIndex(data: DocumentData): AccessIndexDocument {
  return {
    userId: String(data.userId ?? ''),
    scopeType: String(data.scopeType ?? '') as AccessScopeType,
    scopeId: String(data.scopeId ?? ''),
    activeRoles: stringArray(data.activeRoles).sort() as AccessRoleKey[],
    capabilities: stringArray(data.capabilities).sort() as AccessIndexDocument['capabilities'],
    assignmentIds: stringArray(data.assignmentIds).sort(),
    accessVersion: Number(data.accessVersion ?? 1),
    updatedAt: isoFromFirestoreValue(data.updatedAt, new Date().toISOString()),
  };
}

/**
 * The authority a projection actually grants. `accessVersion` and `updatedAt` are
 * excluded: they are monotonic bookkeeping, not authority, and comparing them would
 * report drift on every rebuild.
 */
export function projectionAuthority(index: AccessIndexDocument | null) {
  if (!index) return null;
  return {
    activeRoles: [...index.activeRoles].sort(),
    capabilities: [...index.capabilities].sort(),
    assignmentIds: [...index.assignmentIds].sort(),
  };
}

export function authorityMatches(left: AccessIndexDocument | null, right: AccessIndexDocument | null) {
  return JSON.stringify(projectionAuthority(left)) === JSON.stringify(projectionAuthority(right));
}

/**
 * The projection itself: the desired index document for one scope, or `null` when no
 * active assignment remains. Revoked, suspended, expired and not-yet-valid assignments
 * are excluded by `buildAccessIndexDocuments`.
 *
 * `null` means the document must be deleted rather than written empty. An empty
 * document would still satisfy an `exists()` check in Firestore Rules, so absence is
 * the safer representation of "no access".
 */
export function projectScopeIndex({
  scope,
  assignments,
  accessVersion = 1,
  updatedAt,
  now = new Date(updatedAt),
}: {
  scope: AccessScopeKey;
  assignments: AccessAssignment[];
  accessVersion?: number;
  updatedAt: string;
  now?: Date;
}): AccessIndexDocument | null {
  const scoped = assignments.filter((assignment) =>
    assignment.userId === scope.userId
    && assignment.scopeType === scope.scopeType
    && assignment.scopeId === scope.scopeId);

  const [projected] = buildAccessIndexDocuments({
    assignments: scoped,
    accessVersion,
    updatedAt,
    now,
  });
  return projected ?? null;
}

/** Overlay applied to the stored assignments before projecting. */
export type PendingAssignmentChange =
  | { operation: 'upsert'; assignment: AccessAssignment }
  | { operation: 'remove'; assignmentId: string };

export function applyPendingChanges(
  stored: AccessAssignment[],
  pending: PendingAssignmentChange[],
): AccessAssignment[] {
  const byId = new Map(stored.map((assignment) => [assignment.id, assignment]));
  for (const change of pending) {
    if (change.operation === 'remove') byId.delete(change.assignmentId);
    else byId.set(change.assignment.id, change.assignment);
  }
  return [...byId.values()];
}

