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

/**
 * The default flipped from `frozen` to `retired` on 21 September 2026, and the reason is the
 * mirror image of the reason it was `frozen`.
 *
 * During the drain, `frozen` was fail-closed: an environment that forgot the variable kept V1
 * workflows alive rather than stranding them. The drain is finished. Every deployed environment
 * sets `retired`, the V1 bundles must never grant again under ADR-005, and the new club
 * authority is a different bundle that no stage gates.
 *
 * So an unset variable now points the other way. A local dev server without it ran under
 * `frozen`, and when a league command rebuilt a team scope through it, the projection it wrote
 * to the LIVE database carried `team.result.submit`, `team.roster.manage` and the rest of the
 * retired bundle — which the deployed rules, reading `accessIndex` directly, would have
 * honoured. Fail-closed today means: forget the variable, grant less, never more.
 *
 * `active` and `frozen` remain reachable by name, for the tests that prove the drain logic and
 * for any environment that has genuinely not drained. Nothing reaches them by omission.
 */
export const DEFAULT_TEAM_AUTHORITY_STAGE: TeamAuthorityStage = 'retired';

/**
 * An unrecognised value falls back to the default. A typo must not restore anybody's
 * authority, which is now the direction a typo could go.
 */
export function resolveTeamAuthorityStage(raw: string | undefined): TeamAuthorityStage {
  if (raw === 'active' || raw === 'frozen') return raw;
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
