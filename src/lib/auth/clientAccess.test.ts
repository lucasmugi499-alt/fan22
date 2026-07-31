import { describe, expect, it } from 'vitest';
import type { AccessContext, AccessIndexDocument } from './access';
import { resolveEffectiveRole, roleFromAccessContext, scopedIdsForAccess } from './clientAccess';

function context(indexes: Partial<AccessIndexDocument>[]): AccessContext {
  return {
    userId: 'user_1',
    accessVersion: 1,
    indexes: indexes.map((index, position) => ({
      userId: 'user_1',
      scopeType: 'team',
      scopeId: `scope_${position}`,
      activeRoles: ['team_admin'],
      capabilities: [],
      assignmentIds: [`assignment_${position}`],
      accessVersion: 1,
      updatedAt: '2026-07-31T00:00:00.000Z',
      ...index,
    })),
  };
}

describe('client scoped access helpers', () => {
  it('derives the highest workspace role from active scoped assignments', () => {
    expect(roleFromAccessContext(context([
      { scopeType: 'athlete', activeRoles: ['athlete_self'] },
      { scopeType: 'team', activeRoles: ['team_admin'] },
      { scopeType: 'league', activeRoles: ['league_owner'] },
    ]))).toBe('league_admin');

    expect(roleFromAccessContext(context([
      { scopeType: 'athlete', activeRoles: ['athlete_self'] },
    ]))).toBe('athlete');
  });

  it('preserves platform account roles over lower scoped workspaces', () => {
    expect(resolveEffectiveRole('platform_admin', context([
      { scopeType: 'league', activeRoles: ['league_owner'] },
    ]))).toBe('platform_admin');
  });

  it('falls back from a fan account to scoped operational access', () => {
    expect(resolveEffectiveRole('fan', context([
      { scopeType: 'team', activeRoles: ['roster_manager'] },
    ]))).toBe('team_admin');
  });

  it('returns scoped IDs by type and capability', () => {
    const ids = scopedIdsForAccess(context([
      { scopeType: 'team', scopeId: 'team_a', capabilities: ['team.athlete.create'] },
      { scopeType: 'team', scopeId: 'team_b', capabilities: ['team.result.submit'] },
      { scopeType: 'league', scopeId: 'league_a', capabilities: ['league.team.create'] },
    ]), 'team', 'team.athlete.create');

    expect([...ids]).toEqual(['team_a']);
  });
});
