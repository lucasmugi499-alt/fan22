import { describe, expect, it } from 'vitest';
import { planWorkflowMigration } from './migrate-v1-workflow';

describe('migrating a stranded V1 workflow', () => {
  it.each(['pending_confirmation', 'confirmation_overdue'])('migrates a %s claim to league resolution', (status) => {
    expect(planWorkflowMigration({ status })).toEqual({ ok: true, from: status, to: 'disputed' });
  });

  /**
   * `disputed` rather than a new state, because the league's resolver already knows how to
   * settle one, and the honest description of an unanswered claim a league must now decide is
   * a dispute.
   */
  it('routes into the workflow the league already has', () => {
    const verdict = planWorkflowMigration({ status: 'pending_confirmation' });

    expect(verdict.ok === true && verdict.to).toBe('disputed');
  });

  it.each(['confirmed', 'disputed', 'official', 'withdrawn', 'rejected'])(
    'refuses a %s claim, which is not waiting on a team',
    (status) => {
      // Migrating one of these would convert a settled or already-league-owned claim into a
      // dispute nobody raised.
      expect(planWorkflowMigration({ status }).ok).toBe(false);
    },
  );

  it('refuses when there is no claim at all', () => {
    expect(planWorkflowMigration(undefined)).toEqual({
      ok: false,
      reason: 'No submission for that match.',
    });
  });
});
