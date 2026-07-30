import { describe, expect, it } from 'vitest';
import type {
  FantasyLineupVersion,
  FantasyPlayer,
  FantasyPlayerPrice,
} from '@/types/fantasy';
import { FANTASY_SQUAD_RULES } from './profiles';
import {
  canCreateFantasyTeam,
  fantasyRecordHasFinancialFields,
  validateFantasySquad,
} from './squad';

const rules = FANTASY_SQUAD_RULES.find((item) => item.variant === 'rugby_15s')!;
const groupCounts = { front_row: 5, second_row: 3, back_row: 4, half_back: 2, back: 9 };
const players: FantasyPlayer[] = Object.entries(groupCounts).flatMap(([positionGroup, count]) =>
  Array.from({ length: count }, (_, index) => {
    const athleteId = `${positionGroup}_${index + 1}`;
    return {
      id: `player_${athleteId}`,
      competitionId: 'rugby_pilot',
      athleteId,
      realTeamId: `team_${Math.floor(index / 2)}_${positionGroup}`,
      sport: 'rugby' as const,
      position: positionGroup,
      positionGroup,
      availability: 'available' as const,
      verifiedRecentForm: [],
      ownershipPercentage: 5,
      active: true,
    };
  }),
);
const prices: FantasyPlayerPrice[] = players.map((player) => ({
  id: `price_${player.athleteId}`,
  competitionId: 'rugby_pilot',
  athleteId: player.athleteId,
  credits: 5,
  version: 1,
  status: 'published',
  publishedAt: '2026-07-29T00:00:00.000Z',
}));
const squad = players.map((player) => player.athleteId);
const lineup: FantasyLineupVersion = {
  id: 'lineup_1',
  fantasyTeamId: 'fantasy_team_1',
  competitionId: 'rugby_pilot',
  roundId: 'round_1',
  version: 1,
  squadAthleteIds: squad,
  startingAthleteIds: squad.slice(0, 15),
  benchAthleteIds: squad.slice(15),
  captainAthleteId: squad[0],
  viceCaptainAthleteId: squad[1],
  creditsUsed: 115,
  status: 'submitted',
  createdAt: '2026-07-29T00:00:00.000Z',
};

function validate(overrides: Partial<FantasyLineupVersion> = {}, nextPrices = prices) {
  return validateFantasySquad({
    lineup: { ...lineup, ...overrides },
    players,
    prices: nextPrices,
    rules,
    serverNow: '2026-08-01T10:00:00.000Z',
    deadlineAt: '2026-08-01T12:00:00.000Z',
  });
}

describe('fantasy squad validation', () => {
  it('accepts a valid Rugby 15s squad', () => {
    expect(validate()).toEqual({
      valid: true,
      errors: [],
      creditsUsed: 115,
      creditsRemaining: 5,
    });
  });

  it('rejects budget, duplicate, position, real-team, and captain violations', () => {
    expect(validate({}, prices.map((price) => ({ ...price, credits: 6 })))).toMatchObject({ valid: false });
    expect(validate({ squadAthleteIds: [...squad.slice(0, -1), squad[0]] }).errors).toContain('Each athlete may appear only once.');
    expect(validate({
      squadAthleteIds: [...squad.slice(0, -1), 'front_row_1'],
    }).valid).toBe(false);
    const crowded = players.map((player, index) => ({
      ...player,
      realTeamId: index < 5 ? 'same_team' : player.realTeamId,
    }));
    expect(validateFantasySquad({
      lineup,
      players: crowded,
      prices,
      rules,
      serverNow: '2026-08-01T10:00:00.000Z',
      deadlineAt: '2026-08-01T12:00:00.000Z',
    }).errors).toContain('Select no more than 4 athletes from one real team.');
    expect(validate({ captainAthleteId: squad[20] }).errors).toContain('Captain must be in the starting lineup.');
  });

  it('uses trusted server time for deadline locking', () => {
    const result = validateFantasySquad({
      lineup,
      players,
      prices,
      rules,
      serverNow: '2026-08-01T12:00:00.000Z',
      deadlineAt: '2026-08-01T12:00:00.000Z',
    });
    expect(result.errors).toContain('The round deadline has passed.');
  });

  it('enforces one fantasy team per user and competition', () => {
    expect(canCreateFantasyTeam([], 'rugby_pilot', 'fan_1')).toBe(true);
    expect(canCreateFantasyTeam([{
      id: 'team_1',
      competitionId: 'rugby_pilot',
      userId: 'fan_1',
      name: 'Kampala XV',
      conflictRoles: [],
      createdAt: '',
      updatedAt: '',
    }], 'rugby_pilot', 'fan_1')).toBe(false);
  });

  it('rejects financial and GoalPlace engagement fields from fantasy records', () => {
    expect(fantasyRecordHasFinancialFields(lineup)).toBe(false);
    expect(fantasyRecordHasFinancialFields({ ...lineup, entryFee: 5000 })).toBe(true);
    expect(fantasyRecordHasFinancialFields({ ...lineup, goalPlacePoints: 50 })).toBe(true);
  });
});
