import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminDb } from '@/lib/firebase/admin';
import {
  normalizeAccessAssignment,
  projectScopeIndex,
  projectionAuthority,
  readScopeProjection,
  rebuildUserProjections,
  type AccessScopeKey,
} from './projector';
import type { AccessAssignment } from '@/lib/auth/access';

vi.mock('server-only', () => ({}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    increment: (value: number) => ({ __increment: value }),
    serverTimestamp: () => ({ __serverTimestamp: true }),
  },
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(),
    batch: vi.fn(),
  },
}));

const NOW = new Date('2026-08-03T12:00:00.000Z');
const NOW_ISO = NOW.toISOString();

function assignment(overrides: Partial<AccessAssignment> = {}): AccessAssignment {
  return {
    id: 'assignment_1',
    userId: 'user_1',
    roleKey: 'team_admin',
    scopeType: 'team',
    scopeId: 'team_1',
    permissionBundleId: 'full_team_admin',
    status: 'active',
    grantedByUserId: 'admin_1',
    validFrom: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const TEAM_SCOPE: AccessScopeKey = { userId: 'user_1', scopeType: 'team', scopeId: 'team_1' };

describe('projectScopeIndex', () => {
  it('unions roles, capabilities and assignment ids across active assignments in a scope', () => {
    const projected = projectScopeIndex({
      scope: TEAM_SCOPE,
      assignments: [
        assignment({ id: 'a_roster', roleKey: 'roster_manager', permissionBundleId: 'roster_only' }),
        assignment({ id: 'a_results', roleKey: 'result_reporter', permissionBundleId: 'results_only' }),
      ],
      updatedAt: NOW_ISO,
      now: NOW,
    });

    expect(projected?.activeRoles).toEqual(['result_reporter', 'roster_manager']);
    expect(projected?.assignmentIds).toEqual(['a_results', 'a_roster']);
    // Roles and assignment ids still union. Capabilities do not, because both bundles were
    // versioned to zero by ADR-004. The projection is the mechanism that retires them.
    expect(projected?.capabilities).toEqual([]);
  });

  it('still unions capabilities where the bundles grant any', () => {
    const projected = projectScopeIndex({
      scope: { userId: 'user_1', scopeType: 'league', scopeId: 'league_1' },
      assignments: [
        assignment({
          id: 'a_admin',
          roleKey: 'league_admin',
          scopeType: 'league',
          scopeId: 'league_1',
          permissionBundleId: 'league_admin',
        }),
        assignment({
          id: 'a_owner',
          roleKey: 'league_owner',
          scopeType: 'league',
          scopeId: 'league_1',
          permissionBundleId: 'league_owner',
        }),
      ],
      updatedAt: NOW_ISO,
      now: NOW,
    });

    expect(projected?.activeRoles).toEqual(['league_admin', 'league_owner']);
    expect(projected?.capabilities).toContain('league.roster.manage');
    // Held by the owner bundle alone, so its presence is the proof that the union happened
    // rather than one bundle being read and the other ignored.
    expect(projected?.capabilities).toContain('ownership.transfer');
    // And the union never invents a team capability, which is invariant 15.
    expect(projected?.capabilities.filter((c) => c.startsWith('team.'))).toEqual([]);
  });

  it.each([
    ['revoked', { status: 'revoked' as const }],
    ['suspended', { status: 'suspended' as const }],
    ['pending', { status: 'pending' as const }],
    ['expired by validUntil', { validUntil: '2026-07-01T00:00:00.000Z' }],
    ['not yet valid', { validFrom: '2026-12-01T00:00:00.000Z' }],
  ])('excludes a %s assignment entirely', (_label, overrides) => {
    const projected = projectScopeIndex({
      scope: TEAM_SCOPE,
      assignments: [assignment(overrides)],
      updatedAt: NOW_ISO,
      now: NOW,
    });

    // No active assignment means no document, not an empty one: an empty document would
    // still satisfy an exists() check in Firestore Rules.
    expect(projected).toBeNull();
  });

  it('keeps only the capabilities still granted when one of two assignments is revoked', () => {
    const projected = projectScopeIndex({
      scope: TEAM_SCOPE,
      assignments: [
        assignment({ id: 'a_roster', roleKey: 'roster_manager', permissionBundleId: 'roster_only' }),
        assignment({ id: 'a_results', roleKey: 'result_reporter', permissionBundleId: 'results_only', status: 'revoked' }),
      ],
      updatedAt: NOW_ISO,
      now: NOW,
    });

    expect(projected?.activeRoles).toEqual(['roster_manager']);
    expect(projected?.capabilities).not.toContain('team.result.submit');
  });

  it('ignores assignments belonging to another scope or user', () => {
    const projected = projectScopeIndex({
      scope: TEAM_SCOPE,
      assignments: [
        assignment({ id: 'other_team', scopeId: 'team_2' }),
        assignment({ id: 'other_user', userId: 'user_2' }),
      ],
      updatedAt: NOW_ISO,
      now: NOW,
    });

    expect(projected).toBeNull();
  });

  it('is deterministic regardless of assignment ordering', () => {
    const a = assignment({ id: 'a_1', roleKey: 'roster_manager', permissionBundleId: 'roster_only' });
    const b = assignment({ id: 'a_2', roleKey: 'result_reporter', permissionBundleId: 'results_only' });

    const forward = projectScopeIndex({ scope: TEAM_SCOPE, assignments: [a, b], updatedAt: NOW_ISO, now: NOW });
    const reverse = projectScopeIndex({ scope: TEAM_SCOPE, assignments: [b, a], updatedAt: NOW_ISO, now: NOW });

    expect(projectionAuthority(forward)).toEqual(projectionAuthority(reverse));
  });
});

type StoredDoc = { id: string; data: Record<string, unknown> };

function installFirestore({
  assignments = [],
  indexes = [],
}: { assignments?: StoredDoc[]; indexes?: StoredDoc[] } = {}) {
  const written: Array<{ op: string; path: string; data?: Record<string, unknown> }> = [];

  const queryFor = (collectionName: string) => {
    const api = {
      where: vi.fn(() => api),
      get: vi.fn(async () => ({
        docs: (collectionName === 'accessAssignments' ? assignments : indexes)
          .map((doc) => ({ id: doc.id, data: () => doc.data })),
      })),
      doc: vi.fn((id: string) => ({ path: `${collectionName}/${id}` })),
    };
    return api;
  };

  vi.mocked(adminDb.collection).mockImplementation((name: string) => queryFor(name) as never);
  vi.mocked(adminDb.batch).mockImplementation(() => ({
    set: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
      written.push({ op: 'set', path: ref.path, data });
    }),
    delete: vi.fn((ref: { path: string }) => {
      written.push({ op: 'delete', path: ref.path });
    }),
    commit: vi.fn(async () => undefined),
  }) as never);

  return { written };
}

describe('readScopeProjection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function transactionFor(assignments: StoredDoc[], index: StoredDoc | null) {
    return {
      get: vi.fn(async (target: unknown) => {
        if (target && typeof target === 'object' && 'path' in target) {
          return {
            exists: Boolean(index),
            data: () => index?.data,
          };
        }
        return { docs: assignments.map((doc) => ({ id: doc.id, data: () => doc.data })) };
      }),
    };
  }

  it('deletes the projection when the last assignment is revoked', async () => {
    installFirestore();
    const transaction = transactionFor(
      [{ id: 'assignment_1', data: { ...assignment(), status: 'revoked' } }],
      { id: 'team_team_1_user_1', data: { ...assignment(), activeRoles: ['team_admin'], capabilities: ['team.roster.manage'], assignmentIds: ['assignment_1'] } },
    );

    const projection = await readScopeProjection(transaction as never, TEAM_SCOPE, { now: NOW });

    expect(projection.desired).toBeNull();
    expect(projection.changed).toBe(true);

    const writes: Array<{ op: string; path?: string }> = [];
    projection.apply({
      set: (ref: { path: string }) => writes.push({ op: 'set', path: ref.path }),
      delete: (ref: { path: string }) => writes.push({ op: 'delete', path: ref.path }),
    } as never);

    expect(writes).toContainEqual({ op: 'delete', path: 'accessIndex/team_team_1_user_1' });
  });

  it('applies a pending assignment that is not yet stored', async () => {
    installFirestore();
    const transaction = transactionFor([], null);

    const projection = await readScopeProjection(transaction as never, TEAM_SCOPE, {
      now: NOW,
      pending: [{ operation: 'upsert', assignment: assignment() }],
    });

    expect(projection.desired?.activeRoles).toEqual(['team_admin']);
    expect(projection.changed).toBe(true);
  });

  it('reports no change when the stored projection already matches', async () => {
    installFirestore();
    const stored = projectScopeIndex({
      scope: TEAM_SCOPE,
      assignments: [assignment()],
      updatedAt: NOW_ISO,
      now: NOW,
    });
    const transaction = transactionFor(
      [{ id: 'assignment_1', data: assignment() }],
      { id: 'team_team_1_user_1', data: stored as unknown as Record<string, unknown> },
    );

    const projection = await readScopeProjection(transaction as never, TEAM_SCOPE, { now: NOW });

    // Idempotence: replaying the same mutation must not churn accessVersion.
    expect(projection.changed).toBe(false);
  });
});

describe('rebuildUserProjections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports a missing index as drift and repairs it', async () => {
    const { written } = installFirestore({
      assignments: [{ id: 'assignment_1', data: assignment() }],
      indexes: [],
    });

    const report = await rebuildUserProjections('user_1', { now: NOW });

    expect(report.drift).toHaveLength(1);
    expect(report.drift[0].reason).toBe('missing_index');
    expect(report.repaired).toBe(1);
    expect(written.some((write) => write.op === 'set' && write.path === 'accessIndex/team_team_1_user_1')).toBe(true);
  });

  it('deletes an orphan index whose assignments are all revoked', async () => {
    const { written } = installFirestore({
      assignments: [{ id: 'assignment_1', data: { ...assignment(), status: 'revoked' } }],
      indexes: [{
        id: 'team_team_1_user_1',
        data: {
          userId: 'user_1',
          scopeType: 'team',
          scopeId: 'team_1',
          activeRoles: ['team_admin'],
          capabilities: ['team.roster.manage'],
          assignmentIds: ['assignment_1'],
        },
      }],
    });

    const report = await rebuildUserProjections('user_1', { now: NOW });

    // This is the drift shape that keeps a revoked operator working.
    expect(report.drift[0].reason).toBe('orphan_index');
    expect(written).toContainEqual({ op: 'delete', path: 'accessIndex/team_team_1_user_1' });
  });

  it('reports a stale index whose capabilities exceed its assignments', async () => {
    const { written } = installFirestore({
      assignments: [{ id: 'assignment_1', data: assignment({ roleKey: 'result_reporter', permissionBundleId: 'results_only' }) }],
      indexes: [{
        id: 'team_team_1_user_1',
        data: {
          userId: 'user_1',
          scopeType: 'team',
          scopeId: 'team_1',
          activeRoles: ['team_admin'],
          capabilities: ['team.roster.manage', 'team.result.submit'],
          assignmentIds: ['assignment_1'],
        },
      }],
    });

    const report = await rebuildUserProjections('user_1', { now: NOW });

    expect(report.drift[0].reason).toBe('stale_index');
    expect(report.drift[0].desired?.capabilities).not.toContain('team.roster.manage');
    expect(written.some((write) => write.op === 'set')).toBe(true);
  });

  it('writes nothing in dry-run mode but still reports the drift', async () => {
    const { written } = installFirestore({
      assignments: [{ id: 'assignment_1', data: assignment() }],
      indexes: [],
    });

    const report = await rebuildUserProjections('user_1', { dryRun: true, now: NOW });

    expect(report.drift).toHaveLength(1);
    expect(report.repaired).toBe(0);
    expect(written).toHaveLength(0);
  });

  it('is idempotent when the projection already matches', async () => {
    const projected = projectScopeIndex({
      scope: TEAM_SCOPE,
      assignments: [assignment()],
      updatedAt: NOW_ISO,
      now: NOW,
    });
    const { written } = installFirestore({
      assignments: [{ id: 'assignment_1', data: assignment() }],
      indexes: [{ id: 'team_team_1_user_1', data: projected as unknown as Record<string, unknown> }],
    });

    const report = await rebuildUserProjections('user_1', { now: NOW });

    expect(report.drift).toHaveLength(0);
    expect(report.repaired).toBe(0);
    expect(written).toHaveLength(0);
  });
});

describe('normalizeAccessAssignment', () => {
  it('recovers Firestore timestamps and defaults a missing status to pending', () => {
    const normalized = normalizeAccessAssignment('doc_1', {
      userId: 'user_1',
      roleKey: 'team_admin',
      scopeType: 'team',
      scopeId: 'team_1',
      validFrom: { toDate: () => new Date('2026-02-01T00:00:00.000Z') },
    }, NOW_ISO);

    expect(normalized.validFrom).toBe('2026-02-01T00:00:00.000Z');
    // A record with no explicit status must not be treated as active.
    expect(normalized.status).toBe('pending');
    expect(normalized.permissionBundleId).toBe('team_admin');
  });
});
