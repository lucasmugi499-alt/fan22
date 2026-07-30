import type {
  FantasyLineupVersion,
  FantasyPointEvent,
  FantasyRoundScore,
  FantasyScoringProfile,
} from '@/types/fantasy';

export function scoreFantasyLineup({
  competitionId,
  roundId,
  fantasyTeamId,
  lineup,
  pointEvents,
  profile,
  calculatedAt,
}: {
  competitionId: string;
  roundId: string;
  fantasyTeamId: string;
  lineup: FantasyLineupVersion;
  pointEvents: FantasyPointEvent[];
  profile: FantasyScoringProfile;
  calculatedAt: string;
}): FantasyRoundScore {
  const officialEvents = pointEvents.filter(
    (event) =>
      event.competitionId === competitionId
      && event.roundId === roundId
      && (event.status === 'official' || event.status === 'corrected'),
  );
  const pointsByAthlete = new Map<string, number>();
  const appeared = new Set<string>();
  for (const event of officialEvents) {
    pointsByAthlete.set(
      event.athleteId,
      (pointsByAthlete.get(event.athleteId) ?? 0) + event.basePoints,
    );
    if (event.scoringRuleId === 'appearance') appeared.add(event.athleteId);
  }

  const basePoints = lineup.startingAthleteIds.reduce(
    (total, athleteId) => total + (pointsByAthlete.get(athleteId) ?? 0),
    0,
  );
  const multiplierAthleteId = appeared.has(lineup.captainAthleteId)
    ? lineup.captainAthleteId
    : appeared.has(lineup.viceCaptainAthleteId)
      ? lineup.viceCaptainAthleteId
      : undefined;
  const captainBonus = multiplierAthleteId
    ? (pointsByAthlete.get(multiplierAthleteId) ?? 0) * (profile.captainMultiplier - 1)
    : 0;

  return {
    id: `${competitionId}:${roundId}:${fantasyTeamId}`,
    competitionId,
    roundId,
    fantasyTeamId,
    lineupVersionId: lineup.id,
    basePoints,
    captainBonus,
    totalPoints: basePoints + captainBonus,
    status: 'official',
    calculatedAt,
  };
}
