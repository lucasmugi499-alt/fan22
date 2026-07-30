import { describe, expect, it } from 'vitest';
import { fantasyDemo } from '@/data/fantasyDemo';
import { resolveFantasyCompetitions } from './catalogue';

describe('resolveFantasyCompetitions', () => {
  it('uses active Firebase competitions when staging has them', () => {
    const active = fantasyDemo.competitions.slice(0, 1);
    expect(resolveFantasyCompetitions(active)).toEqual(active);
  });

  it('keeps the synthetic multi-sport pilot usable when staging has not been seeded', () => {
    expect(resolveFantasyCompetitions([])).toEqual(fantasyDemo.competitions);
  });
});
