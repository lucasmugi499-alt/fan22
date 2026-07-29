import { describe, expect, it } from 'vitest';
import {
  challengeNextStatus,
  challengeActionMatchesFundingModel,
  challengeLifecycleLabel,
  challengeTermsAreLocked,
  roleCanTransitionChallenge,
} from './challenge';

describe('challenge lifecycle', () => {
  it('requires team approval before league approval', () => {
    expect(challengeNextStatus('proposed', 'team_approve')).toBe('team_approved');
    expect(() => challengeNextStatus('proposed', 'league_approve')).toThrow();
  });

  it('separates operational roles', () => {
    expect(roleCanTransitionChallenge('athlete', 'team_approve')).toBe(false);
    expect(roleCanTransitionChallenge('team_admin', 'team_approve')).toBe(true);
    expect(roleCanTransitionChallenge('team_admin', 'mark_achieved')).toBe(false);
    expect(roleCanTransitionChallenge('league_admin', 'mark_achieved')).toBe(true);
    expect(roleCanTransitionChallenge('league_admin', 'settle')).toBe(false);
  });

  it('locks terms once funding opens', () => {
    expect(challengeTermsAreLocked('league_approved')).toBe(false);
    expect(challengeTermsAreLocked('funding_open')).toBe(true);
  });

  it('splits non-cash milestones from grant settlement language', () => {
    expect(challengeActionMatchesFundingModel('non_cash', 'activate_non_cash')).toBe(true);
    expect(challengeActionMatchesFundingModel('non_cash', 'prepare_allocation')).toBe(false);
    expect(challengeLifecycleLabel('non_cash', 'settled')).toBe('Closed');
    expect(challengeLifecycleLabel('sponsor_grant', 'settled')).toBe('Paid');
  });
});
