import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminDb } from '@/lib/firebase/admin';
import { recordAccessDivergence } from './securityEvents';
import { resolveTrustedAccessContext } from './resolver';

vi.mock('server-only', () => ({}));

vi.mock('./securityEvents', () => ({
  recordAccessDivergence: vi.fn(async () => undefined),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(),
  },
}));

function querySnapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    docs: docs.map((doc) => ({
      id: doc.id,
      data: () => doc.data,
    })),
  };
}

function userSnapshot(data: Record<string, unknown>) {
  return {
    exists: true,
    data: () => data,
  };
}

function mockCollections({
  user = { role: 'fan', primaryPersona: 'fan', accessVersion: 1 },
  assignments = [],
  indexes = [],
}: {
  user?: Record<string, unknown>;
  assignments?: Array<{ id: string; data: Record<string, unknown> }>;
  indexes?: Array<{ id: string; data: Record<string, unknown> }>;
}) {
  vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => {
    if (collectionName === 'users') {
      return {
        doc: vi.fn(() => ({
          get: vi.fn(async () => userSnapshot(user)),
        })),
      } as never;
    }
    if (collectionName === 'accessAssignments') {
      return {
        where: vi.fn(() => ({
          get: vi.fn(async () => querySnapshot(assignments)),
        })),
      } as never;
    }
    if (collectionName === 'accessIndex') {
      return {
        where: vi.fn(() => ({
          get: vi.fn(async () => querySnapshot(indexes)),
        })),
      } as never;
    }
    throw new Error(`Unexpected collection ${collectionName}`);
  });
}

const now = new Date('2026-07-30T12:00:00.000Z');

describe('trusted access resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns the legacy projection in compare mode and records assignment divergences durably', async () => {
    mockCollections({
      assignments: [{
        id: 'assignment_league_1',
        data: {
          userId: 'user_1',
          roleKey: 'league_owner',
          scopeType: 'league',
          scopeId: 'league_1',
          permissionBundleId: 'league_owner',
          status: 'active',
          grantedByUserId: 'platform_1',
          validFrom: '2026-07-30T00:00:00.000Z',
          createdAt: '2026-07-30T00:00:00.000Z',
          updatedAt: '2026-07-30T00:00:00.000Z',
        },
      }],
      indexes: [{
        id: 'team_team_1_user_1',
        data: {
          userId: 'user_1',
          scopeType: 'team',
          scopeId: 'team_1',
          activeRoles: ['team_admin'],
          capabilities: ['team.profile.manage'],
          assignmentIds: ['assignment_team_1'],
          accessVersion: 3,
          updatedAt: '2026-07-30T01:00:00.000Z',
        },
      }],
    });

    const context = await resolveTrustedAccessContext('user_1', { mode: 'compare', now });

    expect(context.mode).toBe('compare');
    expect(context.accountClass).toBe('fan');
    expect(context.indexes).toHaveLength(1);
    expect(context.indexes[0]).toMatchObject({
      scopeType: 'team',
      scopeId: 'team_1',
      activeRoles: ['team_admin'],
    });
    // A console warning cannot be reviewed after the fact, and "divergence has reached
    // zero" is the gate for the canonical cutover, so the record must be durable.
    expect(recordAccessDivergence).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      scopeType: 'league',
      scopeId: 'league_1',
      legacyDecision: false,
      assignmentDecision: true,
    }));
  });

  it('keeps recording divergence after the cutover to assignments mode', async () => {
    mockCollections({
      user: { role: 'team_admin', accountClass: 'organization_operator', accessVersion: 2 },
      assignments: [],
      indexes: [{
        id: 'team_team_9_user_1',
        data: {
          userId: 'user_1',
          scopeType: 'team',
          scopeId: 'team_9',
          activeRoles: ['team_admin'],
          capabilities: ['team.profile.manage'],
          assignmentIds: ['stale_assignment'],
          accessVersion: 1,
          updatedAt: '2026-07-30T01:00:00.000Z',
        },
      }],
    });

    const context = await resolveTrustedAccessContext('user_1', { mode: 'assignments', now });

    // Canonical wins: the stale legacy projection grants nothing.
    expect(context.indexes).toHaveLength(0);
    // But the disagreement is still observed. Monitoring that stopped at the cutover
    // could not tell anyone whether the cutover was safe.
    expect(recordAccessDivergence).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      scopeType: 'team',
      scopeId: 'team_9',
      legacyDecision: true,
      assignmentDecision: false,
    }));
  });

  it('uses assignment projections in assignments mode and excludes inactive assignments', async () => {
    mockCollections({
      user: {
        role: 'team_admin',
        accountClass: 'organization_operator',
        primaryPersona: 'league_admin',
        accessVersion: 9,
      },
      assignments: [
        {
          id: 'assignment_b',
          data: {
            userId: 'user_1',
            roleKey: 'result_reporter',
            scopeType: 'team',
            scopeId: 'team_1',
            permissionBundleId: 'results_only',
            status: 'active',
            grantedByUserId: 'league_1',
            validFrom: '2026-07-30T00:00:00.000Z',
            createdAt: '2026-07-30T00:00:00.000Z',
            updatedAt: '2026-07-30T00:00:00.000Z',
          },
        },
        {
          id: 'assignment_a',
          data: {
            userId: 'user_1',
            roleKey: 'team_admin',
            scopeType: 'team',
            scopeId: 'team_1',
            permissionBundleId: 'full_team_admin',
            status: 'active',
            grantedByUserId: 'league_1',
            validFrom: '2026-07-30T00:00:00.000Z',
            createdAt: '2026-07-30T00:00:00.000Z',
            updatedAt: '2026-07-30T00:00:00.000Z',
          },
        },
        {
          id: 'assignment_suspended',
          data: {
            userId: 'user_1',
            roleKey: 'league_owner',
            scopeType: 'league',
            scopeId: 'league_1',
            permissionBundleId: 'league_owner',
            status: 'suspended',
            grantedByUserId: 'platform_1',
            validFrom: '2026-07-30T00:00:00.000Z',
            createdAt: '2026-07-30T00:00:00.000Z',
            updatedAt: '2026-07-30T00:00:00.000Z',
          },
        },
      ],
    });

    const context = await resolveTrustedAccessContext('user_1', { mode: 'assignments', now });

    expect(context.mode).toBe('assignments');
    expect(context.accountRole).toBe('team_admin');
    expect(context.accountClass).toBe('organization_operator');
    expect(context.primaryPersona).toBe('league_admin');
    expect(context.accessVersion).toBe(9);
    expect(context.indexes).toHaveLength(1);
    expect(context.indexes[0].assignmentIds).toEqual(['assignment_a', 'assignment_b']);
    expect(context.indexes[0].activeRoles).toEqual(['result_reporter', 'team_admin']);
    expect(context.indexes[0].capabilities).toContain('team.result.submit');
  });
});
