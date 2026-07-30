import type {
  FantasyCorrection,
  FantasyLineupVersion,
  FantasyPointEvent,
  FantasyScoringProfile,
} from '@/types/fantasy';
import { scoreFantasyLineup } from './lineupScoring';

export function buildFantasyCorrection({
  competitionId,
  roundId,
  matchId,
  previousVersion,
  newVersion,
  previousEvents,
  replacementEvents,
  lineups,
  profile,
  reason,
  createdAt,
}: {
  competitionId: string;
  roundId: string;
  matchId: string;
  previousVersion: number;
  newVersion: number;
  previousEvents: FantasyPointEvent[];
  replacementEvents: FantasyPointEvent[];
  lineups: FantasyLineupVersion[];
  profile: FantasyScoringProfile;
  reason: string;
  createdAt: string;
}) {
  if (newVersion <= previousVersion) {
    throw new Error('Fantasy corrections require a newer official result version.');
  }
  const supersededEvents = previousEvents.map((event) => ({
    ...event,
    status: 'superseded' as const,
    supersededAt: createdAt,
  }));
  const correctedEvents = replacementEvents.map((event) => ({
    ...event,
    status: 'corrected' as const,
  }));
  const oldTotals: Record<string, number> = {};
  const newTotals: Record<string, number> = {};
  for (const lineup of lineups) {
    oldTotals[lineup.fantasyTeamId] = scoreFantasyLineup({
      competitionId,
      roundId,
      fantasyTeamId: lineup.fantasyTeamId,
      lineup,
      pointEvents: previousEvents,
      profile,
      calculatedAt: createdAt,
    }).totalPoints;
    newTotals[lineup.fantasyTeamId] = scoreFantasyLineup({
      competitionId,
      roundId,
      fantasyTeamId: lineup.fantasyTeamId,
      lineup,
      pointEvents: correctedEvents,
      profile,
      calculatedAt: createdAt,
    }).totalPoints;
  }
  const affectedFantasyTeamIds = Object.keys(newTotals).filter(
    (teamId) => oldTotals[teamId] !== newTotals[teamId],
  );
  const correction: FantasyCorrection = {
    id: `${competitionId}:${roundId}:${matchId}:v${previousVersion}-v${newVersion}`,
    competitionId,
    roundId,
    matchId,
    previousOfficialResultVersion: previousVersion,
    newOfficialResultVersion: newVersion,
    affectedFantasyTeamIds,
    oldTotals,
    newTotals,
    reason,
    createdAt,
  };
  return { supersededEvents, correctedEvents, correction };
}

export function fantasyMatchResolutionPolicy(
  status: 'scheduled' | 'postponed' | 'abandoned' | 'cancelled' | 'completed',
  lineupLocked: boolean,
) {
  switch (status) {
    case 'cancelled':
    case 'abandoned':
      return { awardPoints: false, preserveLockedLineup: lineupLocked, action: 'void_points' as const };
    case 'postponed':
      return {
        awardPoints: false,
        preserveLockedLineup: lineupLocked,
        action: lineupLocked ? 'score_when_rescheduled' as const : 'recalculate_deadline' as const,
      };
    case 'completed':
      return { awardPoints: true, preserveLockedLineup: lineupLocked, action: 'await_official_result' as const };
    default:
      return { awardPoints: false, preserveLockedLineup: lineupLocked, action: 'wait' as const };
  }
}
