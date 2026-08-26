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
 *   canary   — only explicitly allowlisted ids are processed
 *   enabled  — every eligible claim is processed
 *
 * ## One switch per source, not one switch
 *
 * There used to be a single `GOALPLACE_FINALIZER_MODE`, and that was right while there was
 * exactly one way for a result to reach the engine. There are now three, at three different
 * maturities: the bilateral V1 submission has been enabled and cloud-verified on demo since
 * 2026-08-08, while field capture and league post-match entry have never once run against
 * the real environment.
 *
 * A single flag forces those three to share a maturity they do not share. Turning it down to
 * `canary` to protect a brand-new source degrades a finalizer that has been working for
 * weeks; leaving it `enabled` arms the new source with no canary, which is how the first
 * ordinary field report anybody happened to write would have become an official result. The
 * flag was not wrong. It stopped matching the shape of the thing it governs.
 *
 * So each source binds to its own pair of variables and an unset variable resolves to `off`.
 * A new source is inert until somebody names it, and no source inherits authority earned by
 * another — deliberately, because inheritance is precisely the coupling being removed.
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
 * The intake paths that can reach the finalizer, as activation subjects.
 *
 * This is an *ingress* vocabulary, not a planner one. It names which door a claim came
 * through so the door can be opened or closed independently; nothing downstream of
 * `FinalizationCandidate` may branch on it. See `resultFinalizer.ts`: the planner takes an
 * already-resolved `FinalizerActivation` and cannot tell which source produced it.
 */
export type FinalizationSource = 'legacy_submission' | 'field_capture' | 'league_post_match';

/**
 * The environment variables each source reads. Separate names, not a prefix convention,
 * because these are operator-facing controls that appear in `apphosting.yaml`, in the
 * Functions `.env`, and in a runbook: an operator narrowing field capture must be able to
 * grep for the exact string they are about to change and find only that one gate.
 *
 * The allowlist for a field or league report is keyed by MATCH id, and for a V1 claim by
 * SUBMISSION id. Both happen to be the match id today, which is exactly why the names say
 * which one they mean rather than relying on that staying true.
 */
export const ACTIVATION_VARIABLES: Record<FinalizationSource, { mode: string; canaryIds: string }> = {
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
};

/**
 * Which gate a `matchReports` document is subject to.
 *
 * `matchReports` holds two genuinely different things — a field capture report bound to an
 * event stream, and a League Admin typing a score after the fact — and they are told apart
 * by the document's own `source` field. That is a client-written value, so it is read here
 * as a NARROWING and never as a grant: anything that is not exactly `league_post_match`
 * resolves to `field_capture`.
 *
 * The direction matters. If an unrecognised value fell through to `league_post_match`, a
 * device could pick which activation switch judged its own report, and choose the one that
 * happened to be open. Defaulting to field capture means a malformed source can only ever
 * land on the stricter gate of the two while field capture is the newer pipeline, and can
 * never route itself around the gate it belongs to.
 */
export function activationSourceForReport(reportSource: unknown): FinalizationSource {
  return reportSource === 'league_post_match' ? 'league_post_match' : 'field_capture';
}

/**
 * The activation for one source, read from the environment.
 *
 * **No fallback to `GOALPLACE_FINALIZER_MODE`.** An unset `GOALPLACE_FIELD_CAPTURE_MODE`
 * means `off`, and it must, even though the deployment it lands on has the legacy flag set
 * to `enabled`. Falling back would preserve the current behaviour of the demo project and
 * reintroduce the entire hazard: the new source would arrive already armed by a switch that
 * was flipped for a different pipeline, on a different date, on the strength of a canary
 * that tested something else.
 *
 * The consequence is deliberate and must be said plainly wherever this ships: deploying this
 * change without also setting the new variables turns field capture and league entry OFF on
 * an environment where they were effectively on.
 */
export function activationForSource(
  source: FinalizationSource,
  env: NodeJS.ProcessEnv = process.env,
): FinalizerActivation {
  const names = ACTIVATION_VARIABLES[source];
  return {
    mode: resolveFinalizerMode(env[names.mode]),
    canaryAllowlist: parseCanaryAllowlist(env[names.canaryIds]),
  };
}

/**
 * The activation the App Hosting runtime is configured with, for the legacy V1 path.
 *
 * Named for that path on purpose. App Hosting reaches the finalizer through exactly two
 * routes — the League correction route and the authenticated `/finalize` route — and both
 * are bilateral-submission routes. Neither field capture nor league post-match entry is
 * reachable from this runtime at all; they are Firestore-trigger sources and their gates are
 * resolved in the Functions runtime.
 *
 * Both runtimes read the same variable names for the same source, so the switch means the
 * same thing wherever finalization is attempted. An unset variable resolves to `off`, which
 * is why `apphosting.yaml` must declare it explicitly.
 */
export function activationFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): FinalizerActivation {
  return activationForSource('legacy_submission', env);
}
