import { describe, expect, it } from 'vitest';
import { buildMigrationPlan } from './projection-migration';

const NOW = new Date('2026-08-03T12:00:00.000Z');

function assignment(overrides: Record<string, unknown> = {}) {
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

describe('access projection migration plan', () => {
  it('reports no drift when the stored index already matches the assignments', () => {
    const plan = buildMigrationPlan({
      assignments: [assignment()],
      indexes: [{
        id: 'team_team_1_user_1',
        userId: 'user_1',
        scopeType: 'team',
        scopeId: 'team_1',
        activeRoles: ['team_admin'],
        capabilities: [
          'team.athlete.create',
          'team.athlete.invite',
          'team.profile.manage',
          'team.result.confirm',
          'team.result.submit',
          'team.roster.manage',
          'team.staff.invite',
          'team.update.publish',
        ],
        assignmentIds: ['assignment_1'],
      }],
      now: NOW,
    });

    expect(plan.drift).toHaveLength(0);
  });

  it('flags an index that outlived its revoked assignment', () => {
    const plan = buildMigrationPlan({
      assignments: [assignment({ status: 'revoked' })],
      indexes: [{
        id: 'team_team_1_user_1',
        userId: 'user_1',
        scopeType: 'team',
        scopeId: 'team_1',
        activeRoles: ['team_admin'],
        capabilities: ['team.roster.manage'],
        assignmentIds: ['assignment_1'],
      }],
      now: NOW,
    });

    // The population that keeps revoked operators working. It must reach zero before
    // Firestore Rules are allowed to authorize from this projection.
    expect(plan.drift).toHaveLength(1);
    expect(plan.drift[0]).toMatchObject({
      reason: 'orphan_index',
      indexId: 'team_team_1_user_1',
      desired: null,
    });
  });

  it('flags a scope whose assignments imply access with no index at all', () => {
    const plan = buildMigrationPlan({
      assignments: [assignment()],
      indexes: [],
      now: NOW,
    });

    expect(plan.drift[0]).toMatchObject({ reason: 'missing_index' });
  });

  it('flags an index granting more than its assignments justify', () => {
    const plan = buildMigrationPlan({
      assignments: [assignment({ roleKey: 'result_reporter', permissionBundleId: 'results_only' })],
      indexes: [{
        id: 'team_team_1_user_1',
        userId: 'user_1',
        scopeType: 'team',
        scopeId: 'team_1',
        activeRoles: ['team_admin'],
        capabilities: ['team.roster.manage', 'team.result.submit'],
        assignmentIds: ['assignment_1'],
      }],
      now: NOW,
    });

    expect(plan.drift[0].reason).toBe('stale_index');
    expect(plan.drift[0].desired?.capabilities).toEqual(['team.result.confirm', 'team.result.submit']);
  });

  it('does not attribute one user\'s assignment to another user in the same scope', () => {
    const plan = buildMigrationPlan({
      assignments: [assignment({ id: 'a_1', userId: 'user_1' })],
      indexes: [{
        id: 'team_team_1_user_2',
        userId: 'user_2',
        scopeType: 'team',
        scopeId: 'team_1',
        activeRoles: ['team_admin'],
        capabilities: ['team.roster.manage'],
        assignmentIds: ['a_1'],
      }],
      now: NOW,
    });

    const orphan = plan.drift.find((row) => row.userId === 'user_2');
    expect(orphan?.reason).toBe('orphan_index');
  });
});
