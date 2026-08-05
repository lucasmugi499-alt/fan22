import { defineString } from 'firebase-functions/params';

/**
 * Activation control for the trusted result finalizer.
 *
 * The finalizer writes official sporting records — official results, canonical sport
 * events, athlete statistics, standings. Deploying it for the first time into an
 * environment that has never run it should not immediately hand it authority over every
 * future submission.
 *
 * Firestore event triggers do not replay existing documents, so deployment alone will not
 * refinalize past matches. The risk is the *next* submission entering an unproven path.
 * These modes make that a deliberate, staged decision.
 *
 *   off      — receipt is logged, no official write is attempted
 *   canary   — only explicitly allowlisted submissions are processed
 *   enabled  — every eligible submission is processed
 *
 * The allowlist is read from trusted function configuration, never from a field on the
 * submission itself: a client-writable marker would let a team opt its own result into
 * finalization.
 */

export type FinalizerMode = 'off' | 'canary' | 'enabled';

const modeParam = defineString('GOALPLACE_FINALIZER_MODE', {
  default: 'off',
  description: 'Result finalizer activation: off, canary, or enabled.',
});

const canaryIdsParam = defineString('GOALPLACE_FINALIZER_CANARY_SUBMISSION_IDS', {
  default: '',
  description: 'Comma-separated submission ids the finalizer may process in canary mode.',
});

/** Unrecognised values fall back to `off`: a typo must not grant authority. */
export function resolveFinalizerMode(raw: string | undefined): FinalizerMode {
  if (raw === 'canary' || raw === 'enabled') return raw;
  return 'off';
}

export function parseCanaryAllowlist(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export type FinalizerDecision =
  | { proceed: true; mode: FinalizerMode }
  | { proceed: false; mode: FinalizerMode; reason: 'finalizer_off' | 'not_in_canary_allowlist' };

/**
 * Decides whether this submission may be finalized under the current activation mode.
 * Pure, so the staged rollout is testable without deploying.
 */
export function decideFinalization(input: {
  submissionId: string;
  mode: FinalizerMode;
  canaryAllowlist: string[];
}): FinalizerDecision {
  if (input.mode === 'off') return { proceed: false, mode: input.mode, reason: 'finalizer_off' };
  if (input.mode === 'enabled') return { proceed: true, mode: input.mode };
  return input.canaryAllowlist.includes(input.submissionId)
    ? { proceed: true, mode: input.mode }
    : { proceed: false, mode: input.mode, reason: 'not_in_canary_allowlist' };
}

/** Reads the live configuration. Call inside a handler, never at module load. */
export function currentFinalizerActivation() {
  return {
    mode: resolveFinalizerMode(modeParam.value()),
    canaryAllowlist: parseCanaryAllowlist(canaryIdsParam.value()),
  };
}
