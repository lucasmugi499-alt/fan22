import { describe, expect, it } from 'vitest';
import type {
  FantasyCompetition,
  FantasyOfficialAthletePerformance,
} from '@/types/fantasy';
import { FANTASY_SCORING_PROFILES } from './profiles';
import {
  enabledFantasyRules,
  mergeOfficialFantasyRoundEvents,
  scoreOfficialFantasyPerformance,
  totalOfficialFantasyPoints,
} from './scoring';

const rugbyProfile = FANTASY_SCORING_PROFILES.find((profile) => profile.sport === 'rugby')!;
const competition: FantasyCompetition = {
  id: 'rugby_pilot',
  name: 'GoalPlace Rugby Fantasy Pilot',
  shortName: 'Rugby Pilot',
  sport: 'rugby',
  variant: 'rugby_15s',
  leagueId: 'league_rugby',
  seasonId: 'season_rugby',
  scoringProfileId: rugbyProfile.id,
  scoringProfileVersion: 1,
  squadRulesId: 'rugby_rules',
  dataLevel: 'advanced',
  recordedStatKeys: rugbyProfile.rules.map((rule) => rule.requiredStatKey),
  status: 'active',
  isFreeToPlay: true,
  creditsLabel: 'Fantasy Credits',
  createdAt: '2026-07-29T00:00:00.000Z',
};
const performance: FantasyOfficialAthletePerformance = {
  id: 'performance_1',
  matchId: 'match_1',
  athleteId: 'athlete_1',
  realTeamId: 'team_1',
  sport: 'rugby',
  position: 'Fly-half',
  positionGroup: 'half_back',
  officialResultVersion: 1,
  verificationStatus: 'verified',
  dataLevel: 'advanced',
  activeSquad: true,
  didPlay: true,
  minutesPlayed: 65,
  teamWon: true,
  playerOfMatch: true,
  stats: {
    try: 1,
    conversion: 2,
    penalty_goal: 1,
    drop_goal: 1,
    assist: 1,
    yellow_card: 1,
    red_card: 0,
  },
  sourceEventIds: {},
};

describe('multi-sport fantasy scoring', () => {
  it('implements the Rugby Fantasy Lite profile exactly from verified performance data', () => {
    const events = scoreOfficialFantasyPerformance({
      competition,
      profile: rugbyProfile,
      roundId: 'round_1',
      performance,
      createdAt: '2026-07-29T12:00:00.000Z',
    });
    expect(totalOfficialFantasyPoints(events)).toBe(25);
    expect(events.every((event) => event.idempotencyKey.includes('match_1:1:athlete_1'))).toBe(true);
  });

  it('awards zero when an athlete did not play and was not in the active squad', () => {
    const events = scoreOfficialFantasyPerformance({
      competition,
      profile: rugbyProfile,
      roundId: 'round_1',
      performance: {
        ...performance,
        activeSquad: false,
        didPlay: false,
        minutesPlayed: 0,
        teamWon: false,
        playerOfMatch: false,
        stats: {},
      },
      createdAt: '2026-07-29T12:00:00.000Z',
    });
    expect(totalOfficialFantasyPoints(events)).toBe(0);
  });

  it('does not treat scorer-only records as complete appearance coverage', () => {
    const events = scoreOfficialFantasyPerformance({
      competition: {
        ...competition,
        recordedStatKeys: ['active_squad', 'appearance', 'try', 'win_participation'],
      },
      profile: rugbyProfile,
      roundId: 'round_1',
      performance: {
        ...performance,
        dataCoverage: 'scorer_only',
      },
      createdAt: '2026-07-29T12:00:00.000Z',
    });
    expect(events.map((event) => event.scoringRuleId)).toEqual(['try']);
  });

  it('allows match-squad basic records to score participation without richer box-score stats', () => {
    const events = scoreOfficialFantasyPerformance({
      competition: {
        ...competition,
        dataLevel: 'basic',
        recordedStatKeys: ['active_squad', 'appearance', 'try', 'win_participation', 'yellow_card'],
      },
      profile: rugbyProfile,
      roundId: 'round_1',
      performance: {
        ...performance,
        dataCoverage: 'match_squad_basic',
      },
      createdAt: '2026-07-29T12:00:00.000Z',
    });

    expect(events.map((event) => event.scoringRuleId)).toEqual([
      'active_squad',
      'appearance',
      'try',
      'win_participation',
    ]);
  });

  it('scores richer verified stat-line records when the competition records those stats', () => {
    const events = scoreOfficialFantasyPerformance({
      competition: {
        ...competition,
        dataLevel: 'standard',
        recordedStatKeys: ['active_squad', 'appearance', 'try', 'conversion', 'penalty_goal', 'win_participation', 'yellow_card', 'minutes_played'],
      },
      profile: rugbyProfile,
      roundId: 'round_1',
      performance: {
        ...performance,
        dataCoverage: 'verified_stat_line',
        minutesPlayed: 66,
        stats: {
          ...performance.stats,
          conversion: 1,
          penalty_goal: 1,
          yellow_card: 1,
          minutes_played: 66,
        },
        sourceEventIds: {
          ...performance.sourceEventIds,
          conversion: 'event_conversion',
          penalty_goal: 'event_penalty',
          yellow_card: 'event_yellow',
          minutes_played: 'event_minutes',
        },
      },
      createdAt: '2026-07-29T12:00:00.000Z',
    });

    expect(events.map((event) => event.scoringRuleId)).toEqual([
      'active_squad',
      'appearance',
      'minimum_duration',
      'try',
      'conversion',
      'penalty_goal',
      'win_participation',
      'yellow_card',
    ]);
  });

  it('does not count provisional points in official totals', () => {
    const provisional = scoreOfficialFantasyPerformance({
      competition,
      profile: rugbyProfile,
      roundId: 'round_1',
      performance,
      status: 'provisional',
      createdAt: '2026-07-29T12:00:00.000Z',
    });
    expect(provisional.length).toBeGreaterThan(0);
    expect(totalOfficialFantasyPoints(provisional)).toBe(0);
  });

  it('disables rules above the competition data level or missing a reliable stat', () => {
    const basic = {
      ...competition,
      dataLevel: 'basic' as const,
      recordedStatKeys: ['active_squad', 'appearance', 'try', 'win_participation'],
    };
    const enabled = enabledFantasyRules(basic, rugbyProfile).map((rule) => rule.id);
    expect(enabled).toEqual(['active_squad', 'appearance', 'try', 'win_participation']);
  });

  it('rejects a cross-sport scoring profile', () => {
    const football = FANTASY_SCORING_PROFILES.find((profile) => profile.sport === 'football')!;
    expect(() => scoreOfficialFantasyPerformance({
      competition,
      profile: football,
      roundId: 'round_1',
      performance,
      createdAt: '2026-07-29T12:00:00.000Z',
    })).toThrow('must match');
  });

  it('generates stable idempotency keys for a duplicate finalizer delivery', () => {
    const input = {
      competition,
      profile: rugbyProfile,
      roundId: 'round_1',
      performance,
      createdAt: '2026-07-29T12:00:00.000Z',
    };
    const first = scoreOfficialFantasyPerformance(input);
    const retry = scoreOfficialFantasyPerformance(input);
    expect(retry.map((event) => event.idempotencyKey)).toEqual(
      first.map((event) => event.idempotencyKey),
    );
    expect(new Set(first.map((event) => event.idempotencyKey)).size).toBe(first.length);
  });

  it('accumulates every fixture in a round and replaces only the corrected match version', () => {
    const matchOneV1 = scoreOfficialFantasyPerformance({
      competition,
      profile: rugbyProfile,
      roundId: 'round_1',
      performance,
      createdAt: '2026-07-29T12:00:00.000Z',
    });
    const matchTwo = scoreOfficialFantasyPerformance({
      competition,
      profile: rugbyProfile,
      roundId: 'round_1',
      performance: { ...performance, id: 'performance_2', matchId: 'match_2' },
      createdAt: '2026-07-29T13:00:00.000Z',
    });
    const accumulated = mergeOfficialFantasyRoundEvents({
      existingEvents: matchOneV1,
      matchId: 'match_2',
      officialResultVersion: 1,
      replacementEvents: matchTwo,
    });
    expect(totalOfficialFantasyPoints(accumulated)).toBe(50);

    const matchOneV2 = scoreOfficialFantasyPerformance({
      competition,
      profile: rugbyProfile,
      roundId: 'round_1',
      performance: {
        ...performance,
        officialResultVersion: 2,
        stats: {},
        playerOfMatch: false,
      },
      status: 'corrected',
      createdAt: '2026-07-30T12:00:00.000Z',
    });
    const corrected = mergeOfficialFantasyRoundEvents({
      existingEvents: accumulated,
      matchId: 'match_1',
      officialResultVersion: 2,
      replacementEvents: matchOneV2,
    });
    expect(corrected.some((event) => event.matchId === 'match_2')).toBe(true);
    expect(corrected.filter((event) => event.matchId === 'match_1').every(
      (event) => event.officialResultVersion === 2,
    )).toBe(true);
  });
});
