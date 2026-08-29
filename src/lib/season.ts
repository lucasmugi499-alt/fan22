// Relative, not `@/`. This module is compiled into the Cloud Functions bundle through the
// standings projection, where a path alias survives into the emitted CommonJS and fails at
// require time — tsc resolves the alias, it does not rewrite it. `functions/scripts/verify-bundle.mjs`
// fails the build if one reappears.
import type { Season, SeasonScoringRules, SportSlug, SportType } from '../types';

/**
 * Season helpers and the per-sport scoring defaults.
 *
 * Standings used to hardcode "football scores 3, everything else scores 1", which awarded
 * rugby wins 1 point instead of 4 and rugby draws nothing instead of 2 — wrong for 6 of the
 * 10 leagues in the dataset. Scoring is a property of the competition, so it lives on the
 * season and a league can depart from the default without a code change.
 */

export function toSportSlug(sport: SportSlug | SportType): SportSlug {
  return String(sport).toLowerCase() as SportSlug;
}

export const DEFAULT_SCORING: Record<SportSlug, SeasonScoringRules> = {
  football: { win: 3, draw: 1, loss: 0 },
  // Basketball is played to a decision; a drawn scoreline indicates bad data, not a result
  // worth zero points. `null` lets standings flag it rather than quietly score it.
  basketball: { win: 2, draw: null, loss: 0 },
  // Rugby union league points. Try and losing bonuses are not applied yet — `MatchEvent`
  // carries no try counts, so awarding them would be guesswork.
  rugby: { win: 4, draw: 2, loss: 0 },
};

export function defaultScoringFor(sport: SportSlug | SportType): SeasonScoringRules {
  return DEFAULT_SCORING[toSportSlug(sport)] ?? DEFAULT_SCORING.football;
}

/** Scoring for a season, falling back to the sport default when no season is supplied. */
export function scoringForSeason(
  season: Season | undefined,
  sport: SportSlug | SportType
): SeasonScoringRules {
  return season?.scoring ?? defaultScoringFor(sport);
}

export function findSeason(seasons: Season[], seasonId?: string): Season | undefined {
  if (!seasonId) return undefined;
  return seasons.find((season) => season.id === seasonId);
}

/** The season a league's dashboards default to. */
export function currentSeasonFor(seasons: Season[], leagueId: string, currentSeasonId?: string) {
  return (
    findSeason(seasons, currentSeasonId) ??
    seasons.find((season) => season.leagueId === leagueId && season.status === 'active') ??
    seasons.find((season) => season.leagueId === leagueId)
  );
}

export function seasonsForLeague(seasons: Season[], leagueId: string): Season[] {
  return seasons.filter((season) => season.leagueId === leagueId);
}

/** Seasons whose records are still being written to. */
export function isSeasonOpen(season: Season): boolean {
  return season.status === 'active' || season.status === 'registration';
}
