import { describe, expect, it } from 'vitest';
import type { LeagueStanding } from './leagueModel';
import {
  gamesBehind,
  lineupFormationLabel,
  lineupSlots,
  lineupStarterLimit,
  standingCellValue,
  standingColumns,
} from './sportPresentation';

function row(overrides: Partial<LeagueStanding>): LeagueStanding {
  return {
    teamId: 'team_1',
    teamName: 'Team One',
    played: 10,
    wins: 6,
    draws: 0,
    losses: 4,
    pointsFor: 800,
    pointsAgainst: 760,
    difference: 40,
    points: 12,
    ...overrides,
  };
}

describe('sport presentation', () => {
  it('uses basketball table columns fans expect', () => {
    expect(standingColumns('basketball').map((column) => column.label)).toEqual([
      'GP',
      'W',
      'L',
      'PCT',
      'GB',
      'PF',
      'PA',
      'DIFF',
      'PTS',
    ]);
    expect(standingCellValue(row({ wins: 6, played: 10 }), 'pct')).toBe('.600');
    expect(gamesBehind(row({ teamId: 'team_2', wins: 4, losses: 6 }), row({ wins: 7, losses: 3 }))).toBe('3');
  });

  it('keeps football and rugby table labels distinct', () => {
    expect(standingColumns('football').map((column) => column.label)).toEqual([
      'PL',
      'W',
      'D',
      'L',
      'GF',
      'GA',
      'GD',
      'PTS',
    ]);
    expect(standingColumns('rugby').map((column) => column.label)).toEqual([
      'PL',
      'W',
      'D',
      'L',
      'PF',
      'PA',
      'PD',
      'PTS',
    ]);
  });

  it('returns sport-specific lineup shapes', () => {
    expect(lineupStarterLimit('football')).toBe(11);
    expect(lineupFormationLabel('football')).toBe('4-3-3');
    expect(lineupSlots('football')).toHaveLength(11);

    expect(lineupStarterLimit('basketball')).toBe(5);
    expect(lineupFormationLabel('basketball')).toBe('2-3 court set');
    expect(lineupSlots('basketball')).toHaveLength(5);

    expect(lineupStarterLimit('rugby')).toBe(15);
    expect(lineupFormationLabel('rugby')).toBe('8 forwards / 7 backs');
    expect(lineupSlots('rugby')).toHaveLength(15);
  });
});
