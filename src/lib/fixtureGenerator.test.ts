import { describe, expect, it } from 'vitest';
import { generateDoubleRoundRobinFixtures, validateFixtureDraft } from './fixtureGenerator';
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

describe('validateFixtureDraft', () => {
  it('finds venue collisions and insufficient team rest', () => {
    const generated = generateDoubleRoundRobinFixtures({
      league,
      season,
      teams,
      firstKickoff: '2027-01-01T12:00:00.000Z',
      daysBetweenRounds: 1,
      venueForTeam: () => 'Shared ground',
    });
    const conflicts = validateFixtureDraft(generated, 48);
    expect(conflicts.some((item) => item.message.includes('already used'))).toBe(true);
    expect(conflicts.some((item) => item.message.includes('hours of rest'))).toBe(true);
  });
});
