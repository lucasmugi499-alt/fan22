import { defineString } from 'firebase-functions/params';
import {
  ACTIVATION_VARIABLES,
  parseCanaryAllowlist,
  resolveFinalizerMode,
  type FinalizationSource,
  type FinalizerActivation,
} from '../../src/server/finalizerActivation';

/**
 * The Cloud Functions half of the finalizer activation switch.
 *
 * The decision logic and the mode vocabulary live in
 * `src/server/finalizerActivation.ts`, shared with App Hosting, because the gate binds to
 * the finalization path rather than to one runtime. Only the parameter binding is here:
 * `defineString` is a Functions deployment concern and cannot be read from App Hosting.
 *
 * The allowlist is read from trusted function configuration, never from a field on the
 * report or submission itself: a client-writable marker would let a team opt its own result
 * into finalization, which makes the device that produced the claim part of the authority
 * that publishes it.
 *
 * One binding per source. `defineString` is a deployment-time declaration and cannot be
 * built from a loop over the catalogue without losing the literal names Firebase needs to
 * see, so the three pairs are written out.
 */

export type { FinalizerActivation, FinalizerMode, FinalizerDecision, FinalizationSource } from '../../src/server/finalizerActivation';
export { decideFinalization, parseCanaryAllowlist, resolveFinalizerMode } from '../../src/server/finalizerActivation';

const legacyModeParam = defineString(ACTIVATION_VARIABLES.legacy_submission.mode, {
  default: 'off',
  description: 'Bilateral V1 submission finalizer activation: off, canary, or enabled.',
});

const legacyCanaryParam = defineString(ACTIVATION_VARIABLES.legacy_submission.canaryIds, {
  default: '',
  description: 'Comma-separated submission ids the V1 finalizer may process in canary mode.',
});

const fieldCaptureModeParam = defineString(ACTIVATION_VARIABLES.field_capture.mode, {
  default: 'off',
  description: 'Field capture finalizer activation: off, canary, or enabled.',
});

const fieldCaptureCanaryParam = defineString(ACTIVATION_VARIABLES.field_capture.canaryIds, {
  default: '',
  description: 'Comma-separated match ids field capture may finalize in canary mode.',
});

const leagueEntryModeParam = defineString(ACTIVATION_VARIABLES.league_post_match.mode, {
  default: 'off',
  description: 'League post-match entry finalizer activation: off, canary, or enabled.',
});

const leagueEntryCanaryParam = defineString(ACTIVATION_VARIABLES.league_post_match.canaryIds, {
  default: '',
  description: 'Comma-separated match ids league post-match entry may finalize in canary mode.',
});

const PARAMS: Record<FinalizationSource, { mode: () => string; canaryIds: () => string }> = {
  legacy_submission: {
    mode: () => legacyModeParam.value(),
    canaryIds: () => legacyCanaryParam.value(),
  },
  field_capture: {
    mode: () => fieldCaptureModeParam.value(),
    canaryIds: () => fieldCaptureCanaryParam.value(),
  },
  league_post_match: {
    mode: () => leagueEntryModeParam.value(),
    canaryIds: () => leagueEntryCanaryParam.value(),
  },
};

/**
 * Reads the live configuration for one source. Call inside a handler, never at module load:
 * a param read at load time is evaluated during analysis, not at runtime.
 */
export function currentActivationFor(source: FinalizationSource): FinalizerActivation {
  const param = PARAMS[source];
  return {
    mode: resolveFinalizerMode(param.mode()),
    canaryAllowlist: parseCanaryAllowlist(param.canaryIds()),
  };
}

/**
 * The bilateral V1 activation, kept under its original name because the scheduled
 * reconciliation sweep and the submission trigger both mean this one specifically.
 */
export function currentFinalizerActivation(): FinalizerActivation {
  return currentActivationFor('legacy_submission');
}
