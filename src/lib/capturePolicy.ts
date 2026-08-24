/**
 * Whether a competition permits a human to type a score in afterwards.
 *
 * This is a property of the competition, not of the person. A League Admin holding
 * `league.result.enter` still cannot enter a result in a FIELD_REQUIRED competition, which
 * is the second of the three independent checks: capability asks whether this principal may
 * ever do this, policy asks whether this competition permits it here, and conflict asks
 * whether they should do it on this match. None implies another.
 *
 * Framework-free and dependency-free so both the client and the trusted routes can decide
 * from the same rule rather than each carrying their own copy of the ordering.
 */

export const CAPTURE_POLICIES = ['POST_MATCH_ALLOWED', 'FIELD_PREFERRED', 'FIELD_REQUIRED'] as const;

export type CapturePolicy = (typeof CAPTURE_POLICIES)[number];

/** Ordered weakest to strongest, which is what makes `max` meaningful. */
const RANK: Record<CapturePolicy, number> = {
  POST_MATCH_ALLOWED: 0,
  FIELD_PREFERRED: 1,
  FIELD_REQUIRED: 2,
};

export const DEFAULT_CAPTURE_POLICY: CapturePolicy = 'POST_MATCH_ALLOWED';

export function isCapturePolicy(value: unknown): value is CapturePolicy {
  return typeof value === 'string' && (CAPTURE_POLICIES as readonly string[]).includes(value);
}

/**
 * `effectivePolicy = max(leagueRequested, platformMinimum)`.
 *
 * The League chooses at competition setup and Platform can impose a floor, which is how a
 * fantasy-enabled, sponsored or Career-Passport competition gets a trust requirement without
 * a second authority model. Platform can only tighten: a floor that could lower a league's
 * own choice would let the platform quietly weaken a competition that had opted into rigour.
 */
export function effectiveCapturePolicy(
  leagueRequested: unknown,
  platformMinimum: unknown,
): CapturePolicy {
  const requested = isCapturePolicy(leagueRequested) ? leagueRequested : DEFAULT_CAPTURE_POLICY;
  const minimum = isCapturePolicy(platformMinimum) ? platformMinimum : DEFAULT_CAPTURE_POLICY;
  return RANK[requested] >= RANK[minimum] ? requested : minimum;
}

/** Does this policy permit a result typed in after the match, rather than captured live? */
export function permitsPostMatchEntry(policy: CapturePolicy) {
  return policy !== 'FIELD_REQUIRED';
}

/**
 * Whether a fallback entry needs a recorded reason.
 *
 * FIELD_PREFERRED means field capture is normal and typing a score is an exception someone
 * has to account for. POST_MATCH_ALLOWED is early adoption, where it is simply how the
 * league works and demanding a justification every time would be noise.
 */
export function requiresFallbackReason(policy: CapturePolicy) {
  return policy === 'FIELD_PREFERRED';
}

/**
 * The best data-quality tier a result produced under this policy can reach.
 *
 * A competition that permits typed scores cannot mint Gold, however careful the operator
 * was, because the evidence for a typed score is somebody's memory.
 */
export function qualityCeilingFor(policy: CapturePolicy): 'gold' | 'bronze' {
  return policy === 'FIELD_REQUIRED' ? 'gold' : 'bronze';
}
