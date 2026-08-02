import type {
  FantasyCompetition,
  FantasyOfficialAthletePerformance,
  FantasyPointEvent,
  FantasyPointStatus,
  FantasyScoringProfile,
} from '@/types/fantasy';

const DATA_LEVEL: Record<FantasyCompetition['dataLevel'], number> = {
  basic: 1,
  standard: 2,
  advanced: 3,
};

function quantityFor(
  performance: FantasyOfficialAthletePerformance,
  rule: FantasyScoringProfile['rules'][number],
) {
  if (rule.stat === 'active_squad') return performance.activeSquad ? 1 : 0;
  if (rule.stat === 'appearance') return performance.didPlay ? 1 : 0;
  if (rule.stat === 'minimum_duration') {
    return performance.didPlay && performance.minutesPlayed >= (rule.minimumMinutes ?? 0) ? 1 : 0;
  }
  if (rule.stat === 'player_of_match') return performance.playerOfMatch ? 1 : 0;
  if (rule.stat === 'win_participation') return performance.didPlay && performance.teamWon ? 1 : 0;
  return performance.stats[rule.requiredStatKey] ?? performance.stats[rule.stat] ?? 0;
}

export function enabledFantasyRules(
  competition: FantasyCompetition,
  profile: FantasyScoringProfile,
) {
  return profile.rules.filter((rule) =>
    rule.enabled
    && DATA_LEVEL[competition.dataLevel] >= DATA_LEVEL[rule.requiredDataLevel]
    && competition.recordedStatKeys.includes(rule.requiredStatKey),
  );
}

export function scoreOfficialFantasyPerformance({
  competition,
  profile,
  roundId,
  performance,
  status = 'official',
  createdAt,
}: {
  competition: FantasyCompetition;
  profile: FantasyScoringProfile;
  roundId: string;
  performance: FantasyOfficialAthletePerformance;
  status?: Extract<FantasyPointStatus, 'provisional' | 'pending_verification' | 'official' | 'corrected'>;
  createdAt: string;
}): FantasyPointEvent[] {
  if (profile.sport !== competition.sport || performance.sport !== competition.sport) {
    throw new Error('Fantasy scoring profile, competition, and performance sport must match.');
  }
  if (status === 'official' || status === 'corrected') {
    if (performance.verificationStatus !== 'verified' || performance.officialResultVersion < 1) {
      throw new Error('Official Fantasy Points require a verified official result version.');
    }
  }

  const coveredRules = enabledFantasyRules(competition, profile).filter((rule) => {
    if (performance.dataCoverage === 'scorer_only') {
      return ['goal', 'try', 'points_scored'].includes(rule.requiredStatKey);
    }
    if (performance.dataCoverage === 'match_squad_basic') {
      return ['active_squad', 'appearance', 'goal', 'try', 'points_scored', 'win_participation']
        .includes(rule.requiredStatKey);
    }
    return true;
  });

  return coveredRules.flatMap((rule) => {
    const rawQuantity = quantityFor(performance, rule);
    const quantity = rule.per ? Math.floor(rawQuantity / rule.per) : rawQuantity;
    if (!quantity) return [];
    const unitPoints = rule.positionPoints?.[performance.positionGroup] ?? rule.points;
    const sourceEventId =
      performance.sourceEventIds[rule.requiredStatKey]
      ?? `${performance.id}:${rule.requiredStatKey}`;
    const idempotencyKey = [
      competition.id,
      roundId,
      performance.matchId,
      performance.officialResultVersion,
      performance.athleteId,
      sourceEventId,
      rule.id,
    ].join(':');
    return [{
      id: `fantasy_point_${idempotencyKey}`,
      idempotencyKey,
      competitionId: competition.id,
      roundId,
      matchId: performance.matchId,
      officialResultVersion: performance.officialResultVersion,
      athleteId: performance.athleteId,
      sourceEventId,
      scoringRuleId: rule.id,
      quantity,
      basePoints: quantity * unitPoints,
      status,
      createdAt,
    }];
  });
}

export function totalOfficialFantasyPoints(events: FantasyPointEvent[]) {
  return events
    .filter((event) => event.status === 'official' || event.status === 'corrected')
    .reduce((total, event) => total + event.basePoints, 0);
}

export function mergeOfficialFantasyRoundEvents({
  existingEvents,
  matchId,
  officialResultVersion,
  replacementEvents,
}: {
  existingEvents: FantasyPointEvent[];
  matchId: string;
  officialResultVersion: number;
  replacementEvents: FantasyPointEvent[];
}) {
  const active = existingEvents.filter((event) =>
    event.status !== 'superseded'
    && (
      event.matchId !== matchId
      || event.officialResultVersion === officialResultVersion
    ),
  );
  return [
    ...new Map(
      [...active, ...replacementEvents].map((event) => [event.idempotencyKey, event]),
    ).values(),
  ];
}
