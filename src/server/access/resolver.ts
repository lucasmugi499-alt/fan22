import 'server-only';

import type { DocumentData } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import {
  AccessAssignment,
  AccessContext,
  AccessIndexDocument,
  AccessRoleKey,
  AccessScopeType,
  buildAccessIndexDocuments,
} from '@/lib/auth/access';
import { AccessEngineMode, accessEngineMode, returnsLegacyProjection } from '@/lib/auth/accessMode';
import { resolveAccountClass } from '@/lib/auth/accountClass';
import { recordAccessDivergence } from './securityEvents';
import type { AccountClass, AppRole } from '@/types';

export type TrustedAccessContext = AccessContext & {
  accountRole: AppRole | null;
  accountClass: AccountClass;
  primaryPersona: AppRole | null;
  mode: AccessEngineMode;
};

type FirestoreValue = {
  toDate?: () => Date;
};

function isoFromFirestoreValue(value: unknown, fallback: string) {
  if (typeof value === 'string') return value;
  const maybeTimestamp = value as FirestoreValue | undefined;
  const date = maybeTimestamp?.toDate?.();
  return date instanceof Date ? date.toISOString() : fallback;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeAssignment(id: string, data: DocumentData, fallbackNow: string): AccessAssignment {
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

function normalizeIndex(data: DocumentData): AccessIndexDocument {
  const updatedAt = isoFromFirestoreValue(data.updatedAt, new Date().toISOString());
  return {
    userId: String(data.userId ?? ''),
    scopeType: String(data.scopeType ?? '') as AccessScopeType,
    scopeId: String(data.scopeId ?? ''),
    activeRoles: stringArray(data.activeRoles).sort() as AccessRoleKey[],
    capabilities: stringArray(data.capabilities).sort() as AccessIndexDocument['capabilities'],
    assignmentIds: stringArray(data.assignmentIds).sort(),
    accessVersion: Number(data.accessVersion ?? 1),
    updatedAt,
  };
}

function accessVersionFromIndexes(indexes: AccessIndexDocument[], fallback = 1) {
  return indexes.reduce((version, index) => Math.max(version, Number(index.accessVersion ?? 1)), fallback);
}

function canonicalIndexes(indexes: AccessIndexDocument[]) {
  return indexes
    .map((index) => ({
      userId: index.userId,
      scopeType: index.scopeType,
      scopeId: index.scopeId,
      activeRoles: [...index.activeRoles].sort(),
      capabilities: [...index.capabilities].sort(),
      assignmentIds: [...index.assignmentIds].sort(),
    }))
    .sort((left, right) =>
      `${left.scopeType}:${left.scopeId}:${left.userId}`.localeCompare(`${right.scopeType}:${right.scopeId}:${right.userId}`),
    );
}

export function accessContextsDiverge(left: AccessContext, right: AccessContext) {
  return JSON.stringify(canonicalIndexes(left.indexes)) !== JSON.stringify(canonicalIndexes(right.indexes));
}

function scopeSignature(index: AccessIndexDocument) {
  return `${index.scopeType}:${index.scopeId}`;
}

/**
 * Emits one divergence event per scope the two authorities disagree on, capturing which
 * side was broader. A scope present only in the legacy projection is the dangerous
 * direction: access that canonical assignments no longer justify.
 */
async function recordContextDivergence(
  userId: string,
  legacyContext: AccessContext,
  assignmentContext: AccessContext,
  accessVersion: number,
) {
  const legacyByScope = new Map(legacyContext.indexes.map((index) => [scopeSignature(index), index]));
  const assignmentByScope = new Map(assignmentContext.indexes.map((index) => [scopeSignature(index), index]));
  const scopes = new Set([...legacyByScope.keys(), ...assignmentByScope.keys()]);

  await Promise.all([...scopes].map(async (signature) => {
    const legacy = legacyByScope.get(signature);
    const assignment = assignmentByScope.get(signature);
    const sameAuthority = JSON.stringify(legacy ? canonicalIndexes([legacy]) : null)
      === JSON.stringify(assignment ? canonicalIndexes([assignment]) : null);
    if (sameAuthority) return;

    const [scopeType, scopeId] = signature.split(':');
    await recordAccessDivergence({
      userId,
      scopeType: scopeType as AccessScopeType,
      scopeId,
      legacyDecision: Boolean(legacy),
      assignmentDecision: Boolean(assignment),
      assignmentIds: assignment?.assignmentIds,
      accessVersion,
    });
  }));
}

async function loadUserProfile(userId: string) {
  const snapshot = await adminDb.collection('users').doc(userId).get();
  const data = snapshot.exists ? snapshot.data() ?? {} : {};
  return {
    accountRole: (typeof data.role === 'string' ? data.role : null) as AppRole | null,
    accountClass: resolveAccountClass({
      accountClass: data.accountClass,
      role: typeof data.role === 'string' ? data.role : null,
    }),
    primaryPersona: (typeof data.primaryPersona === 'string' ? data.primaryPersona : null) as AppRole | null,
    accessVersion: Number(data.accessVersion ?? 1),
  };
}

async function loadAssignments(userId: string, nowIso: string) {
  const snapshot = await adminDb.collection('accessAssignments').where('userId', '==', userId).get();
  return snapshot.docs.map((doc) => normalizeAssignment(doc.id, doc.data(), nowIso));
}

async function loadLegacyIndexes(userId: string) {
  const snapshot = await adminDb.collection('accessIndex').where('userId', '==', userId).get();
  return snapshot.docs.map((doc) => normalizeIndex(doc.data()));
}

function contextFromIndexes(userId: string, indexes: AccessIndexDocument[], accessVersion?: number): AccessContext {
  return {
    userId,
    indexes: indexes
      .map((index) => ({
        ...index,
        activeRoles: [...index.activeRoles].sort(),
        capabilities: [...index.capabilities].sort(),
        assignmentIds: [...index.assignmentIds].sort(),
      }))
      .sort((left, right) =>
        `${left.scopeType}:${left.scopeId}:${left.userId}`.localeCompare(`${right.scopeType}:${right.scopeId}:${right.userId}`),
      ),
    accessVersion: accessVersionFromIndexes(indexes, accessVersion ?? 1),
  };
}

export async function resolveTrustedAccessContext(
  userId: string,
  options: { mode?: AccessEngineMode; now?: Date } = {},
): Promise<TrustedAccessContext> {
  const mode = options.mode ?? accessEngineMode();
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const [profile, assignments, legacyIndexes] = await Promise.all([
    loadUserProfile(userId),
    mode === 'legacy' ? Promise.resolve([]) : loadAssignments(userId, nowIso),
    returnsLegacyProjection(mode) ? loadLegacyIndexes(userId) : Promise.resolve([]),
  ]);

  const assignmentContext = contextFromIndexes(
    userId,
    buildAccessIndexDocuments({
      assignments,
      accessVersion: profile.accessVersion,
      updatedAt: nowIso,
      now,
    }),
    profile.accessVersion,
  );
  const legacyContext = contextFromIndexes(userId, legacyIndexes, profile.accessVersion);

  if (mode === 'compare' && accessContextsDiverge(legacyContext, assignmentContext)) {
    // Recorded per scope rather than as one blob so each disagreement is independently
    // reviewable and closes independently. A console warning could not be reviewed at
    // all, and the cutover gate is "divergence has reached zero" — which needs evidence
    // that outlives a log rotation.
    await recordContextDivergence(userId, legacyContext, assignmentContext, profile.accessVersion);
  }

  const selectedContext = mode === 'assignments' ? assignmentContext : legacyContext;
  return {
    ...selectedContext,
    accessVersion: Math.max(selectedContext.accessVersion, profile.accessVersion),
    accountRole: profile.accountRole,
    accountClass: profile.accountClass,
    primaryPersona: profile.primaryPersona,
    mode,
  };
}
