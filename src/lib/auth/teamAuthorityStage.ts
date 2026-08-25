/**
 * When team-scoped authority actually stops granting anything.
 *
 * ADR-004 retires Team Admin, and the branch that implements it versions the team bundles to
 * zero capabilities. That is correct as an end state and dangerous as a deploy, because the
 * projector derives capabilities from the bundle: the moment any team scope rebuilds, that
 * team's authority is gone.
 *
 * The two-sided guard on `resultSubmissions` is what makes this matter. It reads:
 *
 *   answer: hasTeamOperatorCapability(opponentTeamId) && !hasTeamOperatorCapability(submittedByTeamId)
 *
 * Both terms fail together once the bundles are zero, so an open claim awaiting its opponent
 * stops being answerable by that opponent. A league with live V1 workflows would find them
 * stranded on the day the code shipped, with nothing about the deploy suggesting that would
 * happen.
 *
 * So retirement is an operation, not a deploy. The stage decides what the bundles grant, and
 * the order it enforces is: drain, then retire, then rebuild. Not: retire, then discover the
 * workflows are stuck.
 */

export type TeamAuthorityStage =
  /** Pre-migration. Team bundles grant what they always did. */
  | 'active'
  /**
   * The drain window. Existing grants stand so live V1 workflows can finish; no new
   * assignment or invitation may be issued. This is the safe default, because a deploy that
   * silently retired authority is the failure being prevented.
   */
  | 'frozen'
  /** Drain confirmed at zero. The bundles grant nothing and projections may be rebuilt. */
  | 'retired';

export const DEFAULT_TEAM_AUTHORITY_STAGE: TeamAuthorityStage = 'frozen';

/** An unrecognised value falls back to `frozen`: a typo must not retire anybody's authority. */
export function resolveTeamAuthorityStage(raw: string | undefined): TeamAuthorityStage {
  if (raw === 'active' || raw === 'retired') return raw;
  return DEFAULT_TEAM_AUTHORITY_STAGE;
}

export function currentTeamAuthorityStage(): TeamAuthorityStage {
  return resolveTeamAuthorityStage(process.env.GOALPLACE_TEAM_AUTHORITY_STAGE);
}

/** Do team bundles still grant their capabilities? */
export function teamAuthorityGrants(stage: TeamAuthorityStage = currentTeamAuthorityStage()) {
  return stage !== 'retired';
}

/**
 * May a new team-scoped assignment or invitation be created?
 *
 * False from `frozen` onward. Freezing issuance and retiring authority are deliberately
 * separate: the first can ship immediately and strands nobody, the second has to wait for the
 * drain.
 */
export function teamAuthorityIssuable(stage: TeamAuthorityStage = currentTeamAuthorityStage()) {
  return stage === 'active';
}
