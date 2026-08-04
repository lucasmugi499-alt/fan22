import { describe, expect, it } from 'vitest';
import { projectSearchEntry, searchIndexEntryId } from './searchProjection';

describe('projectSearchEntry', () => {
  it('projects an athlete with a deterministic id and public fields only', () => {
    const entry = projectSearchEntry('athlete', 'athlete_1', {
      name: 'Priscilla Nakato',
      position: 'Striker',
      city: 'Kampala',
      sport: 'football',
      teamName: 'Kisenyi United',
      // Not public, and must not leak into a public projection.
      invitationTokenHash: 'secret',
      userId: 'user_1',
    });

    expect(entry?.id).toBe('athlete_athlete_1');
    expect(entry?.href).toBe('/athletes/athlete_1');
    expect(Object.keys(entry ?? {}).sort()).toEqual([
      'entityId', 'href', 'id', 'meta', 'searchText', 'title', 'tokens', 'type',
    ]);
    expect(JSON.stringify(entry)).not.toContain('secret');
    expect(JSON.stringify(entry)).not.toContain('user_1');
  });

  it('indexes the team name so an athlete is findable by their club', () => {
    const entry = projectSearchEntry('athlete', 'athlete_1', {
      name: 'Priscilla Nakato',
      teamName: 'Kisenyi United',
    });

    expect(entry?.tokens).toContain('kisenyi');
  });

  it('returns null for an entity with no name', () => {
    // Nothing to search on; any existing entry should be removed rather than kept.
    expect(projectSearchEntry('team', 'team_1', { city: 'Kampala' })).toBeNull();
    expect(projectSearchEntry('team', 'team_1', { name: '   ' })).toBeNull();
  });

  it('points a season at its league, which is where it is actually shown', () => {
    const entry = projectSearchEntry('season', 'season_1', {
      name: '2026 Season',
      sport: 'rugby',
      leagueId: 'league_9',
    });

    expect(entry?.href).toBe('/leagues/league_9');
  });

  it('omits empty parts from the display meta instead of leaving separators', () => {
    const entry = projectSearchEntry('athlete', 'athlete_1', { name: 'Grace' });

    expect(entry?.meta).toBe('Athlete');
  });

  it('builds the same id the bulk builder and the trigger both use', () => {
    expect(searchIndexEntryId('league', 'league_1')).toBe('league_league_1');
  });
});
