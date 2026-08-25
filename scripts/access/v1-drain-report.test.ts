import { describe, expect, it } from 'vitest';
import { buildDrainReport } from './v1-drain-report';

describe('V1 drain report', () => {
  it('counts claims the retirement would strand', () => {
    const report = buildDrainReport({
      submissions: [
        { id: 'm1', status: 'pending_confirmation', leagueId: 'league_1' },
        { id: 'm2', status: 'confirmation_overdue', leagueId: 'league_1' },
        { id: 'm3', status: 'official', leagueId: 'league_1' },
      ],
    });

    expect(report.strandedByRetirement.map((row) => row.id)).toEqual(['m1', 'm2']);
    expect(report.byLeague).toEqual({ league_1: 2 });
    expect(report.safeToRetire).toBe(false);
  });

  it('does not block on claims the league can already settle', () => {
    // A disputed claim is the league's to resolve and league capability is untouched by
    // retirement. Blocking on these would make the gate unreachable in any league with a live
    // dispute, which is most of them.
    const report = buildDrainReport({
      submissions: [
        { id: 'm1', status: 'disputed', leagueId: 'league_1' },
        { id: 'm2', status: 'confirmed', leagueId: 'league_1' },
      ],
    });

    expect(report.leagueResolvable).toHaveLength(2);
    expect(report.safeToRetire).toBe(true);
  });

  /**
   * An invitation is work that has not started rather than work in progress, and it still
   * blocks: accepting one after retirement creates an assignment that grants nothing and reads
   * to whoever accepted it as a role they now hold.
   */
  it('blocks on an open team invitation', () => {
    const report = buildDrainReport({
      submissions: [],
      invitations: [{ id: 'invite_1', scopeType: 'team', status: 'sent' }],
    });

    expect(report.totals.pendingTeamInvitations).toBe(1);
    expect(report.safeToRetire).toBe(false);
  });

  it('ignores an invitation that has already been answered', () => {
    const report = buildDrainReport({
      submissions: [],
      invitations: [
        { id: 'i1', scopeType: 'team', status: 'accepted' },
        { id: 'i2', scopeType: 'team', status: 'revoked' },
        { id: 'i3', scopeType: 'league', status: 'sent' },
      ],
    });

    expect(report.totals.pendingTeamInvitations).toBe(0);
    expect(report.safeToRetire).toBe(true);
  });

  /**
   * Counted and reported, and deliberately not a blocker.
   *
   * Requiring zero active team assignments would make the gate unreachable in any league that
   * ever had a Team Admin, because those records are kept forever as history. What must be
   * zero is work that cannot be completed once the authority behind it is gone.
   */
  it('reports active team assignments without blocking on them', () => {
    const report = buildDrainReport({
      submissions: [],
      assignments: [
        { id: 'a1', scopeType: 'team', scopeId: 'team_1', status: 'active' },
        { id: 'a2', scopeType: 'team', scopeId: 'team_2', status: 'revoked' },
        { id: 'a3', scopeType: 'league', scopeId: 'league_1', status: 'active' },
      ],
    });

    expect(report.totals.activeTeamAssignments).toBe(1);
    expect(report.safeToRetire).toBe(true);
  });

  it('is safe on an empty platform', () => {
    expect(buildDrainReport({ submissions: [] }).safeToRetire).toBe(true);
  });

  it('groups stranded claims by league so an operator knows who to call', () => {
    const report = buildDrainReport({
      submissions: [
        { id: 'm1', status: 'pending_confirmation', leagueId: 'league_1' },
        { id: 'm2', status: 'pending_confirmation', leagueId: 'league_2' },
        { id: 'm3', status: 'pending_confirmation', leagueId: 'league_2' },
      ],
    });

    expect(report.byLeague).toEqual({ league_1: 1, league_2: 2 });
  });
});
