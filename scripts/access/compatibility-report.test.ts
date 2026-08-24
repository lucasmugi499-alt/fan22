import { describe, expect, it } from 'vitest';
import { LEAGUE_ADMIN_CAPABILITIES } from '../../src/lib/auth/access';
import { buildAccessCompatibilityReport } from './compatibility-report';

const baseUser = {
  id: 'operator_1',
  email: 'operator@example.com',
  role: 'team_admin',
  accountClass: 'organization_operator',
  accessVersion: 1,
};

/**
 * A league assignment rather than the team one this used to use.
 *
 * ADR-004 versioned every team bundle to zero capabilities, so a team fixture now projects
 * an empty array and the "matching assignment and projection" case would pass trivially,
 * proving nothing about whether the report can match anything at all. The sunset itself is
 * asserted below, where it belongs.
 */
const baseAssignment = {
  id: 'assignment_1',
  userId: 'operator_1',
  roleKey: 'league_admin',
  scopeType: 'league',
  scopeId: 'league_1',
  permissionBundleId: 'league_admin',
  status: 'active',
  grantedByUserId: 'league_admin_1',
  validFrom: '2026-07-30T00:00:00.000Z',
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
};

const baseDataset = {
  source: 'test',
  users: [baseUser],
  leagues: [{ id: 'league_1' }],
  teams: [{ id: 'team_1', leagueId: 'league_1' }],
  athletes: [{ id: 'athlete_1' }],
  assignments: [baseAssignment],
  indexes: [{
    id: 'league_league_1_operator_1',
    userId: 'operator_1',
    scopeType: 'league',
    scopeId: 'league_1',
    activeRoles: ['league_admin'],
    capabilities: [...LEAGUE_ADMIN_CAPABILITIES].sort(),
    assignmentIds: ['assignment_1'],
    accessVersion: 1,
    updatedAt: '2026-07-30T00:00:00.000Z',
  }],
};

const now = new Date('2026-07-30T12:00:00.000Z');

describe('access compatibility report', () => {
  it('accepts a matching organization operator assignment and projection', () => {
    const report = buildAccessCompatibilityReport(baseDataset, { now });

    expect(report.blockers).toBe(0);
    expect(report.issueCounts).toEqual({});
  });

  it('blocks operator assignments on Fan accounts', () => {
    const report = buildAccessCompatibilityReport({
      ...baseDataset,
      users: [{ ...baseUser, role: 'fan', accountClass: 'fan' }],
    }, { now });

    expect(report.blockers).toBe(1);
    expect(report.issueCounts.assignment_account_class_mismatch).toBe(1);
  });

  it('blocks platform operators holding organization assignments', () => {
    const report = buildAccessCompatibilityReport({
      ...baseDataset,
      users: [{ ...baseUser, role: 'platform_admin', accountClass: 'platform_operator' }],
    }, { now });

    expect(report.blockers).toBe(1);
    expect(report.issueCounts.assignment_account_class_mismatch).toBe(1);
  });

  it('blocks stale access indexes that diverge from assignment projections', () => {
    const report = buildAccessCompatibilityReport({
      ...baseDataset,
      indexes: [{
        ...baseDataset.indexes[0],
        activeRoles: ['league_owner'],
        capabilities: ['league.result.resolve'],
      }],
    }, { now });

    expect(report.blockers).toBe(1);
    expect(report.issueCounts.access_index_projection_mismatch).toBe(1);
  });

  /**
   * The Team Admin sunset, seen from the tool that has to notice it.
   *
   * Every stored team index carries the capabilities its bundle granted before ADR-004
   * versioned that bundle to zero. Until the projections are rebuilt, each one diverges from
   * what its assignment now justifies, and this report is what says so. It is the map of
   * exactly who is affected, which is why the drift is a blocker rather than a warning: it
   * must be resolved by rebuilding, not tolerated.
   */
  it('flags every stored team index as diverged once the bundles are zeroed', () => {
    const report = buildAccessCompatibilityReport({
      ...baseDataset,
      assignments: [{
        ...baseAssignment,
        roleKey: 'team_admin',
        scopeType: 'team',
        scopeId: 'team_1',
        permissionBundleId: 'full_team_admin',
      }],
      indexes: [{
        ...baseDataset.indexes[0],
        id: 'team_team_1_operator_1',
        scopeType: 'team',
        scopeId: 'team_1',
        activeRoles: ['team_admin'],
        capabilities: ['team.roster.manage', 'team.result.submit'],
      }],
    }, { now });

    expect(report.issueCounts.access_index_projection_mismatch).toBe(1);
  });

  it('reports migration residue as warnings for legacy principals without assignments', () => {
    const report = buildAccessCompatibilityReport({
      ...baseDataset,
      users: [{ id: 'league_admin_1', role: 'league_admin', email: 'league@example.com' }],
      assignments: [],
      indexes: [],
    }, { now });

    expect(report.blockers).toBe(0);
    expect(report.warnings).toBe(3);
    expect(report.issueCounts.missing_account_class).toBe(1);
    expect(report.issueCounts.operator_missing_access_version).toBe(1);
    expect(report.issueCounts.legacy_principal_without_assignment).toBe(1);
  });
});
