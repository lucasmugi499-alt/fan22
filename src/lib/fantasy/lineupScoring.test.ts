import { describe, expect, it } from 'vitest';
import type {
  FantasyLineupVersion,
  FantasyPointEvent,
} from '@/types/fantasy';
import { FANTASY_SCORING_PROFILES } from './profiles';
import { scoreFantasyLineup } from './lineupScoring';
import { buildFantasyCorrection, fantasyMatchResolutionPolicy } from './corrections';

const profile = FANTASY_SCORING_PROFILES.find((item) => item.sport === 'rugby')!;
const lineup: FantasyLineupVersion = {
  id: 'lineup_1',
  fantasyTeamId: 'team_1',
  competitionId: 'competition_1',
  roundId: 'round_1',
  version: 1,
  squadAthleteIds: ['captain', 'vice', 'other'],
  startingAthleteIds: ['captain', 'vice', 'other'],
  benchAthleteIds: [],
  captainAthleteId: 'captain',
  viceCaptainAthleteId: 'vice',
  creditsUsed: 20,
  status: 'locked',
  createdAt: '2026-07-29T00:00:00.000Z',
};

function event(
  athleteId: string,
  rule: string,
  points: number,
  status: FantasyPointEvent['status'] = 'official',
  version = 1,
): FantasyPointEvent {
  return {
    id: `${athleteId}_${rule}_${version}`,
    idempotencyKey: `${athleteId}_${rule}_${version}`,
    competitionId: 'competition_1',
    roundId: 'round_1',
    matchId: 'match_1',
    officialResultVersion: version,
    athleteId,
    sourceEventId: `${athleteId}_${rule}`,
    scoringRuleId: rule,
    quantity: 1,
    basePoints: points,
    status,
    createdAt: '2026-07-29T00:00:00.000Z',
  };
}

describe('fantasy lineup scoring and corrections', () => {
  it('applies the captain multiplier only after an official appearance', () => {
    const score = scoreFantasyLineup({
      competitionId: 'competition_1',
      roundId: 'round_1',
      fantasyTeamId: 'team_1',
      lineup,
      pointEvents: [
        event('captain', 'appearance', 2),
        event('captain', 'try', 5),
        event('vice', 'appearance', 2),
        event('other', 'try', 5, 'provisional'),
      ],
      profile,
      calculatedAt: '2026-07-29T00:00:00.000Z',
    });
    /*
     * The captain doubles rather than adding a half. In a low-event grassroots game a 1.5x
     * captain is not a decision, it is a rounding difference; doubling creates enough swing
     * that the one choice a manager makes each round is worth thinking about.
     */
    expect(score).toMatchObject({ basePoints: 9, captainBonus: 7, totalPoints: 16 });
  });

  it('falls back to vice-captain only when the captain did not play', () => {
    const score = scoreFantasyLineup({
      competitionId: 'competition_1',
      roundId: 'round_1',
      fantasyTeamId: 'team_1',
      lineup,
      pointEvents: [event('vice', 'appearance', 2), event('vice', 'try', 5)],
      profile,
      calculatedAt: '2026-07-29T00:00:00.000Z',
    });
    expect(score).toMatchObject({ basePoints: 7, captainBonus: 7, totalPoints: 14 });
  });

  it('supersedes old events and records visible old/new totals after a correction', () => {
    const result = buildFantasyCorrection({
      competitionId: 'competition_1',
      roundId: 'round_1',
      matchId: 'match_1',
      previousVersion: 1,
      newVersion: 2,
      previousEvents: [event('captain', 'appearance', 2), event('captain', 'try', 5)],
      replacementEvents: [event('captain', 'appearance', 2, 'official', 2)],
      lineups: [lineup],
      profile,
      reason: 'Official result version 2 removed the try.',
      createdAt: '2026-07-30T00:00:00.000Z',
    });
    expect(result.supersededEvents.every((item) => item.status === 'superseded')).toBe(true);
    expect(result.correction).toMatchObject({
      affectedFantasyTeamIds: ['team_1'],
      oldTotals: { team_1: 14 },
      newTotals: { team_1: 4 },
    });
  });

  it('defines postponed and abandoned match behavior without changing locked squads', () => {
    expect(fantasyMatchResolutionPolicy('postponed', true)).toMatchObject({
      awardPoints: false,
      preserveLockedLineup: true,
      action: 'score_when_rescheduled',
    });
    expect(fantasyMatchResolutionPolicy('abandoned', true)).toMatchObject({
      awardPoints: false,
      preserveLockedLineup: true,
      action: 'void_points',
    });
  });
});
