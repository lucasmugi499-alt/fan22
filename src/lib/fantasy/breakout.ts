import type { FantasyPointEvent } from '@/types/fantasy';

/**
 * The Breakout board: a public weekly surface, and the cheapest marketing the platform has.
 *
 * In a grassroots league the interesting knowledge is not "who is the best striker in the
 * country". It is "the left back at Villa has been outstanding for a month and nobody outside
 * Villa has noticed". This board is where that surfaces, and every row on it is an athlete
 * profile a fan can follow.
 *
 * It also solves the cold-start problem for athlete discovery without any recommendation
 * engine: managers do the surfacing, through the scout slot, and this reports what they found.
 *
 * Nothing here reads or writes anything financial. Fantasy introduces a fan to an athlete;
 * whether they then back that athlete happens entirely outside the game.
 */

export type BreakoutAthleteInput = {
  athleteId: string;
  /**
   * The name the League registered, never a self-authored nickname.
   *
   * ADR-001 splits the athlete into a league-authored sporting record and a persona they
   * write themselves. This board sits beside verified performance numbers, so it carries the
   * registered identity; a bare `name` here is exactly how the two domains leak.
   */
  legalName: string;
  teamName: string;
  registeredPosition: string;
  /** Ownership now, as a percentage of managers. */
  ownershipPercentage: number;
  /** Ownership at the start of the round, for the rise calculation. */
  previousOwnershipPercentage?: number;
};

export type BreakoutRow = {
  athleteId: string;
  legalName: string;
  teamName: string;
  registeredPosition: string;
  points: number;
  ownershipPercentage: number;
};

export type OwnershipRiseRow = BreakoutRow & {
  previousOwnershipPercentage: number;
  /** Percentage points gained, not a ratio. */
  ownershipRise: number;
};

export type ScoutPickRow = BreakoutRow & {
  /** How many managers used their scout slot on this athlete. */
  scoutedByManagerCount: number;
};

export type BreakoutBoard = {
  /** Highest scoring athlete owned by under the competition's scout threshold. */
  topUnderOwned: BreakoutRow[];
  /** Biggest ownership rise this round. */
  biggestRisers: OwnershipRiseRow[];
  /** Best scout pick of the round, and how many managers found them. */
  bestScoutPicks: ScoutPickRow[];
  thresholdPercent: number;
};

function pointsByAthlete(events: readonly FantasyPointEvent[]) {
  const totals = new Map<string, number>();
  for (const event of events) {
    // Superseded events belong to a result version that no longer stands.
    if (event.status === 'superseded') continue;
    totals.set(event.athleteId, (totals.get(event.athleteId) ?? 0) + event.basePoints);
  }
  return totals;
}

/**
 * Builds the board for one round.
 *
 * `scoutPicksByAthlete` counts how many managers spent their scout slot on each athlete,
 * which is the only way to answer "how many managers found them" — ownership alone cannot
 * distinguish a scout pick from an ordinary one.
 */
export function buildBreakoutBoard({
  athletes,
  pointEvents,
  scoutPicksByAthlete = {},
  thresholdPercent,
  limit = 5,
}: {
  athletes: readonly BreakoutAthleteInput[];
  pointEvents: readonly FantasyPointEvent[];
  scoutPicksByAthlete?: Record<string, number>;
  thresholdPercent: number;
  limit?: number;
}): BreakoutBoard {
  const totals = pointsByAthlete(pointEvents);

  const rows: BreakoutRow[] = athletes.map((athlete) => ({
    athleteId: athlete.athleteId,
    legalName: athlete.legalName,
    teamName: athlete.teamName,
    registeredPosition: athlete.registeredPosition,
    points: totals.get(athlete.athleteId) ?? 0,
    ownershipPercentage: athlete.ownershipPercentage,
  }));

  const topUnderOwned = rows
    .filter((row) => row.ownershipPercentage < thresholdPercent && row.points > 0)
    .sort((left, right) => right.points - left.points || left.athleteId.localeCompare(right.athleteId))
    .slice(0, limit);

  const biggestRisers: OwnershipRiseRow[] = athletes
    .flatMap((athlete) => {
      const previous = athlete.previousOwnershipPercentage;
      // Without a previous reading there is no rise to report, and reporting the current
      // figure as a rise would invent a movement that was never measured.
      if (typeof previous !== 'number') return [];
      const rise = athlete.ownershipPercentage - previous;
      if (rise <= 0) return [];
      return [{
        athleteId: athlete.athleteId,
        legalName: athlete.legalName,
        teamName: athlete.teamName,
        registeredPosition: athlete.registeredPosition,
        points: totals.get(athlete.athleteId) ?? 0,
        ownershipPercentage: athlete.ownershipPercentage,
        previousOwnershipPercentage: previous,
        ownershipRise: Number(rise.toFixed(2)),
      }];
    })
    .sort((left, right) => right.ownershipRise - left.ownershipRise
      || left.athleteId.localeCompare(right.athleteId))
    .slice(0, limit);

  const bestScoutPicks: ScoutPickRow[] = rows
    .flatMap((row) => {
      const scoutedByManagerCount = scoutPicksByAthlete[row.athleteId] ?? 0;
      if (!scoutedByManagerCount) return [];
      return [{ ...row, scoutedByManagerCount }];
    })
    .sort((left, right) => right.points - left.points
      || right.scoutedByManagerCount - left.scoutedByManagerCount
      || left.athleteId.localeCompare(right.athleteId))
    .slice(0, limit);

  return { topUnderOwned, biggestRisers, bestScoutPicks, thresholdPercent };
}

/**
 * How a scout pick did against the field, for the line the artifact shows after a round:
 * "Your scout pick has outscored 94 percent of managers this round."
 *
 * Returns null when there is nothing to compare against, rather than claiming a percentile
 * computed from one sample.
 */
export function scoutPickPercentile({
  scoutPoints,
  allManagerRoundTotals,
}: {
  scoutPoints: number;
  allManagerRoundTotals: readonly number[];
}): number | null {
  if (allManagerRoundTotals.length < 2) return null;
  const beaten = allManagerRoundTotals.filter((total) => scoutPoints > total).length;
  return Math.round((beaten / allManagerRoundTotals.length) * 100);
}
