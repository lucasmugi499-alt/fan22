import { describe, expect, it } from 'vitest';
import { checkTeamSunsetInvariants } from './team-sunset-invariants';

const clean = { indexes: [], invitations: [], submissions: [] };

describe('post-sunset invariants', () => {
  it('holds on a fully migrated platform', () => {
    expect(checkTeamSunsetInvariants(clean)).toEqual([]);
  });

  /**
   * The one that actually protects something. Changing the capability catalogue does not
   * rewrite already-materialized projections, so until this reads zero the retirement has
   * happened in the code and not in the database.
   */
  it('catches a projection that still grants retired authority', () => {
    const violations = checkTeamSunsetInvariants({
      ...clean,
      indexes: [{ id: 'team_team_1_user_1', scopeType: 'team', capabilities: ['team.result.submit'] }],
    });

    expect(violations).toHaveLength(1);
    expect(violations[0].invariant).toBe('no team capabilities in live access indexes');
  });

  it('catches an invitation somebody could still accept', () => {
    const violations = checkTeamSunsetInvariants({
      ...clean,
      invitations: [{ id: 'i1', scopeType: 'team', status: 'sent' }],
    });

    expect(violations[0].invariant).toBe('no issuable Team Admin invitations');
  });

  it('catches a claim still waiting on a team that can no longer answer', () => {
    const violations = checkTeamSunsetInvariants({
      ...clean,
      submissions: [{ id: 'm1', status: 'pending_confirmation' }],
    });

    expect(violations[0].invariant).toBe('no V1 workflow awaiting a team');
  });

  /**
   * Retire authority, preserve history. A check that demanded zero team assignments would be
   * demanding the deletion of the records that make hundreds of historical submissions
   * interpretable.
   */
  it('permits everything historical to remain', () => {
    const violations = checkTeamSunsetInvariants({
      // A team projection with no capabilities: the assignment is remembered, the authority is
      // gone, and that is the end state rather than a violation.
      indexes: [{ id: 'team_team_1_user_1', scopeType: 'team', capabilities: [] }],
      invitations: [
        { id: 'i1', scopeType: 'team', status: 'accepted' },
        { id: 'i2', scopeType: 'team', status: 'revoked' },
      ],
      submissions: [
        { id: 'm1', status: 'official' },
        { id: 'm2', status: 'withdrawn' },
        { id: 'm3', status: 'disputed' },
      ],
    });

    expect(violations).toEqual([]);
  });

  it('reports every violation rather than stopping at the first', () => {
    const violations = checkTeamSunsetInvariants({
      indexes: [{ id: 'i', scopeType: 'team', capabilities: ['team.roster.manage'] }],
      invitations: [{ id: 'v', scopeType: 'team', status: 'sent' }],
      submissions: [{ id: 'm', status: 'confirmation_overdue' }],
    });

    // An operator fixing these wants the whole list, not one at a time across three runs.
    expect(violations).toHaveLength(3);
  });
});
