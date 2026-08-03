import { describe, expect, it } from 'vitest';
import { normalizeAccessAssignment } from '../../src/lib/auth/accessProjection';
import { backfillAssignmentId, planBackfill } from './backfill-assignments';

const NOW = new Date('2026-08-03T12:00:00.000Z');
const NOW_ISO = NOW.toISOString();

function assignment(overrides: Record<string, unknown> = {}) {
  return normalizeAccessAssignment('assignment_1', {
    id: 'assignment_1',
    userId: 'user_1',
    roleKey: 'team_admin',
    scopeType: 'team',
    scopeId: 'team_1',
    permissionBundleId: 'full_team_admin',
    status: 'active',
    grantedByUserId: 'admin_1',
    validFrom: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }, NOW_ISO);
}

const empty = { assignments: [], leagues: [], teams: [], teamAssignments: [], users: [], now: NOW };

describe('access backfill plan', () => {
  it('creates a league_admin assignment for an uncovered adminUserIds entry', () => {
    const plan = planBackfill({
      ...empty,
      leagues: [{ id: 'league_1', adminUserIds: ['user_9'] }],
    });

    expect(plan.assignments).toEqual([{
      id: backfillAssignmentId('league', 'league_1', 'user_9'),
      userId: 'user_9',
      scopeType: 'league',
      scopeId: 'league_1',
      roleKey: 'league_admin',
      permissionBundleId: 'league_admin',
      source: 'adminUserIds',
    }]);
  });

  it('creates nothing for a grant a canonical assignment already covers', () => {
    const plan = planBackfill({
      ...empty,
      assignments: [assignment()],
      teams: [{ id: 'team_1', adminUserIds: ['user_1'] }],
    });

    expect(plan.assignments).toHaveLength(0);
  });

  it('is idempotent: assignment ids are deterministic', () => {
    const input = { ...empty, teams: [{ id: 'team_1', adminUserIds: ['user_9'] }] };
    const first = planBackfill(input);
    const second = planBackfill(input);

    expect(first.assignments[0].id).toBe(second.assignments[0].id);
    expect(first.assignments[0].id).toBe('assignment_migrated_team_team_1_user_9');
  });

  it('re-grants a scope whose only assignment was revoked', () => {
    const plan = planBackfill({
      ...empty,
      assignments: [assignment({ status: 'revoked' })],
      teams: [{ id: 'team_1', adminUserIds: ['user_1'] }],
    });

    // The legacy array still grants access, so the migration must surface it rather than
    // silently drop the operator. Whether that access *should* persist is a separate
    // decision — the backfill preserves the status quo and never revokes.
    expect(plan.assignments).toHaveLength(1);
  });

  it('does not duplicate when the same user is granted by both legacy surfaces', () => {
    const plan = planBackfill({
      ...empty,
      teams: [{ id: 'team_1', adminUserIds: ['user_9'] }],
      teamAssignments: [{ id: 'ta_1', userId: 'user_9', teamId: 'team_1', status: 'active' }],
    });

    expect(plan.assignments).toHaveLength(1);
  });

  it('ignores inactive legacy team assignments', () => {
    const plan = planBackfill({
      ...empty,
      teamAssignments: [{ id: 'ta_1', userId: 'user_9', teamId: 'team_1', status: 'revoked' }],
    });

    expect(plan.assignments).toHaveLength(0);
  });

  it('derives an account class only for users that lack one', () => {
    const plan = planBackfill({
      ...empty,
      users: [
        { id: 'user_1', role: 'league_admin' },
        { id: 'user_2', role: 'fan', accountClass: 'fan' },
        { id: 'user_3', role: 'athlete' },
        { id: 'user_4', role: 'super_admin' },
      ],
    });

    expect(plan.accountClasses).toEqual([
      { userId: 'user_1', role: 'league_admin', accountClass: 'organization_operator' },
      { userId: 'user_3', role: 'athlete', accountClass: 'athlete' },
      { userId: 'user_4', role: 'super_admin', accountClass: 'platform_operator' },
    ]);
  });

  it('defaults a user with no role to fan rather than an operator class', () => {
    const plan = planBackfill({ ...empty, users: [{ id: 'user_1' }] });

    expect(plan.accountClasses[0].accountClass).toBe('fan');
  });

  it('mirrors a platform role into a canonical platform-scope assignment', () => {
    const plan = planBackfill({
      ...empty,
      users: [{ id: 'user_1', role: 'super_admin', accountClass: 'platform_operator' }],
    });

    // Grants nothing the role claim does not already allow; it is what lets the coarse
    // role bypass be replaced with a real capability check later.
    expect(plan.assignments).toEqual([{
      id: 'assignment_migrated_platform_global_user_1',
      userId: 'user_1',
      scopeType: 'platform',
      scopeId: 'global',
      roleKey: 'super_admin',
      permissionBundleId: 'super_admin_governance',
      source: 'platformRole',
    }]);
  });

  it('does not create a platform assignment for a fan or athlete', () => {
    const plan = planBackfill({
      ...empty,
      users: [
        { id: 'user_1', role: 'fan', accountClass: 'fan' },
        { id: 'user_2', role: 'athlete', accountClass: 'athlete' },
      ],
    });

    expect(plan.assignments).toHaveLength(0);
  });

  it('assigns accessVersion to operators but not to fans', () => {
    const plan = planBackfill({
      ...empty,
      users: [
        { id: 'op_1', role: 'league_admin', accountClass: 'organization_operator' },
        { id: 'fan_1', role: 'fan', accountClass: 'fan' },
        { id: 'op_2', role: 'team_admin', accountClass: 'organization_operator', accessVersion: 4 },
      ],
    });

    expect(plan.accessVersions).toEqual(['op_1']);
  });
});
