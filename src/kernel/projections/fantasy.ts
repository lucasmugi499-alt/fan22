import type {
  DataCollectionProfile,
  FantasyPointEvent,
  FantasyScoringProfile,
  StatisticDefinition,
} from '@/kernel/types';

export function validateFantasyProfileEligibility({
  profile,
  collectionProfile,
  statisticDefinitions,
}: {
  profile: FantasyScoringProfile;
  collectionProfile: DataCollectionProfile;
  statisticDefinitions: StatisticDefinition[];
}) {
  const knownStatistics = new Set(statisticDefinitions.map((definition) => definition.code));
  const eligibleStatistics = new Set(collectionProfile.fantasyEligibleStatisticCodes);
  const issues: string[] = [];

  for (const rule of profile.rules) {
    if (!knownStatistics.has(rule.statisticCode) && rule.statisticCode !== 'rugby.win_participation') {
      issues.push(`Fantasy rule ${rule.id} references unknown statistic ${rule.statisticCode}.`);
    }
    if (!eligibleStatistics.has(rule.statisticCode)) {
      issues.push(`Fantasy rule ${rule.id} references statistic ${rule.statisticCode} not eligible in ${collectionProfile.id}.`);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function scoreFantasyPointEvents({
  fantasyCompetitionId,
  scoringProfile,
  roundId,
  matchId,
  officialResultVersion,
  officialEventVersion,
  athleteId,
  statistics,
  status,
  createdAt,
}: {
  fantasyCompetitionId: string;
  scoringProfile: FantasyScoringProfile;
  roundId: string;
  matchId: string;
  officialResultVersion: number;
  officialEventVersion: number;
  athleteId: string;
  statistics: Record<string, number>;
  status: FantasyPointEvent['status'];
  createdAt: string;
}): FantasyPointEvent[] {
  return scoringProfile.rules.flatMap((rule) => {
    const rawQuantity = statistics[rule.statisticCode] ?? 0;
    const quantity = rule.unit ? Math.floor(rawQuantity / rule.unit) : rawQuantity;
    if (!quantity) return [];
    const base = quantity * rule.points;
    const basePoints = typeof rule.maximumAward === 'number'
      ? Math.min(base, rule.maximumAward)
      : base;
    const idempotencyKey = [
      fantasyCompetitionId,
      scoringProfile.version,
      roundId,
      matchId,
      officialResultVersion,
      officialEventVersion,
      athleteId,
      rule.id,
    ].join(':');

    return [{
      id: `fantasy_point_${idempotencyKey}`,
      fantasyCompetitionId,
      scoringProfileVersion: scoringProfile.version,
      roundId,
      matchId,
      officialResultVersion,
      officialEventVersion,
      athleteId,
      statisticCode: rule.statisticCode,
      scoringRuleId: rule.id,
      quantity,
      basePoints,
      status,
      idempotencyKey,
      createdAt,
    }];
  });
}
