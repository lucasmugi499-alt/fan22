import { describe, expect, it } from 'vitest';
import { EVENT_TYPE_DEFINITIONS, SPORT_DEFINITIONS } from '@/kernel/definitions/sportCatalogues';
import { paletteForSport, scoringEventTypesFor, usesPersistentScoringPanel } from './palette';

describe('capture palettes are per sport', () => {
  it.each(['football', 'basketball', 'rugby'])('offers a palette for %s', (sport) => {
    expect(paletteForSport(sport).length).toBeGreaterThan(3);
  });

  /**
   * The kernel decides what an event type IS. This decides which of them a person on a
   * touchline can record reliably. Every entry must exist in the kernel, or the client is
   * offering a button that emits something the truth engine will refuse.
   */
  it.each(['football', 'basketball', 'rugby'])('only offers %s events the kernel knows', (sport) => {
    const known = new Set(
      EVENT_TYPE_DEFINITIONS.filter((entry) => entry.sportId === sport).map((entry) => entry.code),
    );

    for (const entry of paletteForSport(sport)) {
      expect(known.has(entry.type), `${entry.type} is not in the ${sport} catalogue`).toBe(true);
    }
  });

  it('is deliberately shorter than the sport catalogue', () => {
    const catalogue = EVENT_TYPE_DEFINITIONS.filter((entry) => entry.sportId === 'basketball');

    // Rebounds, steals and blocks are collected by systems with several people watching. One
    // observer running the clock cannot, and data collected badly poisons fantasy while being
    // invisible in aggregate.
    expect(paletteForSport('basketball').length).toBeLessThan(catalogue.length);
  });

  it('reads scoring types from the kernel rather than restating them', () => {
    for (const sport of ['football', 'basketball', 'rugby']) {
      const definition = SPORT_DEFINITIONS.find((entry) => entry.sportId === sport);
      expect(scoringEventTypesFor(sport).sort())
        .toEqual((definition?.legalScoringEvents ?? []).map((entry) => entry.eventType).sort());
    }
  });

  it('carries basketball point values as payload rather than repeated events', () => {
    const threes = paletteForSport('basketball').find((entry) => entry.label === '+3');

    // One event worth three, never three events worth one: three events would put scoring
    // actions in the timeline that never happened.
    expect(threes?.variableValue).toEqual([3]);
    expect(paletteForSport('basketball').filter((entry) => entry.type === 'basketball.points')).toHaveLength(3);
  });

  it('puts scoring permanently on screen only where the sport scores often enough to need it', () => {
    expect(usesPersistentScoringPanel('basketball')).toBe(true);
    expect(usesPersistentScoringPanel('football')).toBe(false);
    expect(usesPersistentScoringPanel('rugby')).toBe(false);
  });

  it('knows which events contribute to the score', () => {
    expect(scoringEventTypesFor('football')).toContain('football.penalty_scored');
    expect(scoringEventTypesFor('rugby')).toContain('rugby.drop_goal_made');
    expect(scoringEventTypesFor('basketball')).toContain('basketball.points');
    // A missed conversion is a real event and contributes nothing.
    expect(scoringEventTypesFor('rugby')).not.toContain('rugby.conversion_missed');
  });

  it('falls back to football rather than leaving a Field Manager with no buttons', () => {
    expect(paletteForSport('netball').length).toBeGreaterThan(0);
  });
});
