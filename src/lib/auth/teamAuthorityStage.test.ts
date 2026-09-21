import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEAM_AUTHORITY_STAGE,
  resolveTeamAuthorityStage,
  teamAuthorityGrants,
  teamAuthorityIssuable,
} from './teamAuthorityStage';

describe('team authority retires as an operation, not a deploy', () => {
  it('defaults to retired now that the drain is finished', () => {
    /*
     * This was `frozen`, and rightly, while V1 workflows were draining: an environment that
     * forgot the variable kept them alive rather than stranding them. The drain is done and
     * every deployed environment sets `retired`, so the fail-closed direction has flipped. A
     * local server without the variable rebuilt a team scope under `frozen` and wrote the
     * retired bundle's capabilities into the live database. Forget the variable: grant less.
     */
    expect(DEFAULT_TEAM_AUTHORITY_STAGE).toBe('retired');
    expect(resolveTeamAuthorityStage(undefined)).toBe('retired');
  });

  it('falls back to retired for anything unrecognised', () => {
    // A typo must not restore anybody's authority, which is now the direction a typo could go.
    expect(resolveTeamAuthorityStage('retried')).toBe('retired');
    expect(resolveTeamAuthorityStage('')).toBe('retired');
  });

  it('still reaches the drain stages by name', () => {
    // For the tests that prove the drain logic, and for an environment that genuinely has not
    // drained. Nothing reaches them by omission any more.
    expect(resolveTeamAuthorityStage('active')).toBe('active');
    expect(resolveTeamAuthorityStage('frozen')).toBe('frozen');
  });

  it('separates freezing issuance from retiring authority', () => {
    // The window the drain needs: stop handing this out, let the people who have it finish.
    expect(teamAuthorityIssuable('active')).toBe(true);
    expect(teamAuthorityGrants('active')).toBe(true);

    expect(teamAuthorityIssuable('frozen')).toBe(false);
    expect(teamAuthorityGrants('frozen')).toBe(true);

    expect(teamAuthorityIssuable('retired')).toBe(false);
    expect(teamAuthorityGrants('retired')).toBe(false);
  });

  it('never lets authority come back once retired', () => {
    // Not enforced by a state machine here, and worth asserting anyway: `retired` is the only
    // stage in which the bundles grant nothing, so there is no value that grants MORE than
    // active and none that grants some subset.
    const stages = ['active', 'frozen', 'retired'] as const;
    const granting = stages.filter(teamAuthorityGrants);

    expect(granting).toEqual(['active', 'frozen']);
  });
});
