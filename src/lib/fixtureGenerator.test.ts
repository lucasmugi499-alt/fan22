import { describe, expect, it } from 'vitest';
import { generateDoubleRoundRobinFixtures } from './fixtureGenerator';
import type { League, Season, Team } from '@/types';

const league = { id: 'league', sport: 'football' } as League;
const season = { id: 'season', leagueId: 'league' } as Season;
const teams = Array.from({ length: 10 }, (_, index) => ({
  id: `team-${index}`,
  name: `Team ${index}`,
  city: 'Kampala',
  location: `Ground ${index}`,
} as Team));

describe('generateDoubleRoundRobinFixtures', () => {
  it('creates home and away fixtures for every pair', () => {
    const fixtures = generateDoubleRoundRobinFixtures({
      league,
      season,
      teams,
      firstKickoff: '2026-08-01T13:00:00.000Z',
    });
    expect(fixtures).toHaveLength(90);
    for (const team of teams) {
      expect(fixtures.filter((match) => match.homeTeamId === team.id)).toHaveLength(9);
      expect(fixtures.filter((match) => match.awayTeamId === team.id)).toHaveLength(9);
    }
  });
});
