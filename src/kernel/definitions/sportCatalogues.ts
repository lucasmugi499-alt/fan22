import type {
  DataCollectionProfile,
  EngagementPointProfile,
  EventTypeDefinition,
  FantasyScoringProfile,
  SportDefinition,
  StatisticDefinition,
} from '@/kernel/types';

const SYSTEM_USER_ID = 'system:goalplace-kernel';
const CREATED_AT = '2026-07-30T00:00:00.000Z';

export const FOOTBALL_BASIC_EVENTS = [
  'football.active_squad',
  'football.lineup_named',
  'football.starter',
  'football.substitution_on',
  'football.substitution_off',
  'football.goal',
  'football.own_goal',
  'football.assist',
  'football.yellow_card',
  'football.second_yellow_card',
  'football.red_card',
  'football.penalty_scored',
  'football.penalty_missed',
  'football.player_of_match',
] as const;

export const BASKETBALL_BASIC_EVENTS = [
  'basketball.active_squad',
  'basketball.appearance',
  'basketball.starter',
  'basketball.minutes_played',
  'basketball.points',
  'basketball.offensive_rebounds',
  'basketball.defensive_rebounds',
  'basketball.assists',
  'basketball.steals',
  'basketball.blocks',
  'basketball.turnovers',
  'basketball.personal_fouls',
  'basketball.technical_fouls',
] as const;

export const BASKETBALL_STANDARD_EVENTS = [
  'basketball.free_throw_made',
  'basketball.free_throw_missed',
  'basketball.two_point_made',
  'basketball.two_point_missed',
  'basketball.three_point_made',
  'basketball.three_point_missed',
  'basketball.rebound',
  'basketball.assist',
  'basketball.steal',
  'basketball.block',
  'basketball.turnover',
  'basketball.foul',
  'basketball.substitution',
  'basketball.timeout',
] as const;

export const RUGBY_BASIC_EVENTS = [
  'rugby.active_squad',
  'rugby.lineup_named',
  'rugby.starter',
  'rugby.substitution_on',
  'rugby.substitution_off',
  'rugby.try',
  'rugby.penalty_try',
  'rugby.conversion_made',
  'rugby.conversion_missed',
  'rugby.penalty_goal_made',
  'rugby.penalty_goal_missed',
  'rugby.drop_goal_made',
  'rugby.drop_goal_missed',
  'rugby.yellow_card',
  'rugby.red_card',
  'rugby.player_of_match',
] as const;

function baseVersioned<T extends { sportId: 'football' | 'basketball' | 'rugby' }>(
  id: string,
  sportId: T['sportId'],
  changeSummary: string,
) {
  return {
    id,
    version: '1.0.0',
    schemaVersion: '2020-12',
    status: 'active' as const,
    sportId,
    effectiveFrom: '2026-07-30',
    contentHash: `${id}:1.0.0`,
    createdByUserId: SYSTEM_USER_ID,
    approvedByUserIds: [SYSTEM_USER_ID],
    createdAt: CREATED_AT,
    approvedAt: CREATED_AT,
    changeSummary,
  };
}

export const SPORT_DEFINITIONS: SportDefinition[] = [
  {
    ...baseVersioned('sport.football.basic', 'football', 'Initial GoalPlace football sport definition.'),
    name: 'Football',
    variants: ['association_football'],
    legalScoringEvents: [
      { eventType: 'football.goal', points: 1, description: 'Goal credited to the attacking team.' },
      { eventType: 'football.own_goal', points: 1, description: 'Goal credited to the opponent.' },
      { eventType: 'football.penalty_scored', points: 1, description: 'Penalty kick goal.' },
    ],
  },
  {
    ...baseVersioned('sport.basketball.basic', 'basketball', 'Initial GoalPlace basketball sport definition.'),
    name: 'Basketball',
    variants: ['fiba_grassroots'],
    legalScoringEvents: [
      { eventType: 'basketball.free_throw_made', points: 1, description: 'Made free throw.' },
      { eventType: 'basketball.two_point_made', points: 2, description: 'Made two point field goal.' },
      { eventType: 'basketball.three_point_made', points: 3, description: 'Made three point field goal.' },
    ],
  },
  {
    ...baseVersioned('sport.rugby.basic', 'rugby', 'Initial GoalPlace rugby union sport definition.'),
    name: 'Rugby',
    variants: ['rugby_union_15s'],
    legalScoringEvents: [
      { eventType: 'rugby.try', points: 5, description: 'Try.' },
      { eventType: 'rugby.penalty_try', points: 7, description: 'Penalty try.' },
      { eventType: 'rugby.conversion_made', points: 2, description: 'Successful conversion.' },
      { eventType: 'rugby.penalty_goal_made', points: 3, description: 'Successful penalty goal.' },
      { eventType: 'rugby.drop_goal_made', points: 3, description: 'Successful drop goal.' },
    ],
  },
];

export const EVENT_TYPE_DEFINITIONS: EventTypeDefinition[] = [
  ...FOOTBALL_BASIC_EVENTS.map((code) => ({
    code,
    sportId: 'football' as const,
    minimumCollectionLevel: 'basic' as const,
    payloadSchemaVersion: '1.0.0',
    scoring: code === 'football.goal' || code === 'football.penalty_scored'
      ? { points: 1, attribution: 'team' as const }
      : code === 'football.own_goal'
        ? { points: 1, attribution: 'opponent' as const }
        : undefined,
  })),
  ...BASKETBALL_BASIC_EVENTS.map((code) => ({
    code,
    sportId: 'basketball' as const,
    minimumCollectionLevel: 'basic' as const,
    payloadSchemaVersion: '1.0.0',
  })),
  ...BASKETBALL_STANDARD_EVENTS.map((code) => ({
    code,
    sportId: 'basketball' as const,
    minimumCollectionLevel: 'standard' as const,
    payloadSchemaVersion: '1.0.0',
    scoring: code === 'basketball.free_throw_made'
      ? { points: 1, attribution: 'team' as const }
      : code === 'basketball.two_point_made'
        ? { points: 2, attribution: 'team' as const }
        : code === 'basketball.three_point_made'
          ? { points: 3, attribution: 'team' as const }
          : undefined,
  })),
  ...RUGBY_BASIC_EVENTS.map((code) => ({
    code,
    sportId: 'rugby' as const,
    minimumCollectionLevel: 'basic' as const,
    payloadSchemaVersion: '1.0.0',
    scoring: code === 'rugby.try'
      ? { points: 5, attribution: 'team' as const }
      : code === 'rugby.penalty_try'
        ? { points: 7, attribution: 'team' as const }
        : code === 'rugby.conversion_made'
          ? { points: 2, attribution: 'team' as const }
          : code === 'rugby.penalty_goal_made' || code === 'rugby.drop_goal_made'
            ? { points: 3, attribution: 'team' as const }
            : undefined,
  })),
];

export const DATA_COLLECTION_PROFILES: DataCollectionProfile[] = [
  {
    ...baseVersioned('profile.football.basic', 'football', 'Football basic match events and simple fantasy eligibility.'),
    level: 'basic',
    requiredEventTypes: ['football.goal'],
    optionalEventTypes: FOOTBALL_BASIC_EVENTS.filter((code) => code !== 'football.goal'),
    unsupportedEventTypes: [],
    requiredMatchFields: ['homeTeamId', 'awayTeamId', 'officialScore'],
    requiredRosterFields: ['athleteId', 'teamId', 'seasonId'],
    requiredAthleteStats: ['football.goals'],
    minimumCoverage: { rosterCoveragePercent: 80, eventCoveragePercent: 90, reportingCompliancePercent: 90 },
    fantasyEligibleStatisticCodes: ['football.appearances', 'football.goals', 'football.assists'],
  },
  {
    ...baseVersioned('profile.basketball.basic', 'basketball', 'Basketball basic box score profile.'),
    level: 'basic',
    requiredEventTypes: ['basketball.appearance', 'basketball.points'],
    optionalEventTypes: BASKETBALL_BASIC_EVENTS.filter((code) => !['basketball.appearance', 'basketball.points'].includes(code)),
    unsupportedEventTypes: [...BASKETBALL_STANDARD_EVENTS],
    requiredMatchFields: ['homeTeamId', 'awayTeamId', 'officialScore'],
    requiredRosterFields: ['athleteId', 'teamId', 'seasonId'],
    requiredAthleteStats: ['basketball.points'],
    minimumCoverage: { rosterCoveragePercent: 90, eventCoveragePercent: 95, reportingCompliancePercent: 90 },
    fantasyEligibleStatisticCodes: ['basketball.appearances', 'basketball.points'],
  },
  {
    ...baseVersioned('profile.rugby.basic', 'rugby', 'Rugby basic scoring and cards profile.'),
    level: 'basic',
    requiredEventTypes: ['rugby.try', 'rugby.conversion_made', 'rugby.penalty_goal_made', 'rugby.drop_goal_made'],
    optionalEventTypes: RUGBY_BASIC_EVENTS.filter((code) => ![
      'rugby.try',
      'rugby.conversion_made',
      'rugby.penalty_goal_made',
      'rugby.drop_goal_made',
    ].includes(code)),
    unsupportedEventTypes: [],
    requiredMatchFields: ['homeTeamId', 'awayTeamId', 'officialScore'],
    requiredRosterFields: ['athleteId', 'teamId', 'seasonId'],
    requiredAthleteStats: ['rugby.appearances', 'rugby.tries'],
    minimumCoverage: { rosterCoveragePercent: 85, eventCoveragePercent: 95, reportingCompliancePercent: 90 },
    fantasyEligibleStatisticCodes: [
      'rugby.appearances',
      'rugby.tries',
      'rugby.conversions_made',
      'rugby.penalty_goals_made',
      'rugby.drop_goals_made',
      'rugby.player_of_match',
      'rugby.win_participation',
      'rugby.yellow_cards',
      'rugby.red_cards',
    ],
  },
];

export const STATISTIC_DEFINITIONS: StatisticDefinition[] = [
  {
    ...baseVersioned('stat.football.appearances', 'football', 'Football appearance count from verified active match squad.'),
    code: 'football.appearances',
    entityType: 'athlete',
    valueType: 'integer',
    sourceEventTypes: ['football.active_squad', 'football.starter', 'football.substitution_on'],
    aggregation: 'conditional_count',
    minimumCollectionLevel: 'basic',
  },
  {
    ...baseVersioned('stat.basketball.appearances', 'basketball', 'Basketball appearance count from verified active match squad.'),
    code: 'basketball.appearances',
    entityType: 'athlete',
    valueType: 'integer',
    sourceEventTypes: ['basketball.active_squad', 'basketball.appearance', 'basketball.starter'],
    aggregation: 'conditional_count',
    minimumCollectionLevel: 'basic',
  },
  {
    ...baseVersioned('stat.rugby.appearances', 'rugby', 'Rugby appearance count from official participation.'),
    code: 'rugby.appearances',
    entityType: 'athlete',
    valueType: 'integer',
    sourceEventTypes: ['rugby.active_squad', 'rugby.starter', 'rugby.substitution_on'],
    aggregation: 'conditional_count',
    minimumCollectionLevel: 'basic',
  },
  {
    ...baseVersioned('stat.rugby.tries', 'rugby', 'Rugby tries from official try events.'),
    code: 'rugby.tries',
    entityType: 'athlete',
    valueType: 'integer',
    sourceEventTypes: ['rugby.try'],
    aggregation: 'count',
    minimumCollectionLevel: 'basic',
  },
  {
    ...baseVersioned('stat.rugby.conversions_made', 'rugby', 'Rugby successful conversions.'),
    code: 'rugby.conversions_made',
    entityType: 'athlete',
    valueType: 'integer',
    sourceEventTypes: ['rugby.conversion_made'],
    aggregation: 'count',
    minimumCollectionLevel: 'basic',
  },
  {
    ...baseVersioned('stat.rugby.penalty_goals_made', 'rugby', 'Rugby successful penalty goals.'),
    code: 'rugby.penalty_goals_made',
    entityType: 'athlete',
    valueType: 'integer',
    sourceEventTypes: ['rugby.penalty_goal_made'],
    aggregation: 'count',
    minimumCollectionLevel: 'basic',
  },
  {
    ...baseVersioned('stat.rugby.drop_goals_made', 'rugby', 'Rugby successful drop goals.'),
    code: 'rugby.drop_goals_made',
    entityType: 'athlete',
    valueType: 'integer',
    sourceEventTypes: ['rugby.drop_goal_made'],
    aggregation: 'count',
    minimumCollectionLevel: 'basic',
  },
  {
    ...baseVersioned('stat.rugby.player_of_match', 'rugby', 'Rugby player of the match editorial award.'),
    code: 'rugby.player_of_match',
    entityType: 'athlete',
    valueType: 'integer',
    sourceEventTypes: ['rugby.player_of_match'],
    aggregation: 'count',
    minimumCollectionLevel: 'basic',
  },
  {
    ...baseVersioned('stat.rugby.yellow_cards', 'rugby', 'Rugby yellow cards.'),
    code: 'rugby.yellow_cards',
    entityType: 'athlete',
    valueType: 'integer',
    sourceEventTypes: ['rugby.yellow_card'],
    aggregation: 'count',
    minimumCollectionLevel: 'basic',
  },
  {
    ...baseVersioned('stat.rugby.red_cards', 'rugby', 'Rugby red cards.'),
    code: 'rugby.red_cards',
    entityType: 'athlete',
    valueType: 'integer',
    sourceEventTypes: ['rugby.red_card'],
    aggregation: 'count',
    minimumCollectionLevel: 'basic',
  },
];

export const RUGBY_FANTASY_LITE_PROFILE: FantasyScoringProfile = {
  ...baseVersioned('fantasy.rugby-lite', 'rugby', 'GoalPlace Rugby Fantasy Lite pilot profile.'),
  name: 'GoalPlace Rugby Fantasy Lite',
  minimumDataCollectionLevel: 'basic',
  captainMultiplier: 1.5,
  viceCaptainFallback: true,
  roundingMode: 'none',
  rules: [
    { id: 'appearance', statisticCode: 'rugby.appearances', operator: 'per_unit', points: 2, maximumAward: 2 },
    { id: 'try', statisticCode: 'rugby.tries', operator: 'per_unit', points: 5 },
    { id: 'conversion', statisticCode: 'rugby.conversions_made', operator: 'per_unit', points: 2 },
    { id: 'penalty_goal', statisticCode: 'rugby.penalty_goals_made', operator: 'per_unit', points: 3 },
    { id: 'drop_goal', statisticCode: 'rugby.drop_goals_made', operator: 'per_unit', points: 3 },
    { id: 'player_of_match', statisticCode: 'rugby.player_of_match', operator: 'per_unit', points: 3, maximumAward: 3 },
    { id: 'win_participation', statisticCode: 'rugby.win_participation', operator: 'per_unit', points: 1, maximumAward: 1 },
    { id: 'yellow_card', statisticCode: 'rugby.yellow_cards', operator: 'per_unit', points: -1 },
    { id: 'red_card', statisticCode: 'rugby.red_cards', operator: 'per_unit', points: -4 },
  ],
};

export const ENGAGEMENT_POINT_PROFILE: EngagementPointProfile = {
  ...baseVersioned('engagement.community-v1', 'football', 'Versioned Community Points profile shared across sports.'),
  dailyCap: 100,
  weeklyCap: 350,
  actions: [
    { actionCode: 'profile_completed', award: 20, eligibilityPolicy: 'once_per_user', repeatPolicy: 'never' },
    { actionCode: 'first_fantasy_team_submitted', award: 20, eligibilityPolicy: 'fantasy_competition_member', repeatPolicy: 'once_per_competition' },
    { actionCode: 'weekly_lineup_confirmed', award: 5, eligibilityPolicy: 'fantasy_competition_member', repeatPolicy: 'once_per_round' },
    { actionCode: 'private_league_joined', award: 5, eligibilityPolicy: 'invited_member', repeatPolicy: 'once_per_mini_league' },
  ],
};
