import { describe, expect, it } from 'vitest';
import {
  DATA_COLLECTION_PROFILES,
  EVENT_TYPE_DEFINITIONS,
  RUGBY_FANTASY_LITE_PROFILE,
  SPORT_DEFINITIONS,
  STATISTIC_DEFINITIONS,
  buildAthleteMatchStatistics,
  classifyMatchDataCoverage,
  reconstructMatchScore,
  scoreFantasyPointEvents,
  validateCollectionProfile,
  validateFantasyProfileEligibility,
  validateOfficialEvent,
  validateStatisticDefinitions,
  validateUniqueEventCodes,
} from '@/kernel';
import type { OfficialSportEvent } from '@/kernel';

const createdAt = '2026-07-30T12:00:00.000Z';

function event(overrides: Partial<OfficialSportEvent>): OfficialSportEvent {
  return {
    id: 'event_1',
    eventType: 'rugby.try',
    eventSchemaVersion: '1.0.0',
    sportDefinitionVersion: '1.0.0',
    sportId: 'rugby',
    competitionId: 'competition_1',
    seasonId: 'season_1',
    roundId: 'round_1',
    matchId: 'match_1',
    sequence: 1,
    teamId: 'home',
    primaryAthleteId: 'athlete_1',
    payload: {},
    sourceClaimId: 'claim_1',
    submittedByUserId: 'user_1',
    submittedByTeamId: 'home',
    officialResultVersion: 1,
    officialEventVersion: 1,
    verificationStatus: 'official',
    idempotencyKey: 'event_1',
    createdAt,
    finalizedAt: createdAt,
    ...overrides,
  };
}

describe('GoalPlace Sports Data Kernel', () => {
  it('ships internally consistent catalogues and rule fixtures', () => {
    expect(validateUniqueEventCodes(EVENT_TYPE_DEFINITIONS)).toEqual([]);
    for (const profile of DATA_COLLECTION_PROFILES) {
      expect(validateCollectionProfile({ profile, eventTypes: EVENT_TYPE_DEFINITIONS })).toEqual([]);
    }
    expect(validateStatisticDefinitions({
      definitions: STATISTIC_DEFINITIONS,
      eventTypes: EVENT_TYPE_DEFINITIONS,
    })).toEqual([]);
  });

  it('reconstructs a rugby score from official scoring events with a trace', () => {
    const rugby = SPORT_DEFINITIONS.find((definition) => definition.sportId === 'rugby')!;
    const trace = reconstructMatchScore({
      sportDefinition: rugby,
      teams: { homeTeamId: 'home', awayTeamId: 'away' },
      claimedScore: { home: 10, away: 10 },
      events: [
        event({ id: 'home_try', eventType: 'rugby.try', teamId: 'home' }),
        event({ id: 'home_conversion', eventType: 'rugby.conversion_made', teamId: 'home' }),
        event({ id: 'home_penalty', eventType: 'rugby.penalty_goal_made', teamId: 'home' }),
        event({ id: 'away_penalty_try', eventType: 'rugby.penalty_try', teamId: 'away' }),
        event({ id: 'away_drop_goal', eventType: 'rugby.drop_goal_made', teamId: 'away' }),
      ],
    });

    expect(trace).toMatchObject({ home: 10, away: 10, status: 'valid' });
    expect(trace.components.map((component) => component.points)).toEqual([5, 2, 3, 7, 3]);
  });

  it('flags score/event mismatches instead of silently accepting fantasy input', () => {
    const rugby = SPORT_DEFINITIONS.find((definition) => definition.sportId === 'rugby')!;
    const trace = reconstructMatchScore({
      sportDefinition: rugby,
      teams: { homeTeamId: 'home', awayTeamId: 'away' },
      claimedScore: { home: 12, away: 0 },
      events: [event({ eventType: 'rugby.try', teamId: 'home' })],
    });

    expect(trace.status).toBe('inconsistent');
    expect(trace.issues[0]).toContain('does not match');
  });

  it('validates official events against the active collection profile', () => {
    const rugbyProfile = DATA_COLLECTION_PROFILES.find((profile) => profile.id === 'profile.rugby.basic')!;
    const valid = validateOfficialEvent({
      event: event({ eventType: 'rugby.try' }),
      collectionProfile: rugbyProfile,
    });
    const invalid = validateOfficialEvent({
      event: event({ eventType: 'basketball.rebound', sportId: 'basketball' }),
      collectionProfile: rugbyProfile,
    });

    expect(valid.status).toBe('valid');
    expect(invalid.status).toBe('blocked');
    expect(invalid.issues).toHaveLength(2);
  });

  it('builds athlete match statistics from official events', () => {
    const projection = buildAthleteMatchStatistics({
      athleteId: 'athlete_1',
      matchId: 'match_1',
      competitionId: 'competition_1',
      seasonId: 'season_1',
      definitions: STATISTIC_DEFINITIONS,
      events: [
        event({ id: 'try_1', eventType: 'rugby.try' }),
        event({ id: 'try_2', eventType: 'rugby.try' }),
        event({ id: 'yellow_1', eventType: 'rugby.yellow_card' }),
      ],
      metadata: {
        projectionVersion: '1',
        rulePackVersion: '1.0.0',
        sourceVersionHash: 'hash',
        rebuiltAt: createdAt,
      },
    });

    expect(projection.values['rugby.tries']).toBe(2);
    expect(projection.values['rugby.yellow_cards']).toBe(1);
    expect(projection.sourceEventIds).toEqual(['try_1', 'try_2', 'yellow_1']);
  });

  it('blocks fantasy profiles when collection does not reliably collect a referenced statistic', () => {
    const rugbyProfile = DATA_COLLECTION_PROFILES.find((profile) => profile.id === 'profile.rugby.basic')!;
    const result = validateFantasyProfileEligibility({
      profile: RUGBY_FANTASY_LITE_PROFILE,
      collectionProfile: {
        ...rugbyProfile,
        fantasyEligibleStatisticCodes: rugbyProfile.fantasyEligibleStatisticCodes.filter(
          (code) => code !== 'rugby.drop_goals_made',
        ),
      },
      statisticDefinitions: STATISTIC_DEFINITIONS,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      'Fantasy rule drop_goal references statistic rugby.drop_goals_made not eligible in profile.rugby.basic.',
    );
  });

  it('creates traceable official fantasy point events from statistic projections', () => {
    const events = scoreFantasyPointEvents({
      fantasyCompetitionId: 'fantasy_1',
      scoringProfile: RUGBY_FANTASY_LITE_PROFILE,
      roundId: 'round_1',
      matchId: 'match_1',
      officialResultVersion: 2,
      officialEventVersion: 3,
      athleteId: 'athlete_1',
      statistics: {
        'rugby.appearances': 1,
        'rugby.tries': 1,
        'rugby.yellow_cards': 1,
      },
      status: 'official',
      createdAt,
    });

    expect(events.map((point) => point.basePoints)).toEqual([2, 5, -1]);
    expect(events.every((point) => point.officialEventVersion === 3)).toBe(true);
  });

  it('classifies demo data coverage honestly', () => {
    const coverage = classifyMatchDataCoverage({
      sportId: 'rugby',
      hasOfficialScore: true,
      events: [event({ eventType: 'rugby.try' })],
      requiredEventTypes: ['rugby.try', 'rugby.conversion_made'],
      rosterCoveragePercent: 70,
      scoreReconciled: false,
      statisticLevel: 'basic',
    });

    expect(coverage.fantasyEligible).toBe(false);
    expect(coverage.eventCoverage).toBe('partial');
    expect(coverage.qualityIssues).toEqual([
      'Missing required rugby event types: rugby.conversion_made.',
      'Roster coverage is below 80%.',
      'Event score does not reconcile with the official result.',
    ]);
  });
});
