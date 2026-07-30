import { describe, expect, it } from 'vitest';
import { investorDemo } from '@/data/investorDemo';
import { buildLeagueTableSnapshot, regionLabel, sportLabel } from './discoveryUtils';

describe('discovery utilities', () => {
  it('builds non-zero public tables from official match records', () => {
    const league = investorDemo.leagues[0];
    const snapshot = buildLeagueTableSnapshot(
      league,
      investorDemo.teams,
      investorDemo.matches,
      investorDemo.seasons,
    );

    expect(snapshot.rows).toHaveLength(league.teamsCount);
    expect(snapshot.rows.some((row) => row.played > 0 && row.points > 0)).toBe(true);
  });

  it('normalizes sport labels and broad Uganda regions', () => {
    expect(sportLabel('rugby')).toBe('Rugby');
    expect(regionLabel('Kampala')).toBe('Central');
    expect(regionLabel('Mbale')).toBe('Eastern');
  });
});
