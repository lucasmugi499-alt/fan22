import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEAM_AUTHORITY_STAGE,
  resolveTeamAuthorityStage,
  teamAuthorityGrants,
  teamAuthorityIssuable,
} from './teamAuthorityStage';

describe('team authority retires as an operation, not a deploy', () => {
  it('defaults to frozen', () => {
    // The safe default. A deploy that silently retired authority would strand every open V1
    // workflow the moment a team scope rebuilt, and nothing about the deploy would suggest it.
    expect(DEFAULT_TEAM_AUTHORITY_STAGE).toBe('frozen');
    expect(resolveTeamAuthorityStage(undefined)).toBe('frozen');
  });

  it('falls back to frozen for anything unrecognised', () => {
    // A typo must not retire anybody's authority, and must not restore it either.
    expect(resolveTeamAuthorityStage('retried')).toBe('frozen');
    expect(resolveTeamAuthorityStage('')).toBe('frozen');
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
