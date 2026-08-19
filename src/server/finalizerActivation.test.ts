import { describe, expect, it } from 'vitest';
import {
  activationFromEnvironment,
  decideFinalization,
  parseCanaryAllowlist,
  resolveFinalizerMode,
} from './finalizerActivation';

/**
 * The gate used to live in the Cloud Functions handler, so exactly one of four callers
 * honoured it. The scheduled sweeper, the League correction route and the authenticated
 * /finalize endpoint each reached the finalizer directly — and that endpoint is deployed.
 *
 * These cover the decision itself; `finalizerActivation.gate.test.ts` covers the binding
 * to the finalization path.
 */
describe('finalizer activation', () => {
  it('treats an unset or unrecognised mode as off', () => {
    // A typo must never grant authority over official records.
    expect(resolveFinalizerMode(undefined)).toBe('off');
    expect(resolveFinalizerMode('')).toBe('off');
    expect(resolveFinalizerMode('ENABLED')).toBe('off');
    expect(resolveFinalizerMode('enabled ')).toBe('off');
    expect(resolveFinalizerMode('on')).toBe('off');
  });

  it('accepts only the three operational states', () => {
    expect(resolveFinalizerMode('off')).toBe('off');
    expect(resolveFinalizerMode('canary')).toBe('canary');
    expect(resolveFinalizerMode('enabled')).toBe('enabled');
  });

  it('parses an allowlist and ignores blanks', () => {
    expect(parseCanaryAllowlist(' a , b ,, c ')).toEqual(['a', 'b', 'c']);
    expect(parseCanaryAllowlist(undefined)).toEqual([]);
    expect(parseCanaryAllowlist('')).toEqual([]);
  });

  it('refuses everything while off', () => {
    expect(decideFinalization({ submissionId: 'm1', mode: 'off', canaryAllowlist: ['m1'] }))
      .toEqual({ proceed: false, mode: 'off', reason: 'finalizer_off' });
  });

  it('permits only allowlisted submissions in canary', () => {
    expect(decideFinalization({ submissionId: 'm1', mode: 'canary', canaryAllowlist: ['m1'] }).proceed).toBe(true);
    expect(decideFinalization({ submissionId: 'm2', mode: 'canary', canaryAllowlist: ['m1'] }))
      .toEqual({ proceed: false, mode: 'canary', reason: 'not_in_canary_allowlist' });
    // An empty allowlist in canary is the provably inert state.
    expect(decideFinalization({ submissionId: 'm1', mode: 'canary', canaryAllowlist: [] }).proceed).toBe(false);
  });

  it('permits everything while enabled', () => {
    expect(decideFinalization({ submissionId: 'anything', mode: 'enabled', canaryAllowlist: [] }).proceed).toBe(true);
  });

  it('reads the App Hosting runtime configuration, defaulting closed', () => {
    // Both runtimes read the same two names so the switch means one thing everywhere.
    expect(activationFromEnvironment({} as NodeJS.ProcessEnv)).toEqual({ mode: 'off', canaryAllowlist: [] });
    expect(activationFromEnvironment({
      GOALPLACE_FINALIZER_MODE: 'canary',
      GOALPLACE_FINALIZER_CANARY_SUBMISSION_IDS: 'match_1, match_2',
    } as NodeJS.ProcessEnv)).toEqual({ mode: 'canary', canaryAllowlist: ['match_1', 'match_2'] });
  });
});
