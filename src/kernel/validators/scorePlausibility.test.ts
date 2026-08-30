import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkScorePlausibility, scoreIsPlausibleFor } from './scorePlausibility';

/**
 * Seven basketball matches carried the scores 2-3, 1-1, 3-5, 2-1, 2-2, 2-4 and 1-2, and were
 * marked verified. Every layer agreed they were basketball, so the sport tag was right and the
 * scores were football's, left behind by a seed that no longer exists in the repository.
 *
 * Nothing could have caught them, because every check on a result is internal: does the
 * declared score match the reconstruction, do the events sum to the total, is the box score
 * consistent. All of those pass for 1-1, because 1-1 is perfectly self-consistent.
 */

describe('a score that is not of the right kind', () => {
  it('rejects the football scorelines that were sitting on basketball matches', () => {
    for (const [home, away] of [[2, 3], [1, 1], [3, 5], [2, 1], [2, 2], [2, 4], [1, 2]]) {
      expect(scoreIsPlausibleFor('basketball', { home, away })).toBe(false);
    }
  });

  it('names which side is wrong and why', () => {
    expect(checkScorePlausibility('basketball', { home: 78, away: 4 })).toEqual({
      plausible: false,
      side: 'away',
      reason: expect.stringContaining('not a basketball score'),
    });
  });

  it('accepts real basketball results', () => {
    for (const [home, away] of [[68, 78], [95, 78], [94, 81], [62, 60], [110, 47]]) {
      expect(scoreIsPlausibleFor('basketball', { home, away })).toBe(true);
    }
  });

  it('accepts a nil-nil football match, which has no floor to fall below', () => {
    expect(scoreIsPlausibleFor('football', { home: 0, away: 0 })).toBe(true);
  });

  it('accepts a grassroots rout rather than refereeing it', () => {
    // The ceiling is here to catch another sport's number, not to second-guess a real result.
    expect(scoreIsPlausibleFor('football', { home: 14, away: 0 })).toBe(true);
    expect(scoreIsPlausibleFor('rugby', { home: 88, away: 3 })).toBe(true);
  });

  it('catches a basketball total landing on a football match', () => {
    expect(scoreIsPlausibleFor('football', { home: 78, away: 74 })).toBe(false);
  });

  it('says nothing about a sport it has no bounds for', () => {
    // Inventing a range for a sport this codebase does not define would reject real results.
    expect(scoreIsPlausibleFor('volleyball', { home: 3, away: 1 })).toBe(true);
  });

  it('says nothing about a match with no score', () => {
    expect(scoreIsPlausibleFor('basketball', { home: null, away: null })).toBe(true);
    expect(scoreIsPlausibleFor('basketball', { home: undefined, away: 70 })).toBe(true);
  });

  it('is case-insensitive about the sport, because the records are not consistent', () => {
    // `Football` with a capital F exists on real documents alongside `football`.
    expect(scoreIsPlausibleFor('Basketball', { home: 2, away: 3 })).toBe(false);
  });
});

/**
 * The requirement is that this cannot come back through seed or migration data, so the check
 * runs against the actual shipped dataset rather than against a fixture of it.
 */
describe('the seed dataset this repository ships', () => {
  const database = JSON.parse(
    readFileSync('data/investor-demo/database.json', 'utf8'),
  ) as {
    matches: Array<{ id: string; leagueId?: string; sport?: string; score?: { home?: number | null; away?: number | null } }>;
    leagues: Array<{ id: string; sport?: string }>;
  };

  it('contains matches with scores, so this test is not vacuous', () => {
    const scored = database.matches.filter((match) =>
      typeof match.score?.home === 'number' && typeof match.score?.away === 'number');
    expect(scored.length).toBeGreaterThan(100);
  });

  it('carries no score that belongs to a different sport', () => {
    const sportByLeague = new Map(database.leagues.map((league) => [league.id, league.sport]));
    const offenders = database.matches
      .filter((match) => !scoreIsPlausibleFor(
        sportByLeague.get(String(match.leagueId)) ?? match.sport,
        { home: match.score?.home, away: match.score?.away },
      ))
      .map((match) => `${match.id}: ${match.score?.home}-${match.score?.away}`);

    expect(offenders).toEqual([]);
  });
});
