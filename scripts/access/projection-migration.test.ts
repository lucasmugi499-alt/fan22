import { describe, expect, it } from 'vitest';
import { buildMigrationPlan, findLegacyCoverageGaps } from './projection-migration';

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

describe('legacy coverage gaps', () => {
  const assignments = buildMigrationPlan({
    assignments: [assignment({ id: 'a_1', userId: 'user_1', scopeType: 'team', scopeId: 'team_1' })],
    indexes: [],
    now: NOW,
  }).assignments;

  it('flags an adminUserIds entry with no canonical assignment', () => {
    const gaps = findLegacyCoverageGaps({
      assignments,
      leagues: [{ id: 'league_1', adminUserIds: ['user_9'] }],
      teams: [],
      teamAssignments: [],
      now: NOW,
    });

    // user_9 works today and is locked out the moment Rules stop reading the array.
    expect(gaps).toEqual([
      { scopeType: 'league', scopeId: 'league_1', userId: 'user_9', grant: 'adminUserIds' },
    ]);
  });

  it('does not flag an entry that a canonical assignment already covers', () => {
    const gaps = findLegacyCoverageGaps({
      assignments,
      leagues: [],
      teams: [{ id: 'team_1', adminUserIds: ['user_1'] }],
      teamAssignments: [],
      now: NOW,
    });

    expect(gaps).toHaveLength(0);
  });

  it('flags an active legacy teamAssignment with no canonical equivalent', () => {
    const gaps = findLegacyCoverageGaps({
      assignments,
      leagues: [],
      teams: [],
      teamAssignments: [{ id: 'ta_1', userId: 'user_9', teamId: 'team_2', status: 'active' }],
      now: NOW,
    });

    expect(gaps[0]).toMatchObject({ grant: 'teamAssignment', userId: 'user_9', scopeId: 'team_2' });
  });

  it('ignores inactive legacy team assignments', () => {
    const gaps = findLegacyCoverageGaps({
      assignments,
      leagues: [],
      teams: [],
      teamAssignments: [{ id: 'ta_1', userId: 'user_9', teamId: 'team_2', status: 'revoked' }],
      now: NOW,
    });

    expect(gaps).toHaveLength(0);
  });

  it('treats a revoked canonical assignment as no coverage', () => {
    const revoked = buildMigrationPlan({
      assignments: [assignment({ id: 'a_1', userId: 'user_1', scopeId: 'team_1', status: 'revoked' })],
      indexes: [],
      now: NOW,
    }).assignments;

    const gaps = findLegacyCoverageGaps({
      assignments: revoked,
      leagues: [],
      teams: [{ id: 'team_1', adminUserIds: ['user_1'] }],
      teamAssignments: [],
      now: NOW,
    });

    // Revoked canonically but still in the array: this is the operator whose access the
    // cutover is supposed to remove, so it must surface rather than look covered.
    expect(gaps).toHaveLength(1);
  });
});
