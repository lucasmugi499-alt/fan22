import { defineString } from 'firebase-functions/params';
import {
  parseCanaryAllowlist,
  resolveFinalizerMode,
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
 * submission itself: a client-writable marker would let a team opt its own result into
 * finalization.
 */

export type { FinalizerActivation, FinalizerMode, FinalizerDecision } from '../../src/server/finalizerActivation';
export { decideFinalization, parseCanaryAllowlist, resolveFinalizerMode } from '../../src/server/finalizerActivation';

const modeParam = defineString('GOALPLACE_FINALIZER_MODE', {
  default: 'off',
  description: 'Result finalizer activation: off, canary, or enabled.',
});

const canaryIdsParam = defineString('GOALPLACE_FINALIZER_CANARY_SUBMISSION_IDS', {
  default: '',
  description: 'Comma-separated submission ids the finalizer may process in canary mode.',
});

/** Reads the live configuration. Call inside a handler, never at module load. */
export function currentFinalizerActivation(): FinalizerActivation {
  return {
    mode: resolveFinalizerMode(modeParam.value()),
    canaryAllowlist: parseCanaryAllowlist(canaryIdsParam.value()),
  };
}
