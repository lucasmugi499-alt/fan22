import type { OfficialSportEvent, ScoreTrace, SportDefinition } from '@/kernel/types';

type TeamSideMap = {
  homeTeamId: string;
  awayTeamId: string;
};

function sideForTeam(teamId: string | undefined, teams: TeamSideMap): 'home' | 'away' | undefined {
  if (teamId === teams.homeTeamId) return 'home';
  if (teamId === teams.awayTeamId) return 'away';
  return undefined;
}

function opponentSide(teamId: string | undefined, teams: TeamSideMap): 'home' | 'away' | undefined {
  const side = sideForTeam(teamId, teams);
  if (side === 'home') return 'away';
  if (side === 'away') return 'home';
  return undefined;
}

export function reconstructMatchScore({
  sportDefinition,
  events,
  teams,
  claimedScore,
}: {
  sportDefinition: SportDefinition;
  events: OfficialSportEvent[];
  teams: TeamSideMap;
  claimedScore?: { home: number; away: number };
}): ScoreTrace {
  const formulaVersion = `${sportDefinition.id}@${sportDefinition.version}`;
  let home = 0;
  let away = 0;
  const issues: string[] = [];
  const scoring = new Map(sportDefinition.legalScoringEvents.map((event) => [event.eventType, event]));

  const components = events.map((event) => {
    const definition = scoring.get(event.eventType);
    let appliedTo: 'home' | 'away' | 'ignored' = 'ignored';
    let points = 0;

    if (definition) {
      points = definition.points;
      if (event.eventType === 'football.own_goal') {
        appliedTo = opponentSide(event.teamId, teams) ?? 'ignored';
      } else {
        appliedTo = sideForTeam(event.teamId, teams) ?? 'ignored';
      }
      if (appliedTo === 'home') home += points;
      if (appliedTo === 'away') away += points;
      if (appliedTo === 'ignored') issues.push(`Event ${event.id} has no participating team attribution.`);
    }

    return {
      eventId: event.id,
      eventType: event.eventType,
      teamId: event.teamId,
      points,
      appliedTo,
    };
  });

  let status: ScoreTrace['status'] = issues.length ? 'valid_with_warning' : 'valid';
  if (!events.length) status = 'incomplete';
  if (claimedScore && (claimedScore.home !== home || claimedScore.away !== away)) {
    status = 'inconsistent';
    issues.push(`Event score ${home}-${away} does not match claimed score ${claimedScore.home}-${claimedScore.away}.`);
  }

  return { formulaVersion, home, away, status, components, issues };
}

export function reconcileBasketballBoxScore({
  athleteTeamPoints,
  teamScore,
}: {
  athleteTeamPoints: Record<string, number>;
  teamScore: Record<string, number>;
}) {
  const issues: string[] = [];
  for (const [teamId, score] of Object.entries(teamScore)) {
    const athleteTotal = athleteTeamPoints[teamId] ?? 0;
    if (athleteTotal !== score) {
      issues.push(`Basketball box score for ${teamId} totals ${athleteTotal}, expected ${score}.`);
    }
  }
  return {
    status: issues.length ? 'inconsistent' as const : 'valid' as const,
    issues,
  };
}
