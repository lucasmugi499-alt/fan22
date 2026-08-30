import { describe, expect, it } from 'vitest';
import { repairedScore } from './repair-implausible-scores';
import { scoreIsPlausibleFor } from '../../src/kernel/validators/scorePlausibility';

/** The seven that were live, with football scorelines on basketball matches. */
const LIVE = [
  { id: 'match_017', home: 2, away: 3 },
  { id: 'match_018', home: 1, away: 1 },
  { id: 'match_020', home: 3, away: 5 },
  { id: 'match_022', home: 2, away: 1 },
  { id: 'match_024', home: 2, away: 2 },
  { id: 'match_025', home: 2, away: 4 },
  { id: 'match_027', home: 1, away: 2 },
];

describe('replacing a score that belongs to another sport', () => {
  it('produces a score its own validator accepts', () => {
    for (const match of LIVE) {
      const next = repairedScore(match.id, 'basketball', match);
      expect(scoreIsPlausibleFor('basketball', next)).toBe(true);
    }
  });

  it('is deterministic, so a rerun writes the same numbers', () => {
    // Idempotence is the property that makes this safe to run twice against live data.
    for (const match of LIVE) {
      expect(repairedScore(match.id, 'basketball', match))
        .toEqual(repairedScore(match.id, 'basketball', match));
    }
  });

  it('gives different matches different scores', () => {
    // A deterministic function seeded on a constant would give every match the same result,
    // which would be idempotent and useless.
    const scores = LIVE.map((match) =>
      JSON.stringify(repairedScore(match.id, 'basketball', match)));
    expect(new Set(scores).size).toBeGreaterThan(4);
  });

  it('keeps the winner', () => {
    for (const match of LIVE.filter((entry) => entry.home !== entry.away)) {
      const next = repairedScore(match.id, 'basketball', match);
      expect(next.home > next.away).toBe(match.home > match.away);
    }
  });

  it('keeps the shape of the margin, so a close game stays close', () => {
    const close = repairedScore('match_022', 'basketball', { home: 2, away: 1 });
    const wider = repairedScore('match_020', 'basketball', { home: 3, away: 5 });
    expect(Math.abs(close.home - close.away)).toBeLessThan(Math.abs(wider.home - wider.away));
  });

  it('resolves a drawn basketball game rather than leaving it level', () => {
    // Basketball does not end level; overtime decides it. This is the one case where the
    // outcome itself has to change, which is why the script reports these separately.
    for (const match of LIVE.filter((entry) => entry.home === entry.away)) {
      const next = repairedScore(match.id, 'basketball', match);
      expect(next.home).not.toBe(next.away);
      expect(next.home).toBeGreaterThan(next.away);
    }
  });

  it('lands in the range the platform\'s real basketball actually occupies', () => {
    // Generating from the VALIDITY ceiling produced 134-131: inside the bounds and nothing
    // like the 60-to-96 every other basketball result on the platform sits in.
    for (const match of LIVE) {
      const next = repairedScore(match.id, 'basketball', match);
      for (const value of [next.home, next.away]) {
        expect(value).toBeGreaterThanOrEqual(55);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
});
