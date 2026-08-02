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
   * box-score detail.
   */
  dataCoverage?: 'complete' | 'scorer_only' | 'match_squad_basic';
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
