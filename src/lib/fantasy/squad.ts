import { budgetApplies } from './budget';
import type {
  FantasyCompetition,
  FantasyLineupVersion,
  FantasyPlayer,
  FantasyPlayerPrice,
  FantasySquadRules,
  FantasySquadValidation,
  FantasyTeam,
} from '@/types/fantasy';

export function validateFantasySquad({
  lineup,
  players,
  prices,
  rules,
  competition,
  serverNow,
  deadlineAt,
}: {
  lineup: Pick<
    FantasyLineupVersion,
    | 'squadAthleteIds'
    | 'startingAthleteIds'
    | 'benchAthleteIds'
    | 'captainAthleteId'
    | 'viceCaptainAthleteId'
  >;
  players: FantasyPlayer[];
  prices: FantasyPlayerPrice[];
  rules: FantasySquadRules;
  /**
   * Omitted by callers predating budget-free, which is exactly the `credits` behaviour
   * those callers already had.
   */
  competition?: Pick<FantasyCompetition, 'budgetMode'> | null;
  serverNow: string;
  deadlineAt: string;
}): FantasySquadValidation {
  const errors: string[] = [];
  const budgeted = budgetApplies(competition);
  const uniqueSquad = new Set(lineup.squadAthleteIds);
  const playerByAthlete = new Map(players.map((player) => [player.athleteId, player]));
  const priceByAthlete = new Map(
    prices
      .filter((price) => price.status === 'published')
      .map((price) => [price.athleteId, price]),
  );

  if (Date.parse(serverNow) >= Date.parse(deadlineAt)) {
    errors.push('The round deadline has passed.');
  }
  if (uniqueSquad.size !== lineup.squadAthleteIds.length) {
    errors.push('Each athlete may appear only once.');
  }
  if (uniqueSquad.size !== rules.squadSize) {
    errors.push(`Select exactly ${rules.squadSize} athletes.`);
  }
  if (new Set(lineup.startingAthleteIds).size !== rules.startingSize) {
    errors.push(`Select exactly ${rules.startingSize} starters.`);
  }
  if (new Set(lineup.benchAthleteIds).size !== rules.benchSize) {
    errors.push(`Select exactly ${rules.benchSize} bench athletes.`);
  }

  const partition = [...lineup.startingAthleteIds, ...lineup.benchAthleteIds];
  if (
    partition.length !== lineup.squadAthleteIds.length
    || partition.some((athleteId) => !uniqueSquad.has(athleteId))
    || new Set(partition).size !== uniqueSquad.size
  ) {
    errors.push('Starters and bench must form the complete squad without duplicates.');
  }
  if (rules.captainRequired && !lineup.startingAthleteIds.includes(lineup.captainAthleteId)) {
    errors.push('Captain must be in the starting lineup.');
  }
  if (rules.viceCaptainRequired && !lineup.startingAthleteIds.includes(lineup.viceCaptainAthleteId)) {
    errors.push('Vice-captain must be in the starting lineup.');
  }
  if (lineup.captainAthleteId === lineup.viceCaptainAthleteId) {
    errors.push('Captain and vice-captain must be different athletes.');
  }

  const selectedPlayers = lineup.squadAthleteIds.flatMap((athleteId) => {
    const player = playerByAthlete.get(athleteId);
    if (!player || !player.active || player.availability === 'suspended') {
      errors.push(`Athlete ${athleteId} is not eligible for this competition.`);
      return [];
    }
    // A budget-free competition has no prices to be missing, so requiring one here would
    // make every squad invalid in the mode that exists precisely because prices do not.
    if (budgeted && !priceByAthlete.has(athleteId)) {
      errors.push(`Athlete ${athleteId} does not have a published Fantasy Credit price.`);
    }
    return [player];
  });

  for (const positionRule of rules.positionGroups) {
    const count = selectedPlayers.filter(
      (player) => player.positionGroup === positionRule.id,
    ).length;
    if (count < positionRule.minimum || count > positionRule.maximum) {
      errors.push(
        `${positionRule.label} must contain ${positionRule.minimum}-${positionRule.maximum} athletes.`,
      );
    }
  }

  const realTeamCounts = new Map<string, number>();
  for (const player of selectedPlayers) {
    realTeamCounts.set(player.realTeamId, (realTeamCounts.get(player.realTeamId) ?? 0) + 1);
  }
  if ([...realTeamCounts.values()].some((count) => count > rules.maxFromRealTeam)) {
    errors.push(`Select no more than ${rules.maxFromRealTeam} athletes from one real team.`);
  }

  const creditsUsed = lineup.squadAthleteIds.reduce(
    (sum, athleteId) => sum + (priceByAthlete.get(athleteId)?.credits ?? 0),
    0,
  );
  if (budgeted && creditsUsed > rules.budgetCredits) {
    errors.push(`Squad exceeds the ${rules.budgetCredits} Fantasy Credit budget.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    creditsUsed: budgeted ? creditsUsed : 0,
    creditsRemaining: budgeted ? rules.budgetCredits - creditsUsed : 0,
  };
}

export function canCreateFantasyTeam(
  existingTeams: FantasyTeam[],
  competitionId: string,
  userId: string,
) {
  return !existingTeams.some(
    (team) => team.competitionId === competitionId && team.userId === userId,
  );
}

const FORBIDDEN_FANTASY_KEYS = new Set([
  'amount',
  'amountMinor',
  'budgetUGX',
  'cash',
  'currency',
  'entryFee',
  'goalPlacePoints',
  'payout',
  'prize',
  'stake',
  'supportAmount',
  'walletBalance',
]);

export function fantasyRecordHasFinancialFields(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(fantasyRecordHasFinancialFields);
  return Object.entries(value).some(
    ([key, nested]) =>
      FORBIDDEN_FANTASY_KEYS.has(key) || fantasyRecordHasFinancialFields(nested),
  );
}
