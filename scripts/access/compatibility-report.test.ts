import { describe, expect, it } from 'vitest';
import { buildAccessCompatibilityReport } from './compatibility-report';

const baseUser = {
  id: 'operator_1',
  email: 'operator@example.com',
  role: 'team_admin',
  accountClass: 'organization_operator',
  accessVersion: 1,
};

const baseAssignment = {
  id: 'assignment_1',
  userId: 'operator_1',
  roleKey: 'team_admin',
  scopeType: 'team',
  scopeId: 'team_1',
  permissionBundleId: 'full_team_admin',
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
    id: 'team_team_1_operator_1',
    userId: 'operator_1',
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
        activeRoles: ['result_reporter'],
        capabilities: ['team.result.submit'],
      }],
    }, { now });

    expect(report.blockers).toBe(1);
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
