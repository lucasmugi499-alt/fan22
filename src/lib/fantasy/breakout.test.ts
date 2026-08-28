import { describe, expect, it } from 'vitest';
import { buildBreakoutBoard, scoutPickPercentile, type BreakoutAthleteInput } from './breakout';
import type { FantasyPointEvent } from '@/types/fantasy';

function athlete(
  athleteId: string,
  ownershipPercentage: number,
  previousOwnershipPercentage?: number,
): BreakoutAthleteInput {
  return {
    athleteId,
    legalName: `Athlete ${athleteId}`,
    teamName: 'Kampala United',
    registeredPosition: 'Midfielder',
    ownershipPercentage,
    ...(previousOwnershipPercentage === undefined ? {} : { previousOwnershipPercentage }),
  };
}

let sequence = 0;
function event(
  athleteId: string,
  basePoints: number,
  status: FantasyPointEvent['status'] = 'official',
): FantasyPointEvent {
  sequence += 1;
  return {
    id: `event_${sequence}`,
    idempotencyKey: `key_${sequence}`,
    competitionId: 'competition_1',
    roundId: 'round_1',
    matchId: 'match_1',
    officialResultVersion: 1,
    athleteId,
    sourceEventId: `source_${sequence}`,
    scoringRuleId: 'goal',
    quantity: 1,
    basePoints,
    status,
    createdAt: '2026-08-03T18:00:00.000Z',
  };
}

describe('breakout board', () => {
  it('surfaces the highest scorer nobody owns', () => {
    const board = buildBreakoutBoard({
      athletes: [athlete('hidden', 3), athlete('famous', 60), athlete('quiet', 2)],
      pointEvents: [event('hidden', 12), event('famous', 20), event('quiet', 4)],
      thresholdPercent: 5,
    });
    expect(board.topUnderOwned.map((row) => row.athleteId)).toEqual(['hidden', 'quiet']);
    expect(board.topUnderOwned[0].points).toBe(12);
  });

  it('leaves out an under-owned athlete who scored nothing', () => {
    const board = buildBreakoutBoard({
      athletes: [athlete('blank', 1)],
      pointEvents: [],
      thresholdPercent: 5,
    });
    expect(board.topUnderOwned).toEqual([]);
  });

  it('ignores superseded events, which belong to a result version that no longer stands', () => {
    const board = buildBreakoutBoard({
      athletes: [athlete('corrected', 2)],
      pointEvents: [event('corrected', 20, 'superseded'), event('corrected', 5)],
      thresholdPercent: 5,
    });
    expect(board.topUnderOwned[0].points).toBe(5);
  });

  it('ranks ownership risers by percentage points gained', () => {
    const board = buildBreakoutBoard({
      athletes: [athlete('surging', 22, 4), athlete('steady', 30, 29), athlete('falling', 5, 40)],
      pointEvents: [],
      thresholdPercent: 5,
    });
    expect(board.biggestRisers.map((row) => row.athleteId)).toEqual(['surging', 'steady']);
    expect(board.biggestRisers[0].ownershipRise).toBe(18);
  });

  it('reports no rise for an athlete with no previous reading, rather than inventing one', () => {
    const board = buildBreakoutBoard({
      athletes: [athlete('new', 40)],
      pointEvents: [],
      thresholdPercent: 5,
    });
    expect(board.biggestRisers).toEqual([]);
  });

  it('names the best scout pick and how many managers found them', () => {
    const board = buildBreakoutBoard({
      athletes: [athlete('joel', 3), athlete('other', 4)],
      pointEvents: [event('joel', 9), event('other', 2)],
      scoutPicksByAthlete: { joel: 41, other: 6 },
      thresholdPercent: 5,
    });
    expect(board.bestScoutPicks[0]).toMatchObject({
      athleteId: 'joel',
      points: 9,
      scoutedByManagerCount: 41,
    });
  });

  it('excludes athletes nobody scouted from the scout board', () => {
    const board = buildBreakoutBoard({
      athletes: [athlete('joel', 3), athlete('unscouted', 3)],
      pointEvents: [event('joel', 9), event('unscouted', 30)],
      scoutPicksByAthlete: { joel: 41 },
      thresholdPercent: 5,
    });
    expect(board.bestScoutPicks.map((row) => row.athleteId)).toEqual(['joel']);
  });

  it('honours the competition threshold rather than a fixed five percent', () => {
    const board = buildBreakoutBoard({
      athletes: [athlete('eight', 8)],
      pointEvents: [event('eight', 10)],
      thresholdPercent: 10,
    });
    expect(board.topUnderOwned.map((row) => row.athleteId)).toEqual(['eight']);
    expect(board.thresholdPercent).toBe(10);
  });

  it('caps each list at the requested limit', () => {
    const board = buildBreakoutBoard({
      athletes: Array.from({ length: 9 }, (_, index) => athlete(`a_${index}`, 1)),
      pointEvents: Array.from({ length: 9 }, (_, index) => event(`a_${index}`, index + 1)),
      thresholdPercent: 5,
      limit: 3,
    });
    expect(board.topUnderOwned).toHaveLength(3);
  });
});

describe('scout pick percentile', () => {
  it('reports the share of managers a scout pick outscored', () => {
    expect(scoutPickPercentile({ scoutPoints: 9, allManagerRoundTotals: [1, 2, 3, 8, 20] }))
      .toBe(80);
  });

  it('withholds a percentile when there is nothing to compare against', () => {
    expect(scoutPickPercentile({ scoutPoints: 9, allManagerRoundTotals: [] })).toBeNull();
    expect(scoutPickPercentile({ scoutPoints: 9, allManagerRoundTotals: [4] })).toBeNull();
  });
});
