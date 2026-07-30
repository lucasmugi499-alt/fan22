import { fantasyCompetitions } from '@/data/fantasyDemo';
import type { FantasyCompetition } from '@/types/fantasy';

/**
 * Staging is a synthetic product demo. Keep its read-only fantasy catalogue
 * coherent while a newly created database is still waiting for the additive
 * fantasy seed. Trusted lineup and scoring writes still require server data.
 */
export function resolveFantasyCompetitions(
  storedCompetitions: FantasyCompetition[],
): FantasyCompetition[] {
  return storedCompetitions.length ? storedCompetitions : fantasyCompetitions;
}
