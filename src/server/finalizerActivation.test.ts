import { describe, expect, it } from 'vitest';
import {
  ACTIVATION_VARIABLES,
  activationForSource,
  activationFromEnvironment,
  activationSourceForReport,
  decideFinalization,
  parseCanaryAllowlist,
  resolveFinalizerMode,
  type FinalizationSource,
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

/**
 * The gate split.
 *
 * Until 2026-08-26 one `GOALPLACE_FINALIZER_MODE` governed all three intake paths. It was
 * `enabled` on demo because the bilateral V1 finalizer had been cloud-verified there since
 * August — and the same word therefore armed a field capture pipeline that had never once
 * run against real data. The first ordinary field report anybody wrote would have become an
 * official result, with standings, athlete projections and Fantasy points behind it.
 *
 * These tests exist to keep the two facts the split establishes: each source reads its own
 * variable, and no source inherits authority from another.
 */
describe('per-source activation', () => {
  const ALL_SOURCES: FinalizationSource[] = ['legacy_submission', 'field_capture', 'league_post_match'];

  it('binds each source to its own pair of variables', () => {
    // Named literally rather than derived, so renaming a variable in the catalogue without
    // updating every runbook, apphosting.yaml and Functions .env fails here first.
    expect(ACTIVATION_VARIABLES).toEqual({
      legacy_submission: {
        mode: 'GOALPLACE_FINALIZER_MODE',
        canaryIds: 'GOALPLACE_FINALIZER_CANARY_SUBMISSION_IDS',
      },
      field_capture: {
        mode: 'GOALPLACE_FIELD_CAPTURE_MODE',
        canaryIds: 'GOALPLACE_FIELD_CAPTURE_CANARY_MATCH_IDS',
      },
      league_post_match: {
        mode: 'GOALPLACE_LEAGUE_ENTRY_MODE',
        canaryIds: 'GOALPLACE_LEAGUE_ENTRY_CANARY_MATCH_IDS',
      },
    });
  });

  it('gives every source a distinct variable name', () => {
    // Two sources sharing a name would be the old single switch wearing three labels, and
    // would pass every other test in this file.
    const names = ALL_SOURCES.flatMap((source) => [
      ACTIVATION_VARIABLES[source].mode,
      ACTIVATION_VARIABLES[source].canaryIds,
    ]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('resolves every source to off when nothing is set', () => {
    for (const source of ALL_SOURCES) {
      expect(activationForSource(source, {} as NodeJS.ProcessEnv))
        .toEqual({ mode: 'off', canaryAllowlist: [] });
    }
  });

  it('does not let the legacy switch arm field capture or league entry', () => {
    // The exact demo configuration on 2026-08-26, and the whole reason for the split.
    const demo = {
      GOALPLACE_FINALIZER_MODE: 'enabled',
      GOALPLACE_FINALIZER_CANARY_SUBMISSION_IDS: '',
    } as NodeJS.ProcessEnv;

    expect(activationForSource('legacy_submission', demo).mode).toBe('enabled');
    expect(activationForSource('field_capture', demo).mode).toBe('off');
    expect(activationForSource('league_post_match', demo).mode).toBe('off');
  });

  it('does not let field capture arm the legacy path either', () => {
    // The inverse is not symmetry for its own sake: enabling a new source must never widen
    // authority over the workflow that is mid-drain.
    const env = {
      GOALPLACE_FIELD_CAPTURE_MODE: 'enabled',
      GOALPLACE_LEAGUE_ENTRY_MODE: 'enabled',
    } as NodeJS.ProcessEnv;
    expect(activationForSource('legacy_submission', env).mode).toBe('off');
  });

  it('reads each source allowlist independently', () => {
    const env = {
      GOALPLACE_FINALIZER_MODE: 'enabled',
      GOALPLACE_FIELD_CAPTURE_MODE: 'canary',
      GOALPLACE_FIELD_CAPTURE_CANARY_MATCH_IDS: 'match_canary_001',
      GOALPLACE_LEAGUE_ENTRY_MODE: 'canary',
      GOALPLACE_LEAGUE_ENTRY_CANARY_MATCH_IDS: '',
    } as NodeJS.ProcessEnv;

    const field = activationForSource('field_capture', env);
    expect(field).toEqual({ mode: 'canary', canaryAllowlist: ['match_canary_001'] });
    // The canary fixture is not admitted to the source it does not belong to.
    expect(decideFinalization({
      submissionId: 'match_canary_001',
      ...activationForSource('league_post_match', env),
    }).proceed).toBe(false);
    expect(decideFinalization({ submissionId: 'match_canary_001', ...field }).proceed).toBe(true);
    expect(decideFinalization({ submissionId: 'match_other', ...field }).proceed).toBe(false);
  });

  it('keeps activationFromEnvironment meaning the legacy path', () => {
    // App Hosting reaches the finalizer only through the correction and /finalize routes,
    // and both are bilateral-submission routes.
    const env = { GOALPLACE_FINALIZER_MODE: 'canary', GOALPLACE_FIELD_CAPTURE_MODE: 'enabled' } as NodeJS.ProcessEnv;
    expect(activationFromEnvironment(env)).toEqual(activationForSource('legacy_submission', env));
  });

  it('narrows a report source rather than trusting it', () => {
    expect(activationSourceForReport('league_post_match')).toBe('league_post_match');
    expect(activationSourceForReport('field_capture')).toBe('field_capture');
    // A client-written value that is anything else lands on field capture. It must never be
    // able to select the gate that happens to be open.
    expect(activationSourceForReport(undefined)).toBe('field_capture');
    expect(activationSourceForReport('')).toBe('field_capture');
    expect(activationSourceForReport('LEAGUE_POST_MATCH')).toBe('field_capture');
    expect(activationSourceForReport({ source: 'league_post_match' })).toBe('field_capture');
  });
});
