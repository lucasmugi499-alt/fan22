/**
 * Activation authority for the trusted result finalizer.
 *
 * This lives beside the finalizer rather than inside the Cloud Functions package because
 * the gate has to bind to the *finalization path*, not to one caller of it.
 *
 * It previously lived only in `functions/src/index.ts`, which meant exactly one of four
 * callers checked it. The scheduled sweeper, the League correction route and the
 * authenticated `/finalize` HTTP route all reached `finalizeSubmission` directly, so an
 * `off` or `canary` mode could be bypassed by any of them — and the HTTP route is
 * deployed. A safety switch that only one entry point honours is not a safety switch.
 *
 *   off      — receipt is logged, no official write is attempted
 *   canary   — only explicitly allowlisted submissions are processed
 *   enabled  — every eligible submission is processed
 */

export type FinalizerMode = 'off' | 'canary' | 'enabled';

export type FinalizerActivation = {
  mode: FinalizerMode;
  canaryAllowlist: string[];
};

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

/**
 * The activation the App Hosting runtime is configured with.
 *
 * Both runtimes read the same two variable names so the switch means the same thing
 * wherever finalization is attempted. An unset variable resolves to `off`, which is why
 * `apphosting.yaml` must declare it explicitly.
 */
export function activationFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): FinalizerActivation {
  return {
    mode: resolveFinalizerMode(env.GOALPLACE_FINALIZER_MODE),
    canaryAllowlist: parseCanaryAllowlist(env.GOALPLACE_FINALIZER_CANARY_SUBMISSION_IDS),
  };
}
