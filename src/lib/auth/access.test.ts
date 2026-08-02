import { describe, expect, it } from 'vitest';
import {
  AccessAssignment,
  accessIndexId,
  buildAccessIndexDocuments,
  canConfirmSubmissionInScope,
  canCreateAthleteInScope,
  canInviteTeamAdminInScope,
  canManageLeagueInScope,
  canManageTeamInScope,
  canSubmitResultInScope,
  createAccessContext,
} from './access';

const now = '2026-07-30T12:00:00.000Z';

function assignment(overrides: Partial<AccessAssignment>): AccessAssignment {
  return {
    id: 'assignment_1',
    userId: 'user_1',
    roleKey: 'team_admin',
    scopeType: 'team',
    scopeId: 'team_a',
    permissionBundleId: 'full_team_admin',
    status: 'active',
    grantedByUserId: 'league_admin_1',
    validFrom: '2026-07-30T00:00:00.000Z',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('access assignments and scope-aware authorization', () => {
  it('projects active assignments into deterministic accessIndex documents', () => {
    const indexes = buildAccessIndexDocuments({
      assignments: [
        assignment({ id: 'assignment_2', permissionBundleId: 'results_only', roleKey: 'result_reporter' }),
        assignment({ id: 'assignment_1' }),
        assignment({ id: 'expired', status: 'expired' }),
      ],
      accessVersion: 4,
      updatedAt: now,
    });

    expect(indexes).toHaveLength(1);
    expect(indexes[0]).toMatchObject({
      userId: 'user_1',
      scopeType: 'team',
      scopeId: 'team_a',
      accessVersion: 4,
    });
    expect(indexes[0].assignmentIds).toEqual(['assignment_1', 'assignment_2']);
    expect(indexes[0].capabilities).toContain('team.result.submit');
    expect(accessIndexId('team', 'team_a', 'user_1')).toBe('team_team_a_user_1');
  });

  it('excludes suspended, revoked, expired, and not-yet-valid assignments from projections', () => {
    const indexes = buildAccessIndexDocuments({
      assignments: [
        assignment({ id: 'active_assignment' }),
        assignment({ id: 'suspended_assignment', status: 'suspended', suspendedAt: now }),
        assignment({ id: 'revoked_assignment', status: 'revoked', revokedAt: now }),
        assignment({ id: 'expired_by_status', status: 'expired' }),
        assignment({ id: 'expired_by_time', validUntil: '2026-07-30T11:59:59.000Z' }),
        assignment({ id: 'future_assignment', validFrom: '2026-07-30T12:00:01.000Z' }),
      ],
      accessVersion: 7,
      updatedAt: now,
      now: new Date(now),
    });

    expect(indexes).toHaveLength(1);
    expect(indexes[0].assignmentIds).toEqual(['active_assignment']);
    expect(indexes[0].activeRoles).toEqual(['team_admin']);
  });

  it('does not let a Team Admin manage another team merely by role label', () => {
    const context = createAccessContext({
      userId: 'user_1',
      assignments: [assignment({})],
      updatedAt: now,
      teamLeagueIds: { team_a: 'league_1', team_b: 'league_2' },
    });

    expect(canManageTeamInScope(context, 'team_a')).toBe(true);
    expect(canSubmitResultInScope(context, 'match_1', 'team_a')).toBe(true);
    expect(canConfirmSubmissionInScope(context, 'submission_1', 'team_a')).toBe(true);
    expect(canManageTeamInScope(context, 'team_b')).toBe(false);
    expect(canSubmitResultInScope(context, 'match_2', 'team_b')).toBe(false);
  });

  it('lets a League Admin act only through the league that owns the team', () => {
    const context = createAccessContext({
      userId: 'user_1',
      assignments: [
        assignment({
          id: 'league_assignment',
          roleKey: 'league_admin',
          scopeType: 'league',
          scopeId: 'league_1',
          permissionBundleId: 'league_admin',
        }),
      ],
      updatedAt: now,
      teamLeagueIds: { team_a: 'league_1', team_b: 'league_2' },
    });

    expect(canManageLeagueInScope(context, 'league_1')).toBe(true);
    expect(canManageLeagueInScope(context, 'league_2')).toBe(false);
    expect(canInviteTeamAdminInScope(context, 'team_a')).toBe(true);
    expect(canInviteTeamAdminInScope(context, 'team_b')).toBe(false);
    expect(canCreateAthleteInScope(context, 'team_a')).toBe(true);
  });

  it('lets platform authority satisfy scoped checks only through explicit platform capabilities', () => {
    const context = createAccessContext({
      userId: 'user_1',
      assignments: [
        assignment({
          id: 'platform_assignment',
          roleKey: 'platform_admin',
          scopeType: 'platform',
          scopeId: 'global',
          permissionBundleId: 'platform_admin',
        }),
      ],
      updatedAt: now,
    });

    expect(canManageTeamInScope(context, 'any_team')).toBe(true);
    expect(canManageLeagueInScope(context, 'any_league')).toBe(true);
  });
});
