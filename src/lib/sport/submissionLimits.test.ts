import { describe, expect, it } from 'vitest';
import {
  MAX_FINALIZATION_WRITES,
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
