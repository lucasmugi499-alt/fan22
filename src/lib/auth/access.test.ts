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
  isAccessIndexLive,
  PERMISSION_BUNDLES,
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

describe('athletes are managed profiles, not account holders', () => {
  /**
   * A regression guard on the authority model itself.
   *
   * Restoring profile or media authority to an athlete bundle would be a one-line change
   * that looks generous and quietly reopens self-editing of the public sporting record. The
   * capability names are asserted as strings because the point is that they should not come
   * back under any spelling.
   */
  const athleteBundles = PERMISSION_BUNDLES.filter(
    (bundle) => bundle.roleKey === 'athlete_self' || bundle.roleKey === 'athlete_guardian',
  );

  it('covers both athlete bundles', () => {
    expect(athleteBundles.map((bundle) => bundle.roleKey).sort())
      .toEqual(['athlete_guardian', 'athlete_self']);
  });

  it.each(['athlete.profile.manage', 'athlete.media.manage'])(
    'never grants %s to an athlete or guardian',
    (removed) => {
      for (const bundle of athleteBundles) {
        expect(bundle.capabilities as string[]).not.toContain(removed);
      }
    },
  );

  it('grants an athlete the one thing that is genuinely theirs', () => {
    // Their money. Everything else about them is written by the club that knows them.
    for (const bundle of athleteBundles) {
      expect(bundle.capabilities).toContain('athlete.payee.submit');
    }
  });

  it('never lets a team or league bundle submit payout details', () => {
    // The fraud path this model exists to close: whoever can invent an athlete must not be
    // able to name the account their supporters pay into.
    const clubBundles = PERMISSION_BUNDLES.filter((bundle) =>
      bundle.roleKey.startsWith('team_')
      || bundle.roleKey.startsWith('league_')
      || bundle.roleKey === 'roster_manager'
      || bundle.roleKey === 'result_reporter');
    expect(clubBundles.length).toBeGreaterThan(0);
    for (const bundle of clubBundles) {
      expect(bundle.capabilities as string[]).not.toContain('athlete.payee.submit');
      expect(bundle.capabilities as string[]).not.toContain('platform.payee.verify');
    }
  });

  it('keeps payout verification out of every non-platform bundle', () => {
    const holders = PERMISSION_BUNDLES
      .filter((bundle) => (bundle.capabilities as string[]).includes('platform.payee.verify'))
      .map((bundle) => bundle.roleKey);
    expect(holders.sort()).toEqual(['platform_admin', 'super_admin']);
  });
});

describe('time-limited authority actually expires', () => {
  /**
   * The C1 defect: `validUntil` was evaluated only while the projector ran. A grant that
   * lapsed on Tuesday kept working from Monday's projection until something unrelated
   * rewrote it, so a time-limited assignment could outlive its own expiry indefinitely.
   *
   * The fix carries expiry into the projection so every reader can see it, which is what
   * makes the guarantee independent of any sweeper running.
   */
  const monday = '2026-08-24T12:00:00.000Z';
  const expiry = '2026-08-24T23:59:00.000Z';
  const tuesday = new Date('2026-08-25T09:00:00.000Z');

  function temporaryAssignment(): AccessAssignment {
    return assignment({
      id: 'assignment_temp',
      userId: 'user_temp',
      roleKey: 'team_admin',
      scopeType: 'team',
      scopeId: 'team_x',
      permissionBundleId: 'full_team_admin',
      status: 'active',
      validFrom: '2026-08-20T00:00:00.000Z',
      validUntil: expiry,
    });
  }

  it('stamps the projection with the assignment expiry', () => {
    const [index] = buildAccessIndexDocuments({
      assignments: [temporaryAssignment()],
      accessVersion: 1,
      updatedAt: monday,
    });
    expect(index.capabilities).toContain('team.roster.manage');
    expect(index.expiresAt).toBe(expiry);
    expect(index.expiresAtMillis).toBe(Date.parse(expiry));
  });

  it('stops granting once the expiry passes, without the projector re-running', () => {
    // Monday's document, read on Tuesday. Nothing rebuilt it — that is the whole point.
    const [mondayIndex] = buildAccessIndexDocuments({
      assignments: [temporaryAssignment()],
      accessVersion: 1,
      updatedAt: monday,
    });
    expect(isAccessIndexLive(mondayIndex, new Date(monday))).toBe(true);
    expect(isAccessIndexLive(mondayIndex, tuesday)).toBe(false);
  });

  it('takes the earliest expiry when a scope is held through several assignments', () => {
    // Taking the latest would let a long-lived grant keep a short-lived one's capabilities
    // alive past their expiry — the same defect one level up.
    const longer = assignment({
      id: 'assignment_longer',
      userId: 'user_temp',
      roleKey: 'result_reporter',
      scopeType: 'team',
      scopeId: 'team_x',
      permissionBundleId: 'results_only',
      status: 'active',
      validFrom: '2026-08-20T00:00:00.000Z',
      validUntil: '2026-12-31T23:59:00.000Z',
    });
    const [index] = buildAccessIndexDocuments({
      assignments: [temporaryAssignment(), longer],
      accessVersion: 1,
      updatedAt: monday,
    });
    expect(index.expiresAt).toBe(expiry);
  });

  it('leaves permanent assignments unexpiring', () => {
    const permanent = assignment({
      id: 'assignment_permanent',
      userId: 'user_perm',
      roleKey: 'team_admin',
      scopeType: 'team',
      scopeId: 'team_y',
      permissionBundleId: 'full_team_admin',
      status: 'active',
      validFrom: '2026-08-20T00:00:00.000Z',
    });
    const [index] = buildAccessIndexDocuments({
      assignments: [permanent],
      accessVersion: 1,
      updatedAt: monday,
    });
    expect(index.expiresAtMillis).toBeUndefined();
    expect(isAccessIndexLive(index, new Date('2030-01-01T00:00:00.000Z'))).toBe(true);
  });
});
