import { describe, expect, it } from 'vitest';
import { reconstructMatchScore } from './score';
import { SPORT_DEFINITIONS } from '@/kernel/definitions/sportCatalogues';

describe('basketball scores without fabricating events', () => {
  /**
   * H6. The finalizer used to expand one N-point event into N synthetic
   * `basketball.free_throw_made` events so fixed weights would sum correctly. The total came
   * out right and the history was false: a three-pointer was recorded, officially and
   * permanently, as three made free throws.
   *
   * A canonical event record has to describe what happened. "Scored 3 points, breakdown not
   * collected" is true; "made three free throws" is not.
   */
  const basketball = SPORT_DEFINITIONS.find((definition) => definition.sportId === 'basketball')!;
  const teams = { homeTeamId: 'team_home', awayTeamId: 'team_away' };

  const pointsEvent = (id: string, teamId: string, value: number) => ({
    id,
    eventType: 'basketball.points',
    teamId,
    payload: { value },
  }) as never;

  it('reads the value the event carries instead of a fixed weight', () => {
    const trace = reconstructMatchScore({
      sportDefinition: basketball,
      teams,
      events: [pointsEvent('e1', 'team_home', 3), pointsEvent('e2', 'team_away', 2)],
    });

    expect(trace.home).toBe(3);
    expect(trace.away).toBe(2);
  });

  it('records one event per scoring act, not one per point', () => {
    // The tell that the fabrication is gone: a 3-point score is a single component.
    const trace = reconstructMatchScore({
      sportDefinition: basketball,
      teams,
      events: [pointsEvent('e1', 'team_home', 3)],
    });

    expect(trace.components).toHaveLength(1);
    expect(trace.components[0].eventType).toBe('basketball.points');
    expect(trace.components[0].points).toBe(3);
  });

  it('reports a variable-value event with no usable value rather than scoring it silently', () => {
    const trace = reconstructMatchScore({
      sportDefinition: basketball,
      teams,
      events: [pointsEvent('e_bad', 'team_home', Number.NaN)],
    });

    expect(trace.home).toBe(0);
    expect(trace.issues.join(' ')).toContain('no usable value');
  });

  it('still honours fixed-weight events for sports that collect them', () => {
    const football = SPORT_DEFINITIONS.find((definition) => definition.sportId === 'football')!;
    const trace = reconstructMatchScore({
      sportDefinition: football,
      teams,
      events: [{ id: 'g1', eventType: 'football.goal', teamId: 'team_home', payload: {} } as never],
    });
    expect(trace.home).toBe(1);
  });
});
