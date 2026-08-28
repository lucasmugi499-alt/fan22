import { investorDemo } from './investorDemo';
import {
  FANTASY_SCORING_PROFILES,
  FANTASY_SQUAD_RULES,
  positionGroupFor,
} from '@/lib/fantasy/profiles';
import type {
  FantasyCompetition,
  FantasyAchievement,
  FantasyCorrection,
  FantasyLeaderboardEntry,
  FantasyLineupVersion,
  FantasyMiniLeague,
  FantasyMiniLeagueMember,
  FantasyPlayer,
  FantasyPlayerPrice,
  FantasyPointEvent,
  FantasyRound,
  FantasyRoundScore,
  FantasyTeam,
  FantasyTransfer,
} from '@/types/fantasy';

const createdAt = '2026-07-29T00:00:00.000Z';

const definitions = [
  {
    id: 'fantasy_football_kampala_2026',
    name: 'GoalPlace Football Fantasy Demo',
    shortName: 'Football Fantasy',
    sport: 'football' as const,
    variant: 'association_football',
    leagueId: 'league_football_kampala',
    seasonId: 'season_football_01_2026',
    scoringProfileId: 'fantasy_scoring_football_v1',
    squadRulesId: 'fantasy_squad_football_v1',
    dataLevel: 'basic' as const,
    recordedStatKeys: [
      'active_squad', 'appearance', 'goal', 'win_participation', 'yellow_card', 'red_card',
    ],
  },
  {
    id: 'fantasy_basketball_kampala_2026',
    name: 'GoalPlace Basketball Fantasy Demo',
    shortName: 'Basketball Fantasy',
    sport: 'basketball' as const,
    variant: 'five_a_side',
    leagueId: 'league_basketball_kampala',
    seasonId: 'season_basketball_03_2026',
    scoringProfileId: 'fantasy_scoring_basketball_v1',
    squadRulesId: 'fantasy_squad_basketball_v1',
    dataLevel: 'basic' as const,
    recordedStatKeys: ['active_squad', 'appearance', 'points_scored', 'win_participation'],
    /*
     * Basketball demonstrates Pick 5 rather than the season squad.
     *
     * Its box score needs rebounds, assists, steals and blocks that one observer cannot
     * capture while running a clock, so nine of the fifteen squad rules are dead there. Five
     * picks scored on points, appearance, minutes and win participation is a real game and an
     * honest one, which is exactly the distinction the demo should show.
     */
    gameMode: 'pick5' as const,
    budgetMode: 'budget_free' as const,
  },
  {
    id: 'fantasy_rugby_kampala_2026',
    name: 'GoalPlace Rugby Fantasy Pilot',
    shortName: 'Rugby Fantasy',
    sport: 'rugby' as const,
    variant: 'rugby_15s',
    leagueId: 'league_rugby_kampala',
    seasonId: 'season_rugby_05_2026',
    scoringProfileId: 'fantasy_scoring_rugby_v1',
    squadRulesId: 'fantasy_squad_rugby_15s_v1',
    dataLevel: 'basic' as const,
    recordedStatKeys: ['active_squad', 'appearance', 'try', 'win_participation'],
  },
];

export const fantasyCompetitions: FantasyCompetition[] = definitions.map((definition) => ({
  /*
   * Season 1 runs budget free unless a definition says otherwise.
   *
   * Nothing in the platform computes a price, and a budget priced by hand from no performance
   * history creates noise rather than scarcity: the manager who wins is the one who guessed
   * which prices were wrong. Prices arrive in season 2, computed by the server from observed
   * points per appearance.
   */
  budgetMode: 'budget_free' as const,
  ...definition,
  scoringProfileVersion: 1,
  status: 'active',
  isFreeToPlay: true,
  creditsLabel: 'Fantasy Credits',
  approvedByUserId: 'user_platform_admin',
  activatedAt: createdAt,
  createdAt,
}));

export const fantasyRounds: FantasyRound[] = fantasyCompetitions.flatMap((competition) => {
  const matches = investorDemo.matches.filter((match) => match.leagueId === competition.leagueId);
  return Array.from({ length: 4 }, (_, index): FantasyRound => {
    const startsAt = new Date(Date.UTC(2026, 7, 8 + index * 7, 11)).toISOString();
    return {
      id: `${competition.id}_round_${index + 1}`,
      competitionId: competition.id,
      number: index + 1,
      name: `Round ${index + 1}`,
      matchIds: matches.slice(index * 5, index * 5 + 5).map((match) => match.id),
      startsAt,
      deadlineAt: startsAt,
      endsAt: new Date(Date.parse(startsAt) + 12 * 60 * 60_000).toISOString(),
      status: index === 0 ? 'open' : 'upcoming',
    };
  });
});

export const fantasyPlayers: FantasyPlayer[] = fantasyCompetitions.flatMap((competition) => {
  const rules = FANTASY_SQUAD_RULES.find((item) => item.id === competition.squadRulesId)!;
  const nextMatch = investorDemo.matches.find(
    (match) => match.leagueId === competition.leagueId && match.status === 'scheduled',
  );
  return investorDemo.athletes
    .filter((athlete) => athlete.leagueId === competition.leagueId)
    .flatMap((athlete, index): FantasyPlayer[] => {
      const positionGroup = positionGroupFor(rules, athlete.registeredPosition);
      if (!positionGroup) return [];
      return [{
        id: `${competition.id}_${athlete.id}`,
        competitionId: competition.id,
        athleteId: athlete.id,
        realTeamId: athlete.teamId,
        sport: competition.sport,
        position: athlete.registeredPosition,
        positionGroup,
        availability: index % 29 === 0 ? 'doubtful' : 'available',
        verifiedRecentForm: [
          3 + (index % 8),
          2 + ((index * 3) % 9),
          4 + ((index * 5) % 8),
        ],
        nextFixtureMatchId: nextMatch?.id,
        ownershipPercentage: Number((2 + ((index * 7) % 310) / 10).toFixed(1)),
        active: true,
      }];
    });
});

export const fantasyPlayerPrices: FantasyPlayerPrice[] = fantasyPlayers.map((player, index) => ({
  id: `${player.id}_price_v1`,
  competitionId: player.competitionId,
  athleteId: player.athleteId,
  credits: Number((4 + ((index * 13) % 45) / 10).toFixed(1)),
  version: 1,
  status: 'published',
  publishedAt: createdAt,
}));

const managerNames = [
  'Kampala Touchline', 'Verified XV', 'City Matchday', 'Nile Managers',
  'Community Select', 'The Round Table', 'Grassroots XI', 'East Stand',
];

export const fantasyLeaderboards: FantasyLeaderboardEntry[] = fantasyCompetitions.flatMap(
  (competition, competitionIndex) => managerNames.map((name, index) => ({
    id: `${competition.id}_leader_${index + 1}`,
    competitionId: competition.id,
    fantasyTeamId: `${competition.id}_team_${index + 1}`,
    userId: `fantasy_demo_user_${competitionIndex}_${index + 1}`,
    teamName: name,
    totalPoints: 318 - index * 17 - competitionIndex * 4,
    rank: index + 1,
    previousRank: index === 0 ? 2 : index,
    roundsPlayed: 4,
    updatedAt: createdAt,
  })),
);

function demoSquad(competition: FantasyCompetition) {
  const rules = FANTASY_SQUAD_RULES.find((item) => item.id === competition.squadRulesId)!;
  const playerPool = fantasyPlayers.filter((item) => item.competitionId === competition.id);
  const priceByAthlete = new Map(
    fantasyPlayerPrices
      .filter((item) => item.competitionId === competition.id)
      .map((item) => [item.athleteId, item.credits]),
  );
  const selected: FantasyPlayer[] = [];
  const teamCounts = new Map<string, number>();
  const add = (player: FantasyPlayer) => {
    if (selected.some((item) => item.athleteId === player.athleteId)) return false;
    if ((teamCounts.get(player.realTeamId) ?? 0) >= rules.maxFromRealTeam) return false;
    selected.push(player);
    teamCounts.set(player.realTeamId, (teamCounts.get(player.realTeamId) ?? 0) + 1);
    return true;
  };
  for (const group of rules.positionGroups) {
    const candidates = playerPool
      .filter((player) => player.positionGroup === group.id)
      .sort((left, right) =>
        (priceByAthlete.get(left.athleteId) ?? 0) - (priceByAthlete.get(right.athleteId) ?? 0),
      );
    for (const player of candidates) {
      if (selected.filter((item) => item.positionGroup === group.id).length >= group.minimum) break;
      add(player);
    }
  }
  for (const player of playerPool.sort((left, right) =>
    (priceByAthlete.get(left.athleteId) ?? 0) - (priceByAthlete.get(right.athleteId) ?? 0),
  )) {
    if (selected.length >= rules.squadSize) break;
    const group = rules.positionGroups.find((item) => item.id === player.positionGroup)!;
    if (selected.filter((item) => item.positionGroup === group.id).length < group.maximum) add(player);
  }
  return selected;
}

export const fantasyTeams: FantasyTeam[] = fantasyLeaderboards.map((entry) => ({
  id: entry.fantasyTeamId,
  competitionId: entry.competitionId,
  userId: entry.userId,
  name: entry.teamName,
  currentLineupVersionId: `${entry.fantasyTeamId}_lineup_v1`,
  conflictRoles: entry.rank === 4 ? ['team_admin'] : [],
  createdAt,
  updatedAt: createdAt,
}));

export const fantasyLineupVersions: FantasyLineupVersion[] = fantasyTeams.map((team) => {
  const competition = fantasyCompetitions.find((item) => item.id === team.competitionId)!;
  const rules = FANTASY_SQUAD_RULES.find((item) => item.id === competition.squadRulesId)!;
  const round = fantasyRounds.find((item) => item.competitionId === competition.id)!;
  const players = demoSquad(competition);
  const athleteIds = players.map((item) => item.athleteId);
  const priceByAthlete = new Map(
    fantasyPlayerPrices
      .filter((item) => item.competitionId === competition.id)
      .map((item) => [item.athleteId, item.credits]),
  );
  return {
    id: `${team.id}_lineup_v1`,
    fantasyTeamId: team.id,
    competitionId: competition.id,
    roundId: round.id,
    version: 1,
    squadAthleteIds: athleteIds,
    startingAthleteIds: athleteIds.slice(0, rules.startingSize),
    benchAthleteIds: athleteIds.slice(rules.startingSize),
    captainAthleteId: athleteIds[0],
    viceCaptainAthleteId: athleteIds[1],
    creditsUsed: athleteIds.reduce((total, id) => total + (priceByAthlete.get(id) ?? 0), 0),
    status: 'locked',
    submittedAt: createdAt,
    lockedAt: createdAt,
    createdAt,
  };
});

export const fantasyRoundScores: FantasyRoundScore[] = fantasyLeaderboards.map((entry) => ({
  id: `${entry.competitionId}_round_1_${entry.fantasyTeamId}`,
  competitionId: entry.competitionId,
  roundId: `${entry.competitionId}_round_1`,
  fantasyTeamId: entry.fantasyTeamId,
  lineupVersionId: `${entry.fantasyTeamId}_lineup_v1`,
  basePoints: Math.floor(entry.totalPoints / 4) - 3,
  captainBonus: 3,
  totalPoints: Math.floor(entry.totalPoints / 4),
  status: 'official',
  calculatedAt: createdAt,
}));

export const fantasyTransfers: FantasyTransfer[] = [];

export const fantasyAchievements: FantasyAchievement[] = fantasyLeaderboards.slice(0, 3).map((entry, index) => ({
  id: `${entry.fantasyTeamId}_achievement_${index + 1}`,
  competitionId: entry.competitionId,
  userId: entry.userId,
  fantasyTeamId: entry.fantasyTeamId,
  type: index === 0 ? 'round_top_10' : 'lineup_streak',
  title: index === 0 ? 'Round leader' : 'Lineup streak',
  earnedAt: createdAt,
}));

export const fantasyCorrections: FantasyCorrection[] = [{
  id: 'fantasy_rugby_kampala_2026:round_1:match_kcrc_01_01:v1-v2',
  competitionId: 'fantasy_rugby_kampala_2026',
  roundId: 'fantasy_rugby_kampala_2026_round_1',
  matchId: 'match_kcrc_01_01',
  previousOfficialResultVersion: 1,
  newOfficialResultVersion: 2,
  affectedFantasyTeamIds: ['fantasy_rugby_kampala_2026_team_1'],
  oldTotals: { fantasy_rugby_kampala_2026_team_1: 74 },
  newTotals: { fantasy_rugby_kampala_2026_team_1: 79 },
  reason: 'League-approved correction added one verified try to the official athlete record.',
  createdAt,
}];

export const fantasyPointEvents: FantasyPointEvent[] = fantasyCompetitions.flatMap(
  (competition, competitionIndex) => {
    const player = fantasyPlayers.find((item) => item.competitionId === competition.id);
    const round = fantasyRounds.find((item) => item.competitionId === competition.id);
    if (!player || !round) return [];
    return [
      {
        id: `${competition.id}_official_example`,
        idempotencyKey: `${competition.id}:${round.id}:official:v1:${player.athleteId}:appearance`,
        competitionId: competition.id,
        roundId: round.id,
        matchId: round.matchIds[0],
        officialResultVersion: 1,
        athleteId: player.athleteId,
        sourceEventId: `${round.matchIds[0]}:appearance`,
        scoringRuleId: 'appearance',
        quantity: 1,
        basePoints: 2,
        status: 'official' as const,
        createdAt,
      },
      {
        id: `${competition.id}_provisional_example`,
        idempotencyKey: `${competition.id}:${round.id}:provisional:${player.athleteId}`,
        competitionId: competition.id,
        roundId: round.id,
        matchId: round.matchIds[1],
        officialResultVersion: 0,
        athleteId: player.athleteId,
        sourceEventId: `${round.matchIds[1]}:provisional`,
        scoringRuleId: competitionIndex === 2 ? 'try' : competition.sport === 'football' ? 'goal' : 'points_scored',
        quantity: 1,
        basePoints: competitionIndex === 1 ? 3 : 5,
        status: 'provisional' as const,
        createdAt,
      },
    ];
  },
);

export const fantasyMiniLeagues: FantasyMiniLeague[] = [{
  id: 'fantasy_mini_kampala_touchline',
  competitionId: 'fantasy_rugby_kampala_2026',
  ownerUserId: 'fantasy_demo_user_2_1',
  name: 'Kampala Touchline',
  description: 'A free private table for community rugby managers.',
  inviteCode: 'KAMPALA26',
  visibility: 'private',
  approvalRequired: true,
  memberLimit: 40,
  status: 'active',
  createdAt,
}];

export const fantasyMiniLeagueMembers: FantasyMiniLeagueMember[] = fantasyLeaderboards
  .filter((entry) => entry.competitionId === 'fantasy_rugby_kampala_2026')
  .slice(0, 6)
  .map((entry, index) => ({
    id: `fantasy_mini_kampala_touchline_${entry.userId}`,
    miniLeagueId: 'fantasy_mini_kampala_touchline',
    competitionId: entry.competitionId,
    userId: entry.userId,
    fantasyTeamId: entry.fantasyTeamId,
    role: index === 0 ? 'owner' : 'member',
    status: 'active',
    joinedAt: createdAt,
  }));

export const fantasyDemo = {
  competitions: fantasyCompetitions,
  scoringProfiles: FANTASY_SCORING_PROFILES,
  squadRules: FANTASY_SQUAD_RULES,
  rounds: fantasyRounds,
  players: fantasyPlayers,
  playerPrices: fantasyPlayerPrices,
  pointEvents: fantasyPointEvents,
  teams: fantasyTeams,
  lineupVersions: fantasyLineupVersions,
  transfers: fantasyTransfers,
  roundScores: fantasyRoundScores,
  leaderboards: fantasyLeaderboards,
  miniLeagues: fantasyMiniLeagues,
  miniLeagueMembers: fantasyMiniLeagueMembers,
  achievements: fantasyAchievements,
  corrections: fantasyCorrections,
};

export function fantasyCompetitionBundle(competitionId: string) {
  const competition = fantasyCompetitions.find((item) => item.id === competitionId);
  if (!competition) return null;
  return {
    competition,
    league: investorDemo.leagues.find((item) => item.id === competition.leagueId),
    rounds: fantasyRounds.filter((item) => item.competitionId === competitionId),
    players: fantasyPlayers.filter((item) => item.competitionId === competitionId),
    prices: fantasyPlayerPrices.filter((item) => item.competitionId === competitionId),
    leaderboard: fantasyLeaderboards.filter((item) => item.competitionId === competitionId),
    pointEvents: fantasyPointEvents.filter((item) => item.competitionId === competitionId),
  };
}

export function fantasyPlayerCards(competitionId: string) {
  const priceByAthlete = new Map(
    fantasyPlayerPrices
      .filter((item) => item.competitionId === competitionId)
      .map((item) => [item.athleteId, item]),
  );
  return fantasyPlayers
    .filter((item) => item.competitionId === competitionId)
    .map((player) => {
      const athlete = investorDemo.athletes.find((item) => item.id === player.athleteId)!;
      const team = investorDemo.teams.find((item) => item.id === player.realTeamId);
      return {
        ...player,
        name: athlete.legalName,
        avatarUrl: athlete.avatarUrl ?? '/demo/assets/avatars/avatar_01.svg',
        teamName: team?.name ?? 'Independent',
        credits: priceByAthlete.get(player.athleteId)?.credits ?? 0,
      };
    });
}
