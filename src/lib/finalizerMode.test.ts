import { describe, expect, it } from 'vitest';
import {
  decideFinalization,
  parseCanaryAllowlist,
  resolveFinalizerMode,
} from '../../functions/src/finalizerMode';

/**
 * The staged rollout of the finalizer, tested without deploying.
 *
 * Run from the application suite because the module is pure and has no
 * firebase-functions runtime dependency beyond a parameter definition.
 */

describe('resolveFinalizerMode', () => {
  it('accepts the two active modes', () => {
    expect(resolveFinalizerMode('canary')).toBe('canary');
    expect(resolveFinalizerMode('enabled')).toBe('enabled');
  });

  it.each([undefined, '', 'ENABLED', 'on', 'true', 'yes', 'enable'])(
    'falls back to off for %p',
    (value) => {
      // A typo in configuration must not grant authority over official records.
      expect(resolveFinalizerMode(value)).toBe('off');
    },
  );
});

describe('parseCanaryAllowlist', () => {
  it('parses a comma-separated list and trims entries', () => {
    expect(parseCanaryAllowlist(' a , b ,c ')).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty list when unset', () => {
    expect(parseCanaryAllowlist(undefined)).toEqual([]);
    expect(parseCanaryAllowlist('')).toEqual([]);
  });
});

describe('decideFinalization', () => {
  it('writes nothing when the finalizer is off', () => {
    const decision = decideFinalization({ submissionId: 'match_1', mode: 'off', canaryAllowlist: ['match_1'] });

    // Off outranks the allowlist: a deployment that is meant to be inert stays inert.
    expect(decision).toEqual({ proceed: false, mode: 'off', reason: 'finalizer_off' });
  });

  it('processes only allowlisted submissions in canary mode', () => {
    expect(decideFinalization({
      submissionId: 'match_canary',
      mode: 'canary',
      canaryAllowlist: ['match_canary'],
    }).proceed).toBe(true);

    expect(decideFinalization({
      submissionId: 'match_other',
      mode: 'canary',
      canaryAllowlist: ['match_canary'],
    })).toEqual({ proceed: false, mode: 'canary', reason: 'not_in_canary_allowlist' });
  });

  it('processes nothing in canary mode with an empty allowlist', () => {
    expect(decideFinalization({
      submissionId: 'match_1',
      mode: 'canary',
      canaryAllowlist: [],
    }).proceed).toBe(false);
  });

  it('processes every submission once enabled', () => {
    expect(decideFinalization({
      submissionId: 'anything',
      mode: 'enabled',
      canaryAllowlist: [],
    }).proceed).toBe(true);
  });
});
