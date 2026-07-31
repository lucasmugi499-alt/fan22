import { describe, expect, it } from 'vitest';
import type { AccessContext } from '@/lib/auth/access';
import type { Team, UserProfile } from '@/types';
import { resolveMyTeam } from './teamContext';

const profile = { id: 'user_1', uid: 'user_1' } as UserProfile;
const teams = [
  { id: 'team_a', name: 'A', adminUserIds: [] },
  { id: 'team_b', name: 'B', adminUserIds: ['other_user'] },
] as Team[];

function accessContext(teamId: string): AccessContext {
  return {
    userId: 'user_1',
    accessVersion: 1,
    indexes: [{
      userId: 'user_1',
      scopeType: 'team',
      scopeId: teamId,
      activeRoles: ['team_admin'],
      capabilities: ['team.profile.manage'],
      assignmentIds: ['assignment_1'],
      accessVersion: 1,
      updatedAt: '2026-07-31T00:00:00.000Z',
    }],
  };
}

describe('resolveMyTeam', () => {
  it('uses scoped team assignments when legacy admin arrays are empty', () => {
    expect(resolveMyTeam(profile, teams, [], false, accessContext('team_a'))?.id).toBe('team_a');
  });

  it('does not open an unrelated team for a real unassigned account', () => {
    expect(resolveMyTeam(profile, teams, [], false, accessContext('team_missing'))).toBeNull();
  });
});
