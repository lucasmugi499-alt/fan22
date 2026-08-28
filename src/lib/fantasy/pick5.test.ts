import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCOUT_OWNERSHIP_THRESHOLD_PERCENT,
  fantasyGameMode,
  pick5LineupVersion,
  pick5SupportsSport,
  scoutEligiblePlayers,
  scoutOwnershipThreshold,
  validatePick5Lineup,
} from './pick5';
import { scoreFantasyLineup } from './lineupScoring';
import { FANTASY_SCORING_PROFILES } from './profiles';
import type { FantasyPlayer, FantasyPointEvent } from '@/types/fantasy';

const BEFORE_DEADLINE = '2026-08-03T09:00:00.000Z';
const DEADLINE = '2026-08-03T12:00:00.000Z';

function player(
  athleteId: string,
  realTeamId: string,
  ownershipPercentage = 40,
  overrides: Partial<FantasyPlayer> = {},
): FantasyPlayer {
  return {
    id: `player_${athleteId}`,
    competitionId: 'competition_1',
    athleteId,
    realTeamId,
    sport: 'football',
    position: 'Midfielder',
    positionGroup: 'midfielder',
    availability: 'available',
    verifiedRecentForm: [],
    ownershipPercentage,
    active: true,
    ...overrides,
  };
}

const POOL: FantasyPlayer[] = [
  player('a_1', 'team_1'),
  player('a_2', 'team_1'),
  player('a_3', 'team_2'),
  player('a_4', 'team_3'),
  player('scout', 'team_4', 3),
];

function validate(overrides: Partial<Parameters<typeof validatePick5Lineup>[0]> = {}) {
  return validatePick5Lineup({
    lineup: {
      squadAthleteIds: ['a_1', 'a_2', 'a_3', 'a_4', 'scout'],
      captainAthleteId: 'a_1',
      scoutAthleteId: 'scout',
    },
    players: POOL,
    serverNow: BEFORE_DEADLINE,
    deadlineAt: DEADLINE,
    ...overrides,
  });
}

describe('pick 5 validation', () => {
  it('accepts five picks with a captain and an eligible scout', () => {
    const result = validate();
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.picked).toBe(5);
  });

  it('requires exactly five, so a part-filled lineup cannot be submitted', () => {
    const result = validate({
      lineup: { squadAthleteIds: ['a_1', 'a_2'], captainAthleteId: 'a_1', scoutAthleteId: 'a_2' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Pick exactly 5 athletes.');
    expect(result.picked).toBe(2);
  });

  it('rejects the same athlete twice', () => {
    const result = validate({
      lineup: {
        squadAthleteIds: ['a_1', 'a_1', 'a_3', 'a_4', 'scout'],
        captainAthleteId: 'a_1',
        scoutAthleteId: 'scout',
      },
    });
    expect(result.errors).toContain('Each athlete may appear only once.');
  });

  it('stops the game becoming "pick my own club"', () => {
    const pool = [...POOL, player('a_5', 'team_1')];
    const result = validate({
      players: pool,
      lineup: {
        squadAthleteIds: ['a_1', 'a_2', 'a_5', 'a_4', 'scout'],
        captainAthleteId: 'a_1',
        scoutAthleteId: 'scout',
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Pick no more than 2 athletes from one club.');
  });

  it('requires a captain, and requires them to be one of the five', () => {
    expect(validate({
      lineup: {
        squadAthleteIds: ['a_1', 'a_2', 'a_3', 'a_4', 'scout'],
        captainAthleteId: '',
        scoutAthleteId: 'scout',
      },
    }).errors).toContain('Choose a captain. The captain scores double.');

    expect(validate({
      lineup: {
        squadAthleteIds: ['a_1', 'a_2', 'a_3', 'a_4', 'scout'],
        captainAthleteId: 'someone_else',
        scoutAthleteId: 'scout',
      },
    }).errors).toContain('The captain must be one of your five picks.');
  });

  it('refuses a scout pick that everyone already owns', () => {
    const result = validate({
      lineup: {
        squadAthleteIds: ['a_1', 'a_2', 'a_3', 'a_4', 'scout'],
        captainAthleteId: 'a_1',
        scoutAthleteId: 'a_1',
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('owned by under 5%'))).toBe(true);
  });

  it('reads the ownership ceiling from the competition rather than a constant', () => {
    const result = validate({
      competition: { scoutOwnershipThresholdPercent: 2 },
      lineup: {
        squadAthleteIds: ['a_1', 'a_2', 'a_3', 'a_4', 'scout'],
        captainAthleteId: 'a_1',
        scoutAthleteId: 'scout',
      },
    });
    // The scout is owned by 3%, which is under the default 5 but not under a configured 2.
    expect(result.scoutThresholdPercent).toBe(2);
    expect(result.valid).toBe(false);
  });

  it('refuses a lineup submitted after the deadline', () => {
    expect(validate({ serverNow: '2026-08-03T12:00:00.001Z' }).errors)
      .toContain('The round deadline has passed.');
  });

  it('refuses an unavailable or suspended athlete', () => {
    const pool = [...POOL.slice(0, 4), player('scout', 'team_4', 3, { availability: 'suspended' })];
    expect(validate({ players: pool }).valid).toBe(false);
  });
});

describe('scout eligibility', () => {
  it('offers only athletes under the threshold who can actually play', () => {
    const pool = [
      player('low', 'team_1', 2),
      player('high', 'team_2', 50),
      player('hurt', 'team_3', 1, { availability: 'unavailable' }),
      player('gone', 'team_4', 1, { active: false }),
    ];
    expect(scoutEligiblePlayers(pool, 5).map((entry) => entry.athleteId)).toEqual(['low']);
  });

  it('defaults the threshold, and honours a configured one', () => {
    expect(scoutOwnershipThreshold(null)).toBe(DEFAULT_SCOUT_OWNERSHIP_THRESHOLD_PERCENT);
    expect(scoutOwnershipThreshold({ scoutOwnershipThresholdPercent: 10 })).toBe(10);
    expect(scoutOwnershipThreshold({ scoutOwnershipThresholdPercent: 0 }))
      .toBe(DEFAULT_SCOUT_OWNERSHIP_THRESHOLD_PERCENT);
  });
});

describe('pick 5 scores through the shared engine', () => {
  const profile = FANTASY_SCORING_PROFILES.find((entry) => entry.sport === 'football')!;

  function event(athleteId: string, scoringRuleId: string, basePoints: number): FantasyPointEvent {
    return {
      id: `${athleteId}_${scoringRuleId}`,
      idempotencyKey: `${athleteId}_${scoringRuleId}`,
      competitionId: 'competition_1',
      roundId: 'round_1',
      matchId: 'match_1',
      officialResultVersion: 1,
      athleteId,
      sourceEventId: `${athleteId}_${scoringRuleId}`,
      scoringRuleId,
      quantity: 1,
      basePoints,
      status: 'official',
      createdAt: '2026-08-03T18:00:00.000Z',
    };
  }

  it('doubles the captain and scores all five picks', () => {
    const lineup = pick5LineupVersion({
      id: 'lineup_1',
      fantasyTeamId: 'team_1',
      competitionId: 'competition_1',
      roundId: 'round_1',
      version: 1,
      lineup: {
        squadAthleteIds: ['a_1', 'a_2', 'a_3', 'a_4', 'scout'],
        captainAthleteId: 'a_1',
        scoutAthleteId: 'scout',
      },
      status: 'locked',
      createdAt: '2026-08-03T09:00:00.000Z',
    });
    const score = scoreFantasyLineup({
      competitionId: 'competition_1',
      roundId: 'round_1',
      fantasyTeamId: 'team_1',
      lineup,
      pointEvents: [
        event('a_1', 'appearance', 2),
        event('a_1', 'goal', 5),
        event('a_2', 'appearance', 2),
        event('scout', 'appearance', 2),
        event('scout', 'goal', 4),
      ],
      profile,
      calculatedAt: '2026-08-03T18:00:00.000Z',
    });
    expect(score.basePoints).toBe(15);
    // The captain scored 7, doubled to 14, so the bonus is another 7.
    expect(score.captainBonus).toBe(7);
    expect(score.totalPoints).toBe(22);
  });

  it('forfeits the double when the captain did not appear, with no vice to promote', () => {
    const lineup = pick5LineupVersion({
      id: 'lineup_2',
      fantasyTeamId: 'team_1',
      competitionId: 'competition_1',
      roundId: 'round_1',
      version: 1,
      lineup: {
        squadAthleteIds: ['a_1', 'a_2', 'a_3', 'a_4', 'scout'],
        captainAthleteId: 'a_1',
        scoutAthleteId: 'scout',
      },
      status: 'locked',
      createdAt: '2026-08-03T09:00:00.000Z',
    });
    const score = scoreFantasyLineup({
      competitionId: 'competition_1',
      roundId: 'round_1',
      fantasyTeamId: 'team_1',
      lineup,
      pointEvents: [event('a_2', 'appearance', 2)],
      profile,
      calculatedAt: '2026-08-03T18:00:00.000Z',
    });
    expect(score.captainBonus).toBe(0);
    expect(score.totalPoints).toBe(2);
  });

  it('has no bench and no vice-captain', () => {
    const lineup = pick5LineupVersion({
      id: 'lineup_3',
      fantasyTeamId: 'team_1',
      competitionId: 'competition_1',
      roundId: 'round_1',
      version: 1,
      lineup: {
        squadAthleteIds: ['a_1', 'a_2', 'a_3', 'a_4', 'scout'],
        captainAthleteId: 'a_1',
        scoutAthleteId: 'scout',
      },
      status: 'submitted',
      createdAt: '2026-08-03T09:00:00.000Z',
    });
    expect(lineup.benchAthleteIds).toEqual([]);
    expect(lineup.viceCaptainAthleteId).toBe('');
    expect(lineup.startingAthleteIds).toHaveLength(5);
    expect(lineup.creditsUsed).toBe(0);
    expect(lineup.scoutAthleteId).toBe('scout');
  });
});

describe('game mode', () => {
  it('defaults to the season squad, which is the only game that existed before', () => {
    expect(fantasyGameMode(null)).toBe('season_squad');
    expect(fantasyGameMode({})).toBe('season_squad');
    expect(fantasyGameMode({ gameMode: 'pick5' })).toBe('pick5');
  });

  it('runs on all three sports, including the one the squad game cannot serve', () => {
    expect(pick5SupportsSport('football')).toBe(true);
    expect(pick5SupportsSport('rugby')).toBe(true);
    expect(pick5SupportsSport('basketball')).toBe(true);
  });
});
