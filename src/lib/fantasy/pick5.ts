import type {
  FantasyCompetition,
  FantasyGameMode,
  FantasyLineupVersion,
  FantasyPlayer,
  FantasySport,
} from '@/types/fantasy';

/**
 * Pick 5: five athletes, one captain, one scout slot, reset every round.
 *
 * The squad game is the right destination and the wrong starting point. It assumes a large
 * pool of players the fan already knows, a price history that makes a budget meaningful, and
 * a season-long commitment before the first reward. In a Kampala league a fan knows maybe
 * twenty of two hundred and fifty athletes, nothing computes a price, and the product is
 * unproven. Three of those assumptions fail outright at launch.
 *
 * What survives is what made the squad game good: the team is yours, a weekly decision brings
 * you back, and mini-leagues create stakes with people you know. Pick 5 delivers all three at
 * a fraction of the complexity, and it is playable in under a minute on a cheap phone.
 */

export const PICK5_SIZE = 5;

/**
 * At most two athletes from any one club.
 *
 * Without it every fan picks their own team, which is what a grassroots supporter does by
 * default, and the leaderboard becomes a popularity contest between clubs rather than a
 * measure of anyone's judgement.
 */
export const PICK5_MAX_FROM_REAL_TEAM = 2;

/**
 * The captain doubles.
 *
 * One real decision per round. Not 1.5: in a low-event game a half multiplier is a rounding
 * difference rather than a choice, and the doubling is the only thing keeping the game from
 * being a list.
 */
export const PICK5_CAPTAIN_MULTIPLIER = 2;

/** Five percent is a starting guess, overridable per competition. */
export const DEFAULT_SCOUT_OWNERSHIP_THRESHOLD_PERCENT = 5;

export function fantasyGameMode(
  competition: Pick<FantasyCompetition, 'gameMode'> | null | undefined,
): FantasyGameMode {
  return competition?.gameMode === 'pick5' ? 'pick5' : 'season_squad';
}

/**
 * The ownership ceiling a scout pick must be under.
 *
 * Read from the competition so it can be tuned to the audience actually playing. A constant
 * would be wrong at every size but one.
 */
export function scoutOwnershipThreshold(
  competition: Pick<FantasyCompetition, 'scoutOwnershipThresholdPercent'> | null | undefined,
): number {
  const configured = competition?.scoutOwnershipThresholdPercent;
  return typeof configured === 'number' && Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_SCOUT_OWNERSHIP_THRESHOLD_PERCENT;
}

/** Athletes eligible for the scout slot, given current ownership. */
export function scoutEligiblePlayers(
  players: readonly FantasyPlayer[],
  thresholdPercent: number,
): FantasyPlayer[] {
  return players.filter((player) =>
    player.active
    && player.availability !== 'suspended'
    && player.availability !== 'unavailable'
    && player.ownershipPercentage < thresholdPercent);
}

export type Pick5Lineup = Pick<
  FantasyLineupVersion,
  'squadAthleteIds' | 'captainAthleteId' | 'scoutAthleteId'
>;

export type Pick5Validation = {
  valid: boolean;
  errors: string[];
  /** How many of the five slots are filled, for the "3 of 5 picked" line. */
  picked: number;
  scoutThresholdPercent: number;
};

/**
 * Validates a Pick 5 lineup.
 *
 * Deliberately not `validateFantasySquad` with different numbers. The squad validator enforces
 * positional groups, a bench, a vice-captain and a credit budget, none of which exist here,
 * and bending it to skip four of its six rules would leave neither game's rules legible.
 */
export function validatePick5Lineup({
  lineup,
  players,
  competition,
  serverNow,
  deadlineAt,
}: {
  lineup: Pick5Lineup;
  players: readonly FantasyPlayer[];
  competition?: Pick<FantasyCompetition, 'scoutOwnershipThresholdPercent'> | null;
  serverNow: string;
  deadlineAt: string;
}): Pick5Validation {
  const errors: string[] = [];
  const thresholdPercent = scoutOwnershipThreshold(competition);
  const unique = new Set(lineup.squadAthleteIds);
  const playerByAthlete = new Map(players.map((player) => [player.athleteId, player]));

  if (Date.parse(serverNow) >= Date.parse(deadlineAt)) {
    errors.push('The round deadline has passed.');
  }
  if (unique.size !== lineup.squadAthleteIds.length) {
    errors.push('Each athlete may appear only once.');
  }
  if (unique.size !== PICK5_SIZE) {
    errors.push(`Pick exactly ${PICK5_SIZE} athletes.`);
  }

  const selected: FantasyPlayer[] = [];
  for (const athleteId of unique) {
    const player = playerByAthlete.get(athleteId);
    if (!player || !player.active || player.availability === 'suspended' || player.availability === 'unavailable') {
      errors.push(`Athlete ${athleteId} is not available for this round.`);
      continue;
    }
    selected.push(player);
  }

  const teamCounts = new Map<string, number>();
  for (const player of selected) {
    teamCounts.set(player.realTeamId, (teamCounts.get(player.realTeamId) ?? 0) + 1);
  }
  if ([...teamCounts.values()].some((count) => count > PICK5_MAX_FROM_REAL_TEAM)) {
    errors.push(`Pick no more than ${PICK5_MAX_FROM_REAL_TEAM} athletes from one club.`);
  }

  if (!lineup.captainAthleteId) {
    errors.push('Choose a captain. The captain scores double.');
  } else if (!unique.has(lineup.captainAthleteId)) {
    errors.push('The captain must be one of your five picks.');
  }

  if (!lineup.scoutAthleteId) {
    errors.push('Choose a scout pick.');
  } else if (!unique.has(lineup.scoutAthleteId)) {
    errors.push('The scout pick must be one of your five picks.');
  } else {
    const scout = playerByAthlete.get(lineup.scoutAthleteId);
    if (scout && scout.ownershipPercentage >= thresholdPercent) {
      errors.push(
        `The scout slot needs an athlete owned by under ${thresholdPercent}% of managers. `
        + `${scout.athleteId} is owned by ${scout.ownershipPercentage}%.`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    picked: unique.size,
    scoutThresholdPercent: thresholdPercent,
  };
}

/**
 * A Pick 5 lineup expressed in the shared lineup shape, so it scores through the same path.
 *
 * All five picks are starters and there is no bench or vice-captain. Leaving the vice-captain
 * empty is deliberate rather than an omission: the existing lineup scorer promotes the vice
 * only when the captain did not appear, and an empty id can never match an athlete who
 * appeared, so a Pick 5 captain who does not play simply forfeits the double.
 */
export function pick5LineupVersion({
  id,
  fantasyTeamId,
  competitionId,
  roundId,
  version,
  lineup,
  status,
  createdAt,
}: {
  id: string;
  fantasyTeamId: string;
  competitionId: string;
  roundId: string;
  version: number;
  lineup: Pick5Lineup;
  status: FantasyLineupVersion['status'];
  createdAt: string;
}): FantasyLineupVersion {
  return {
    id,
    fantasyTeamId,
    competitionId,
    roundId,
    version,
    squadAthleteIds: [...lineup.squadAthleteIds],
    startingAthleteIds: [...lineup.squadAthleteIds],
    benchAthleteIds: [],
    captainAthleteId: lineup.captainAthleteId,
    viceCaptainAthleteId: '',
    ...(lineup.scoutAthleteId ? { scoutAthleteId: lineup.scoutAthleteId } : {}),
    creditsUsed: 0,
    status,
    createdAt,
  };
}

/**
 * Which sports Pick 5 can run on.
 *
 * All three, unlike the season squad. Pick 5 needs only points, appearance, minutes and win
 * participation to be a real game, and those are the statistics every palette records. This
 * is why basketball ships Pick 5 and not the squad game: its box score demands rebounds,
 * assists, steals and blocks that one observer cannot capture, so nine of fifteen squad rules
 * are dead there, but five picks on what *is* recorded is honest and complete.
 */
export const PICK5_SUPPORTED_SPORTS: readonly FantasySport[] = ['football', 'basketball', 'rugby'];

export function pick5SupportsSport(sport: FantasySport) {
  return PICK5_SUPPORTED_SPORTS.includes(sport);
}
