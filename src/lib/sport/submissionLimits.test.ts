import { describe, expect, it } from 'vitest';
import {
  MAX_FINALIZATION_WRITES,
  projectedFinalizationWrites,
  SUBMISSION_LIMITS,
  finalizationWriteBudgetExceeded,
  submissionLimitBreaches,
} from './submissionLimits';

const realistic = {
  homeScore: 2,
  awayScore: 1,
  scorers: [{ athleteId: 'a', count: 2 }, { athleteId: 'b', count: 1 }],
  activeSquads: { team_home: Array.from({ length: 18 }, (_, i) => `a${i}`), team_away: ['x', 'y'] },
  athleteStatLines: Array.from({ length: 30 }, (_, i) => ({ athleteId: `a${i}` })),
  evidenceRefs: ['uploads/sheet.jpg'],
};

describe('result submission limits', () => {
  it('accepts a realistic grassroots fixture', () => {
    // The caps must not referee real team sheets — only stop amplification.
    expect(submissionLimitBreaches(realistic)).toEqual([]);
  });

  it('accepts a high-scoring basketball result', () => {
    expect(submissionLimitBreaches({ ...realistic, homeScore: 128, awayScore: 119 })).toEqual([]);
  });

  it('refuses an amplification payload', () => {
    // The attack: one technically valid document that expands into hundreds of writes, fails
    // the transaction, and retries forever.
    const breaches = submissionLimitBreaches({
      ...realistic,
      scorers: Array.from({ length: 5000 }, () => ({ athleteId: 'a', count: 1 })),
      athleteStatLines: Array.from({ length: 5000 }, () => ({ athleteId: 'a' })),
      evidenceRefs: Array.from({ length: 500 }, (_, i) => `e${i}`),
    });
    expect(breaches).toHaveLength(3);
    expect(breaches.join(' ')).toContain('scorer entries');
    expect(breaches.join(' ')).toContain('stat lines');
    expect(breaches.join(' ')).toContain('evidence references');
  });

  it('refuses an oversized squad and a third team', () => {
    const breaches = submissionLimitBreaches({
      ...realistic,
      activeSquads: {
        team_home: Array.from({ length: 400 }, (_, i) => `a${i}`),
        team_away: ['x'],
        team_ghost: ['z'],
      },
    });
    expect(breaches.join(' ')).toContain('a fixture has 2');
    expect(breaches.join(' ')).toContain('above the maximum of 40');
  });

  it('refuses an implausible score', () => {
    const breaches = submissionLimitBreaches({ ...realistic, homeScore: 99999 });
    expect(breaches.join(' ')).toContain('exceeds the maximum');
  });

  it('budgets finalization writes below the transaction ceiling', () => {
    expect(finalizationWriteBudgetExceeded(MAX_FINALIZATION_WRITES)).toBe(false);
    expect(finalizationWriteBudgetExceeded(MAX_FINALIZATION_WRITES + 1)).toBe(true);
    // Headroom for the reconciliation and standings writes that follow the event fan-out.
    expect(MAX_FINALIZATION_WRITES).toBeLessThan(500);
  });

  it('ignores fields it was not given rather than inventing breaches', () => {
    expect(submissionLimitBreaches({})).toEqual([]);
    expect(SUBMISSION_LIMITS.maxSquadTeams).toBe(2);
  });
});

describe('nested numeric values cannot amplify the finalizer', () => {
  /**
   * The hole the length caps left open. `scorers.size() <= 60` counts entries, not what is
   * inside them, and the finalizer expands football and rugby scoring one event per point.
   * A single well-formed entry claiming 100,000,000 passes every length check and then asks
   * the finalizer to construct a hundred million objects — before reconciliation, before the
   * transaction, before any guard that could refuse it.
   */
  const base = {
    homeScore: 2,
    awayScore: 1,
    activeSquads: { team_home: ['a1'], team_away: ['b1'] },
    evidenceRefs: [],
  };

  it.each([
    ['a huge count', 100_000_000],
    ['MAX_SAFE_INTEGER', Number.MAX_SAFE_INTEGER],
    ['a thousand', 1_000],
  ])('refuses %s inside one scorer entry', (_label, count) => {
    const breaches = submissionLimitBreaches({ ...base, scorers: [{ athleteId: 'a', teamId: 't', count }] });
    expect(breaches.join(' ')).toContain('scorer count');
  });

  it.each([
    ['negative', -5, 'cannot be negative'],
    ['fractional', 1.5, 'whole number'],
    ['NaN', Number.NaN, 'finite'],
    ['Infinity', Number.POSITIVE_INFINITY, 'finite'],
    ['a string', '12' as unknown as number, 'must be a number'],
  ])('refuses a %s scorer count', (_label, count, expected) => {
    const breaches = submissionLimitBreaches({ ...base, scorers: [{ athleteId: 'a', teamId: 't', count }] });
    expect(breaches.join(' ')).toContain(expected);
  });

  it('refuses an enormous value inside a stat line', () => {
    // Same shape one level deeper: stats expand one event per unit.
    const breaches = submissionLimitBreaches({
      ...base,
      scorers: [],
      athleteStatLines: [{ athleteId: 'a', stats: { rebound: 1_000_000 } }],
    });
    expect(breaches.join(' ')).toContain('stat rebound');
  });

  it('still accepts a realistic hat-trick and a normal stat line', () => {
    // The caps must not referee real matches.
    expect(submissionLimitBreaches({
      ...base,
      scorers: [{ athleteId: 'a', teamId: 't', count: 3 }],
      athleteStatLines: [{ athleteId: 'a', stats: { rebound: 12, minutes_played: 90 } }],
    })).toEqual([]);
  });
});

describe('finalization work budget', () => {
  it('counts the work a claim would create without building it', () => {
    // Counted from the claim, because constructing the array to measure it is the failure.
    const planned = projectedFinalizationWrites({
      scorers: [{ athleteId: 'a', teamId: 't', count: 3 }],
      athleteStatLines: [{ athleteId: 'a', stats: { rebound: 10, minutes_played: 90 } }],
      activeSquads: { team_home: ['a', 'b'], team_away: ['c'] },
    }, 'football');

    // 3 scoring + 10 rebound + 1 minutes + 3 squad + fixed allowance.
    expect(planned).toBe(3 + 10 + 1 + 3 + 40);
    expect(finalizationWriteBudgetExceeded(planned)).toBe(false);
  });

  it('flags a claim whose expansion would blow the transaction budget', () => {
    const planned = projectedFinalizationWrites({
      scorers: Array.from({ length: 20 }, () => ({ athleteId: 'a', teamId: 't', count: 90 })),
    }, 'football');
    expect(planned).toBeGreaterThan(MAX_FINALIZATION_WRITES);
    expect(finalizationWriteBudgetExceeded(planned)).toBe(true);
  });

  it('counts basketball scoring as one variable-value event, not one per point', () => {
    const planned = projectedFinalizationWrites({
      scorers: [{ athleteId: 'a', teamId: 't', count: 128 }],
    }, 'basketball');
    expect(planned).toBe(1 + 40);
  });
});
