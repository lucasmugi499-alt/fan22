import type {
  FantasyCompetition,
  FantasyPlayer,
  FantasyPlayerPrice,
  FantasyRound,
  FantasyScoringProfile,
  FantasySquadRules,
} from '@/types/fantasy';

const DATA_LEVEL: Record<FantasyCompetition['dataLevel'], number> = {
  basic: 1,
  standard: 2,
  advanced: 3,
};

export type FantasyActivationSummary = {
  activatedRuleIds: string[];
  playerCount: number;
  pricedPlayerCount: number;
  roundCount: number;
  positionGroupCounts: Record<string, number>;
  observedCoverage?: ObservedDataCoverage;
};

/**
 * What the competition's recent official results actually contain.
 *
 * Activation previously validated `recordedStatKeys`, which is a declaration: a league
 * could assert it collects appearances without ever having recorded one, and fantasy
 * would activate appearance scoring against data that does not exist. This is measured
 * from a recent window of official performances instead.
 */
export type ObservedDataCoverage = {
  matchesSampled: number;
  performancesSampled: number;
  /** Share of official performances that carry evidence the athlete actually played. */
  participationCoveragePercent: number;
  /** Share of official performances carrying each stat key, keyed by stat code. */
  statKeyCoveragePercent: Record<string, number>;
};

export type FantasyActivationReadiness = {
  ready: boolean;
  blockers: string[];
  warnings: string[];
  summary: FantasyActivationSummary;
};

function parseableDate(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function idList(values: string[]) {
  return [...new Set(values)].sort().join(', ');
}

function activatedRules(
  competition: Pick<FantasyCompetition, 'dataLevel' | 'recordedStatKeys'>,
  profile: FantasyScoringProfile,
) {
  return profile.rules.filter((rule) =>
    rule.enabled
    && DATA_LEVEL[competition.dataLevel] >= DATA_LEVEL[rule.requiredDataLevel],
  );
}

export function validateFantasyActivation({
  competition,
  scoringProfile,
  squadRules,
  players,
  prices,
  rounds,
  observedCoverage,
}: {
  competition: FantasyCompetition;
  scoringProfile: FantasyScoringProfile | null;
  squadRules: FantasySquadRules | null;
  players: FantasyPlayer[];
  prices: FantasyPlayerPrice[];
  rounds: FantasyRound[];
  /** Omit only where no official results exist yet; absence is reported, not assumed. */
  observedCoverage?: ObservedDataCoverage;
}): FantasyActivationReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const positionGroupCounts: Record<string, number> = {};
  const summary: FantasyActivationSummary = {
    activatedRuleIds: [],
    playerCount: players.length,
    pricedPlayerCount: 0,
    roundCount: rounds.length,
    positionGroupCounts,
  };

  if (!scoringProfile) {
    blockers.push('Approved scoring profile is missing.');
  } else {
    if (scoringProfile.status !== 'approved') blockers.push('Scoring profile is not approved.');
    if (scoringProfile.sport !== competition.sport) blockers.push('Scoring profile sport does not match the competition.');
    if (scoringProfile.version !== competition.scoringProfileVersion) {
      blockers.push('Competition is not bound to the approved scoring profile version.');
    }
    const rules = activatedRules(competition, scoringProfile);
    summary.activatedRuleIds = rules.map((rule) => rule.id);
    const missingStatKeys = rules
      .map((rule) => rule.requiredStatKey)
      .filter((statKey) => !competition.recordedStatKeys.includes(statKey));
    if (missingStatKeys.length) {
      blockers.push(`Recorded stat coverage is missing: ${idList(missingStatKeys)}.`);
    }

    // Declared coverage is not evidence. Check the rules against what recent official
    // results actually contain.
    if (!observedCoverage) {
      warnings.push('No official results have been observed yet, so recorded stat coverage is unverified.');
    } else {
      summary.observedCoverage = observedCoverage;
      if (observedCoverage.matchesSampled === 0) {
        warnings.push('No official results in the recent window; recorded stat coverage is unverified.');
      } else {
        const requiresParticipation = rules.some((rule) =>
          rule.requiredStatKey === 'appearance' || rule.requiredStatKey === 'win_participation');
        if (requiresParticipation && observedCoverage.participationCoveragePercent === 0) {
          // Squad selection is not participation. Awarding appearance points against
          // results that never distinguished the two invents the points outright.
          blockers.push(
            'Appearance-based rules are activated, but no recent official result records who actually played.',
          );
        } else if (requiresParticipation && observedCoverage.participationCoveragePercent < 50) {
          warnings.push(
            `Only ${observedCoverage.participationCoveragePercent}% of recent official performances record participation.`,
          );
        }

        const unobserved = rules
          .map((rule) => rule.requiredStatKey)
          .filter((statKey) => (observedCoverage.statKeyCoveragePercent[statKey] ?? 0) === 0);
        if (unobserved.length) {
          blockers.push(
            `Activated rules need stats that no recent official result contains: ${idList(unobserved)}.`,
          );
        }
      }
    }
  }

  if (!squadRules) {
    blockers.push('Squad rules are missing.');
  } else {
    if (squadRules.sport !== competition.sport) blockers.push('Squad rules sport does not match the competition.');
    if (squadRules.variant !== competition.variant) blockers.push('Squad rules variant does not match the competition.');
    if (players.length < squadRules.squadSize) {
      blockers.push(`Player pool has ${players.length} athletes, but squads require ${squadRules.squadSize}.`);
    }
  }

  const playerAthleteIds = new Set<string>();
  for (const player of players) {
    if (player.competitionId !== competition.id) blockers.push(`Player ${player.id} belongs to another competition.`);
    if (!player.active) warnings.push(`Player ${player.id} is not active.`);
    if (!player.athleteId) blockers.push(`Player ${player.id} is missing athlete identity.`);
    if (!player.realTeamId) blockers.push(`Player ${player.id} is missing real team identity.`);
    if (playerAthleteIds.has(player.athleteId)) blockers.push(`Athlete ${player.athleteId} appears more than once.`);
    playerAthleteIds.add(player.athleteId);
    positionGroupCounts[player.positionGroup] = (positionGroupCounts[player.positionGroup] ?? 0) + 1;
  }

  if (squadRules) {
    const allowedGroups = new Set(squadRules.positionGroups.map((group) => group.id));
    for (const groupId of Object.keys(positionGroupCounts)) {
      if (!allowedGroups.has(groupId)) blockers.push(`Position group ${groupId} is not allowed by squad rules.`);
    }
    for (const group of squadRules.positionGroups) {
      const available = positionGroupCounts[group.id] ?? 0;
      if (available < group.minimum) {
        blockers.push(`Position group ${group.label} has ${available} eligible athletes, but squads require ${group.minimum}.`);
      }
    }
  }

  const pricesByAthlete = new Map<string, FantasyPlayerPrice[]>();
  for (const price of prices) {
    if (price.competitionId !== competition.id) blockers.push(`Price ${price.id} belongs to another competition.`);
    if (!Number.isFinite(price.credits) || price.credits <= 0) blockers.push(`Price ${price.id} must have positive credits.`);
    if (!['draft', 'published'].includes(price.status)) blockers.push(`Price ${price.id} is not publishable.`);
    pricesByAthlete.set(price.athleteId, [...(pricesByAthlete.get(price.athleteId) ?? []), price]);
  }
  summary.pricedPlayerCount = [...playerAthleteIds].filter((athleteId) =>
    (pricesByAthlete.get(athleteId) ?? []).length > 0,
  ).length;
  for (const athleteId of playerAthleteIds) {
    if (!pricesByAthlete.has(athleteId)) blockers.push(`Athlete ${athleteId} has no publishable price.`);
  }
  for (const [athleteId, athletePrices] of pricesByAthlete.entries()) {
    if (!playerAthleteIds.has(athleteId)) warnings.push(`Price exists for athlete ${athleteId}, but no active player record exists.`);
    if (athletePrices.length > 1) warnings.push(`Athlete ${athleteId} has multiple price records for this competition.`);
  }

  if (rounds.length < 1) blockers.push('At least one fantasy round is required.');
  rounds.forEach((round, index) => {
    if (round.competitionId !== competition.id) blockers.push(`Round ${round.id} belongs to another competition.`);
    if (!Array.isArray(round.matchIds) || round.matchIds.length < 1) blockers.push(`Round ${round.id} has no matches.`);
    if (!parseableDate(round.startsAt) || !parseableDate(round.deadlineAt) || !parseableDate(round.endsAt)) {
      blockers.push(`Round ${round.id} has invalid schedule dates.`);
    }
    if (Number(round.number) !== index + 1) warnings.push(`Round ${round.id} is not in sequential order.`);
  });

  return {
    ready: blockers.length === 0,
    blockers,
    warnings: [...new Set(warnings)],
    summary,
  };
}


/**
 * Measures what a recent window of official performances actually contains.
 *
 * Pure so it can be exercised without Firestore; callers supply the window.
 * `didPlay` is the finalizer's participation verdict, which is derived from official
 * events rather than squad selection.
 */
export function measureObservedCoverage(performances: Array<{
  matchId: string;
  didPlay?: boolean;
  stats?: Record<string, number>;
}>): ObservedDataCoverage {
  const matchesSampled = new Set(performances.map((entry) => entry.matchId)).size;
  const performancesSampled = performances.length;
  const played = performances.filter((entry) => entry.didPlay === true).length;

  const statCounts: Record<string, number> = {};
  for (const entry of performances) {
    for (const [statKey, value] of Object.entries(entry.stats ?? {})) {
      // A stat present but always zero is not evidence the league records it.
      if (typeof value === 'number' && value > 0) {
        statCounts[statKey] = (statCounts[statKey] ?? 0) + 1;
      }
    }
  }

  const statKeyCoveragePercent: Record<string, number> = {};
  for (const [statKey, count] of Object.entries(statCounts)) {
    statKeyCoveragePercent[statKey] = performancesSampled
      ? Math.round((count / performancesSampled) * 100)
      : 0;
  }

  return {
    matchesSampled,
    performancesSampled,
    participationCoveragePercent: performancesSampled
      ? Math.round((played / performancesSampled) * 100)
      : 0,
    statKeyCoveragePercent,
  };
}
