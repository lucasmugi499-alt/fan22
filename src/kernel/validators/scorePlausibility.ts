/**
 * Whether a final score could have come from the sport it is attached to.
 *
 * ## Why a platform about verified records needs this
 *
 * Seven basketball matches on the demo database carried the scores 2-3, 1-1, 3-5, 2-1, 2-2,
 * 2-4 and 1-2. Every layer agreed they were basketball — the match, the league and both clubs
 * — so the sport tag was right and the SCORES were football's, left behind by a seed that no
 * longer exists in the repository. They were `verified`, so the product presented them as
 * confirmed official records.
 *
 * Nothing in the platform could have noticed. Every check on a result is internal: does the
 * declared score match the reconstruction, do the events sum to the total, is the box score
 * consistent. All of those pass for 1-1, because 1-1 is perfectly self-consistent. What none
 * of them asks is whether the number belongs to the sport at all.
 *
 * ## Why the bounds are asymmetric
 *
 * Only basketball has a meaningful FLOOR. A completed basketball match in which a team scored
 * under twenty points is not a basketball match; a football match ending 0-0 is Tuesday.
 * Ceilings exist for all three and are deliberately far above anything real, because their job
 * is to catch a score from a different sport, not to referee an unusual one. A 14-0 grassroots
 * football rout is a true result and must pass.
 *
 * ## What this is not
 *
 * Not a judgement about whether a result is correct. A basketball game really played and
 * really recorded as 78-74 is inside these bounds whether or not 78-74 is what happened. This
 * catches a number that is not of the right KIND, which is a different and much narrower
 * claim — and the only one that can be made without knowing the match.
 */

export type PlausibleScoreRange = {
  /** The lowest a completed match's team score may be. */
  min: number;
  /**
   * The highest. Far above any real result on purpose: this is here to catch another sport's
   * number, not to second-guess a rout.
   */
  max: number;
};

export const PLAUSIBLE_TEAM_SCORE: Record<string, PlausibleScoreRange> = {
  // A shut-out is a real football result, so there is no floor. The ceiling sits well above a
  // grassroots rout and still catches a basketball total landing here.
  football: { min: 0, max: 30 },
  // The floor is the useful half. Every basketball score on this platform's real data sits
  // between 60 and 96; twenty is far below all of them and far above a football scoreline.
  basketball: { min: 20, max: 250 },
  // Rugby shares football's shape: nil is real, and the ceiling is generous.
  rugby: { min: 0, max: 200 },
};

/**
 * What a middling result in each sport actually looks like.
 *
 * Deliberately separate from `PLAUSIBLE_TEAM_SCORE`, which answers a different question. The
 * plausible range is about VALIDITY and is generous on purpose, so it never refuses a real
 * rout; this is about what is TYPICAL, and it is narrow. Using the validity ceiling to
 * generate a replacement score produced 134-131 basketball games — inside the bounds, and
 * nothing like the 60-to-96 the rest of the platform's basketball actually is.
 *
 * Read only by the repair script. Nothing derives a sporting number from it.
 */
export const TYPICAL_TEAM_SCORE: Record<string, PlausibleScoreRange> = {
  football: { min: 0, max: 4 },
  basketball: { min: 62, max: 84 },
  rugby: { min: 10, max: 35 },
};

export type ScorePlausibility =
  | { plausible: true }
  /** `unknown_sport` is not a failure: an unrecognised sport has no bounds to check against. */
  | { plausible: false; reason: string; side: 'home' | 'away' | 'both' };

/**
 * A completed match's final score, judged against its sport.
 *
 * Only meaningful for a match that finished. A score of 0-0 at kickoff is not implausible, it
 * is unplayed, and callers pass only settled results for that reason.
 */
export function checkScorePlausibility(
  sport: string | undefined,
  score: { home: number | null | undefined; away: number | null | undefined },
): ScorePlausibility {
  const range = PLAUSIBLE_TEAM_SCORE[String(sport ?? '').toLowerCase()];
  // An unrecognised sport has no bounds. Silence here is deliberate: inventing a range for a
  // sport this codebase does not define would reject real results from it.
  if (!range) return { plausible: true };

  const { home, away } = score;
  if (typeof home !== 'number' || typeof away !== 'number') return { plausible: true };

  const homeOff = home < range.min || home > range.max;
  const awayOff = away < range.min || away > range.max;
  if (!homeOff && !awayOff) return { plausible: true };

  return {
    plausible: false,
    side: homeOff && awayOff ? 'both' : homeOff ? 'home' : 'away',
    reason: `${home}-${away} is not a ${sport} score. A completed ${sport} match scores `
      + `between ${range.min} and ${range.max} per side.`,
  };
}

/** Convenience for the guards, which only need the verdict. */
export function scoreIsPlausibleFor(
  sport: string | undefined,
  score: { home: number | null | undefined; away: number | null | undefined },
): boolean {
  return checkScorePlausibility(sport, score).plausible;
}
