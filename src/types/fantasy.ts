export type FantasySport = 'football' | 'basketball' | 'rugby';
export type FantasyDataLevel = 'basic' | 'standard' | 'advanced';
export type FantasyPointStatus =
  | 'provisional'
  | 'pending_verification'
  | 'official'
  | 'corrected'
  | 'superseded';

export type FantasyCompetitionStatus =
  | 'draft'
  | 'proposed'
  | 'approved'
  | 'active'
  | 'completed'
  | 'archived';

export type FantasyDeadlineStrategy = 'first_round_kickoff';

/**
 * Whether squads are constrained by a credit budget.
 *
 * Nothing in the platform computes a price. A budget only creates interesting decisions when
 * prices reflect something real, and prices assigned by hand from no performance history
 * create noise that looks like a skill game and is not. `budget_free` runs the squad game on
 * positional groups and the per-club maximum alone, which is a complete game and is how the
 * competition can launch before a season of observed data exists. `credits` is the season-2
 * mode, once prices are computed from observed points per appearance rather than typed by an
 * administrator.
 */
export type FantasyBudgetMode = 'credits' | 'budget_free';

/**
 * Which game a competition runs.
 *
 * `season_squad` is the deep game: fifteen players, positional groups, transfers, a season's
 * commitment. `pick5` is the on-ramp: five athletes, one captain, one scout slot, reset every
 * round. They are not two scoring systems. Both consume the same point events, the same
 * scoring profiles and the same correction pipeline; Pick 5 is a different lineup shape and a
 * different cadence over identical points.
 *
 * The squad game assumes a large pool of players the fan already knows and a price history
 * that makes a budget meaningful. Neither holds in a grassroots league at launch, which is
 * why the smaller game is the one most people will actually play.
 */
export type FantasyGameMode = 'season_squad' | 'pick5';

export interface FantasyScoringRule {
  id: string;
  label: string;
  stat:
    | 'active_squad'
    | 'appearance'
    | 'minimum_duration'
    | 'goal'
    | 'clean_sheet'
    | 'saves'
    | 'penalty_save'
    | 'goals_conceded'
    | 'own_goal'
    | 'points_scored'
    | 'rebound'
    | 'assist'
    | 'steal'
    | 'block'
    | 'turnover'
    | 'double_double'
    | 'triple_double'
    | 'try'
    | 'conversion'
    | 'penalty_goal'
    | 'drop_goal'
    | 'player_of_match'
    | 'win_participation'
    | 'yellow_card'
    | 'red_card';
  points: number;
  per?: number;
  minimumMinutes?: number;
  positionPoints?: Record<string, number>;
  requiredDataLevel: FantasyDataLevel;
  requiredStatKey: string;
  enabled: boolean;
}

export interface FantasyScoringProfile {
  id: string;
  sport: FantasySport;
  variant: string;
  name: string;
  version: number;
  status: 'approved' | 'retired';
  rules: FantasyScoringRule[];
  captainMultiplier: number;
  createdAt: string;
  publishedAt: string;
}

export interface FantasyPositionGroupRule {
  id: string;
  label: string;
  positions: string[];
  minimum: number;
  maximum: number;
}

export interface FantasySquadRules {
  id: string;
  sport: FantasySport;
  variant: string;
  version: number;
  squadSize: number;
  startingSize: number;
  benchSize: number;
  budgetCredits: number;
  maxFromRealTeam: number;
  captainRequired: boolean;
  viceCaptainRequired: boolean;
  transferAllowancePerRound: number;
  deadlineStrategy: FantasyDeadlineStrategy;
  positionGroups: FantasyPositionGroupRule[];
  createdAt: string;
}

export interface FantasyCompetition {
  id: string;
  name: string;
  shortName: string;
  sport: FantasySport;
  variant: string;
  leagueId: string;
  seasonId: string;
  scoringProfileId: string;
  scoringProfileVersion: number;
  squadRulesId: string;
  dataLevel: FantasyDataLevel;
  recordedStatKeys: string[];
  /** Absent means `credits`, which is what every record written before budget-free existed meant. */
  budgetMode?: FantasyBudgetMode;
  /** Absent means `season_squad`, the only game that existed before Pick 5. */
  gameMode?: FantasyGameMode;
  /**
   * The ownership ceiling for a Pick 5 scout pick, as a percentage.
   *
   * Configured per competition rather than fixed, because five percent is a guess that only
   * works at a particular audience size. With a few hundred managers it may need to be ten.
   */
  scoutOwnershipThresholdPercent?: number;
  status: FantasyCompetitionStatus;
  isFreeToPlay: true;
  creditsLabel: 'Fantasy Credits';
  proposedByUserId?: string;
  approvedByUserId?: string;
  activatedAt?: string;
  createdAt: string;
}

export interface FantasyRound {
  id: string;
  competitionId: string;
  number: number;
  name: string;
  matchIds: string[];
  startsAt: string;
  deadlineAt: string;
  endsAt: string;
  status: 'upcoming' | 'open' | 'locked' | 'scoring' | 'official' | 'corrected';
}

export interface FantasyPlayer {
  id: string;
  competitionId: string;
  athleteId: string;
  realTeamId: string;
  sport: FantasySport;
  position: string;
  positionGroup: string;
  availability: 'available' | 'doubtful' | 'unavailable' | 'suspended';
  verifiedRecentForm: number[];
  nextFixtureMatchId?: string;
  ownershipPercentage: number;
  active: boolean;
}

export interface FantasyPlayerPrice {
  id: string;
  competitionId: string;
  athleteId: string;
  credits: number;
  version: number;
  status: 'draft' | 'published' | 'superseded';
  publishedAt?: string;
}

export interface FantasyTeam {
  id: string;
  competitionId: string;
  userId: string;
  name: string;
  currentLineupVersionId?: string;
  conflictRoles: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FantasyLineupVersion {
  id: string;
  fantasyTeamId: string;
  competitionId: string;
  roundId: string;
  version: number;
  squadAthleteIds: string[];
  startingAthleteIds: string[];
  benchAthleteIds: string[];
  captainAthleteId: string;
  viceCaptainAthleteId: string;
  /**
   * The Pick 5 scout pick: an athlete owned by fewer than the competition's threshold.
   *
   * Absent for the season squad game, which has no scout slot.
   */
  scoutAthleteId?: string;
  creditsUsed: number;
  status: 'draft' | 'submitted' | 'locked' | 'superseded';
  submittedAt?: string;
  lockedAt?: string;
  createdAt: string;
}

export interface FantasyTransfer {
  id: string;
  competitionId: string;
  fantasyTeamId: string;
  roundId: string;
  userId: string;
  athleteOutId: string;
  athleteInId: string;
  lineupVersionId: string;
  status: 'submitted' | 'applied' | 'rejected';
  createdAt: string;
}

export interface FantasyPointEvent {
  id: string;
  idempotencyKey: string;
  competitionId: string;
  roundId: string;
  matchId: string;
  officialResultVersion: number;
  athleteId: string;
  sourceEventId: string;
  scoringRuleId: string;
  quantity: number;
  basePoints: number;
  status: FantasyPointStatus;
  createdAt: string;
  supersededAt?: string;
}

export interface FantasyRoundScore {
  id: string;
  competitionId: string;
  roundId: string;
  fantasyTeamId: string;
  lineupVersionId: string;
  basePoints: number;
  captainBonus: number;
  totalPoints: number;
  status: FantasyPointStatus;
  calculatedAt: string;
}

export interface FantasyLeaderboardEntry {
  id: string;
  competitionId: string;
  fantasyTeamId: string;
  userId: string;
  teamName: string;
  totalPoints: number;
  rank: number;
  previousRank?: number;
  roundsPlayed: number;
  updatedAt: string;
}

export interface FantasyMiniLeague {
  id: string;
  competitionId: string;
  ownerUserId: string;
  name: string;
  description: string;
  inviteCode: string;
  visibility: 'public' | 'private';
  approvalRequired: boolean;
  memberLimit: number;
  status: 'active' | 'archived';
  createdAt: string;
}

export interface FantasyMiniLeagueMember {
  id: string;
  miniLeagueId: string;
  competitionId: string;
  userId: string;
  fantasyTeamId: string;
  role: 'owner' | 'moderator' | 'member';
  status: 'pending' | 'active' | 'removed';
  joinedAt: string;
}

export interface FantasyAchievement {
  id: string;
  competitionId: string;
  userId: string;
  fantasyTeamId: string;
  type: 'lineup_streak' | 'captain_result' | 'round_top_10' | 'team_of_the_week';
  title: string;
  earnedAt: string;
}

export interface FantasyCorrection {
  id: string;
  competitionId: string;
  roundId: string;
  matchId: string;
  previousOfficialResultVersion: number;
  newOfficialResultVersion: number;
  affectedFantasyTeamIds: string[];
  oldTotals: Record<string, number>;
  newTotals: Record<string, number>;
  reason: string;
  createdAt: string;
}

export interface FantasyOfficialAthletePerformance {
  id: string;
  matchId: string;
  athleteId: string;
  realTeamId: string;
  sport: FantasySport;
  position: string;
  positionGroup: string;
  officialResultVersion: number;
  verificationStatus: 'verified';
  dataLevel: FantasyDataLevel;
  /**
   * `scorer_only` records contain trusted scoring events but are not evidence of a
   * complete match squad. `match_squad_basic` records come from a verified final-report
   * active squad, but still do not include duration, card, assist, rebound, or full
   * box-score detail. `verified_stat_line` records come from a finalized match report
   * carrying sport-specific per-athlete stats.
   */
  dataCoverage?: 'complete' | 'scorer_only' | 'match_squad_basic' | 'verified_stat_line';
  activeSquad: boolean;
  didPlay: boolean;
  minutesPlayed: number;
  teamWon: boolean;
  playerOfMatch: boolean;
  stats: Record<string, number>;
  sourceEventIds: Record<string, string>;
}

export interface FantasySquadValidation {
  valid: boolean;
  errors: string[];
  creditsUsed: number;
  creditsRemaining: number;
}
