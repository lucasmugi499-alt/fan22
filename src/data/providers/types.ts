import {
  AdminAuditEvent,
  Athlete,
  AthleteClaim,
  AwardCategory,
  Challenge,
  Comment,
  FeedPost,
  FinalizationRecord,
  League,
  LeagueAdminApplication,
  LeagueNotice,
  Match,
  Notification,
  NotificationPreferences,
  Report,
  ResultSubmission,
  ResultSubmissionEvent,
  Roster,
  ScorerEntry,
  Season,
  Sport,
  SportSlug,
  Sponsor,
  SponsorCampaign,
  SponsorReport,
  StoredStanding,
  SupportNeed,
  Team,
  TeamAssignment,
  Invitation,
  User,
  Verification,
} from '@/types';
import { StandingRow } from '../mockDatabase';
import type {
  Allocation,
  ComplianceCase,
  Contribution,
  ContributionPurpose,
  PointsEvent,
  MobileMoneyProvider,
} from '@/types/money';
import type { ChallengeAction } from '@/lib/challenge';

export type DataProviderMode = 'mock' | 'firebase';

export type DataWriteResult = {
  ok: boolean;
  id?: string;
  mode: DataProviderMode;
  message?: string;
  actionUrl?: string;
  emailDelivery?: 'sent' | 'not_configured' | 'failed';
  emailMessageId?: string;
  emailError?: string;
};

export type FollowTargetType = 'athlete' | 'team' | 'league';
export type SaveTargetType = 'athlete' | 'team' | 'league' | 'match' | 'feedPost';

export type DataQueryOptions = {
  leagueId?: string;
  teamId?: string;
  athleteId?: string;
  matchId?: string;
  userId?: string;
  afterId?: string;
  limit?: number;
  audience?: LeagueNotice['audience'];
};

export type CreateContributionIntentInput = {
  supporterUserId: string;
  purpose: ContributionPurpose;
  recipientType: 'athlete' | 'team' | 'league' | 'programme';
  recipientId: string;
  supportNeedId?: string;
  campaignId?: string;
  supportAmountMinor: number;
  message?: string;
  /** Collected only for a provider-owned mobile-money prompt; never stored in public data. */
  customerPhone?: string;
  provider?: MobileMoneyProvider;
  idempotencyKey: string;
};

export type CreateFeedPostInput = Omit<FeedPost, 'id' | 'createdAt' | 'likesCount' | 'commentsCount' | 'sharesCount' | 'status'> & {
  id?: string;
  createdAt?: string;
  likesCount?: number;
  commentsCount?: number;
  sharesCount?: number;
  status?: FeedPost['status'];
};

export type CreateCommentInput = Omit<Comment, 'id' | 'createdAt' | 'status'> & {
  id?: string;
  createdAt?: string;
  status?: Comment['status'];
};

export type FeedEngagementInput =
  | { action: 'reaction'; postId: string; userId: string }
  | { action: 'share'; postId: string; userId: string }
  | { action: 'comment'; postId: string; userId: string; text: string }
  | { action: 'report'; postId: string; userId: string; reason: string };

export type CreateResultSubmissionInput = {
  match: Pick<
    Match,
    'id' | 'leagueId' | 'seasonId' | 'homeTeamId' | 'awayTeamId'
  >;
  submittedByTeamId: string;
  submittedByUserId: string;
  homeScore: number;
  awayScore: number;
  scorers?: ScorerEntry[];
  evidenceRefs?: string[];
  evidenceNote?: string;
};

export type ResolveResultSubmissionInput = {
  matchId: string;
  resolvedByUserId: string;
  decision: 'uphold' | 'correct' | 'reject';
  correctedScore?: { home: number; away: number };
  note?: string;
};

export type ApproveResultCorrectionInput = {
  matchId: string;
  actorUserId: string;
  homeScore: number;
  awayScore: number;
  reason: string;
};

export type TransitionChallengeInput = {
  challengeId: string;
  actorUserId: string;
  action: ChallengeAction;
  note?: string;
  evidenceRefs?: string[];
};

export type RecordPointsActionInput = {
  userId: string;
  actionType: Exclude<PointsEvent['actionType'], 'verified_need_supported'>;
  relatedEntityId?: string;
};

export type ReviewSupportNeedInput = {
  supportNeedId: string;
  actorUserId: string;
  action: 'team_verify' | 'team_reject' | 'league_approve' | 'league_reject';
  note?: string;
};

export type CompleteSupportNeedInput = {
  supportNeedId: string;
  actorUserId: string;
  note: string;
};

export type EditableUserProfile = {
  name?: string;
  displayName?: string;
  city?: string;
  avatarUrl?: string;
  sportPreferences?: SportSlug[];
  followedAthletes?: string[];
  followedTeams?: string[];
  followedLeagues?: string[];
  notificationPreferences?: NotificationPreferences;
  lowDataMode?: boolean;
  onboardingCompletedAt?: string;
};

export type EditableAthleteProfile = Pick<
  Athlete,
  'name' | 'bio' | 'city' | 'avatarUrl' | 'coverUrl' | 'impactNeeds'
>;

export type EditableTeamProfile = Pick<
  Team,
  'name' | 'city' | 'location' | 'description' | 'logoUrl' | 'teamAdminName' | 'teamAdminEmail'
>;

export type EditableLeagueProfile = Pick<
  League,
  'name' | 'city' | 'description' | 'status' | 'plan' | 'verified'
>;

export type CreateLeagueNoticeInput = Omit<LeagueNotice, 'id' | 'createdAt'> & {
  id?: string;
};

export type CreateSupportNeedInput = Omit<
  SupportNeed,
  'id' | 'raisedAmount' | 'recipientUpdates' | 'createdAt' | 'updatedAt'
> & {
  id?: string;
};

export type ResultSubmissionListener = (
  submission: ResultSubmission | undefined,
) => void;
export type NotificationListener = (notifications: Notification[]) => void;

export interface GoalPlaceDataProvider {
  mode: DataProviderMode;
  getSports(): Promise<Sport[]>;
  getUsers(): Promise<User[]>;
  getUserById(id: string): Promise<User | undefined>;
  getSponsors(): Promise<Sponsor[]>;
  getAwardCategories(): Promise<AwardCategory[]>;
  getLeagues(): Promise<League[]>;
  getSeasons(): Promise<Season[]>;
  getLeagueById(id: string): Promise<League | undefined>;
  getTeams(options?: DataQueryOptions): Promise<Team[]>;
  getTeamById(id: string): Promise<Team | undefined>;
  getAthletes(options?: DataQueryOptions): Promise<Athlete[]>;
  getAthleteById(id: string): Promise<Athlete | undefined>;
  getAthleteClaims(options?: DataQueryOptions): Promise<AthleteClaim[]>;
  getMatches(options?: DataQueryOptions): Promise<Match[]>;
  getMatchById(id: string): Promise<Match | undefined>;
  getChallenges(options?: DataQueryOptions): Promise<Challenge[]>;
  getChallengeById(id: string): Promise<Challenge | undefined>;
  getFeedPosts(options?: DataQueryOptions): Promise<FeedPost[]>;
  getLatestFeedPosts(limit?: number): Promise<FeedPost[]>;
  getFeedPostById(id: string): Promise<FeedPost | undefined>;
  getFeedReaction(postId: string, userId: string): Promise<boolean>;
  getCommentsByPost(postId: string): Promise<Comment[]>;
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  getReports(): Promise<Report[]>;
  getVerifications(): Promise<Verification[]>;
  getTeamAssignments(): Promise<TeamAssignment[]>;
  getInvitationById(id: string): Promise<Invitation | undefined>;
  getTeamAssignmentById(id: string): Promise<TeamAssignment | undefined>;
  getRosters(options?: DataQueryOptions): Promise<Roster[]>;
  getResultSubmissionEvents(matchId: string): Promise<ResultSubmissionEvent[]>;
  getStoredStandings(): Promise<StoredStanding[]>;
  getSponsorReports(): Promise<SponsorReport[]>;
  getSponsorCampaigns(): Promise<SponsorCampaign[]>;
  getLeagueNotices(options?: DataQueryOptions): Promise<LeagueNotice[]>;
  getFinalizations(): Promise<FinalizationRecord[]>;
  getSupportNeeds(options?: DataQueryOptions): Promise<SupportNeed[]>;
  getLeagueAdminApplications(): Promise<LeagueAdminApplication[]>;
  getAdminAuditEvents(): Promise<AdminAuditEvent[]>;
  getContributionsByUser(userId: string): Promise<Contribution[]>;
  getAllocations(): Promise<Allocation[]>;
  getComplianceCases(): Promise<ComplianceCase[]>;
  getStandingsByLeague(leagueId: string): Promise<StandingRow[]>;
  getTopSupportedAthletes(limit?: number): Promise<Athlete[]>;
  getTopPointsAthletes(limit?: number): Promise<Athlete[]>;
  getActiveChallenges(): Promise<Challenge[]>;
  getVerifiedMatches(): Promise<Match[]>;
  getResultSubmission(matchId: string): Promise<ResultSubmission | undefined>;
  getTeamConfirmationInbox(teamId: string): Promise<ResultSubmission[]>;
  getLeagueResultExceptions(leagueId: string): Promise<ResultSubmission[]>;
  createContributionIntent(data: CreateContributionIntentInput): Promise<DataWriteResult>;
  recordPointsAction(data: RecordPointsActionInput): Promise<DataWriteResult>;
  createFeedPost(data: CreateFeedPostInput): Promise<DataWriteResult>;
  createComment(data: CreateCommentInput): Promise<DataWriteResult>;
  engageFeedPost(data: FeedEngagementInput): Promise<DataWriteResult>;
  toggleFollow(userId: string, targetType: FollowTargetType, targetId: string): Promise<DataWriteResult>;
  toggleSave(userId: string, targetType: SaveTargetType, targetId: string): Promise<DataWriteResult>;
  updateUserProfile(userId: string, data: EditableUserProfile): Promise<DataWriteResult>;
  updateAthleteProfile(athleteId: string, data: Partial<EditableAthleteProfile>): Promise<DataWriteResult>;
  createAthleteProfile(data: {
    teamId: string;
    name: string;
    position: string;
    ageGroup: Athlete['ageGroup'];
  }): Promise<DataWriteResult>;
  requestAthleteClaim(athleteId: string, userId: string): Promise<DataWriteResult>;
  reviewAthleteClaim(
    claimId: string,
    actorUserId: string,
    action: 'team_confirm' | 'league_verify' | 'reject',
    reason?: string,
  ): Promise<DataWriteResult>;
  updateTeamProfile(teamId: string, data: Partial<EditableTeamProfile>): Promise<DataWriteResult>;
  saveRoster(roster: Roster): Promise<DataWriteResult>;
  createChallenge(data: Omit<Challenge, 'id' | 'createdAt'> & { id?: string }): Promise<DataWriteResult>;
  transitionChallenge(data: TransitionChallengeInput): Promise<DataWriteResult>;
  createLeagueNotice(data: CreateLeagueNoticeInput): Promise<DataWriteResult>;
  createLeague(data: Omit<League, 'id' | 'createdAt'> & { id?: string }): Promise<DataWriteResult>;
  updateLeagueProfile(leagueId: string, data: Partial<EditableLeagueProfile>): Promise<DataWriteResult>;
  createSeason(data: Omit<Season, 'id' | 'createdAt'> & { id?: string }): Promise<DataWriteResult>;
  transitionSeason(seasonId: string, status: Season['status']): Promise<DataWriteResult>;
  createTeams(teams: Team[]): Promise<DataWriteResult>;
  createFixtures(fixtures: Match[]): Promise<DataWriteResult>;
  createTeamAdminInvitation(data: TeamAssignment): Promise<DataWriteResult>;
  acceptTeamAdminInvitation(assignmentId: string, userId: string, token: string): Promise<DataWriteResult>;
  acceptInvitation(invitationId: string, userId: string, token: string): Promise<DataWriteResult>;
  revokeTeamAssignment(assignmentId: string, actorUserId: string, note?: string): Promise<DataWriteResult>;
  markNotificationRead(notificationId: string, read?: boolean): Promise<DataWriteResult>;
  markAllNotificationsRead(userId: string): Promise<DataWriteResult>;
  subscribeToNotifications(
    userId: string,
    listener: NotificationListener,
    onError?: (error: Error) => void,
  ): () => void;
  createSupportNeed(data: CreateSupportNeedInput): Promise<DataWriteResult>;
  addSupportNeedUpdate(
    needId: string,
    input: { message: string; evidenceUrl?: string },
  ): Promise<DataWriteResult>;
  reviewSupportNeed(data: ReviewSupportNeedInput): Promise<DataWriteResult>;
  completeSupportNeed(data: CompleteSupportNeedInput): Promise<DataWriteResult>;
  createLeagueAdminApplication(
    data: Omit<LeagueAdminApplication, 'id' | 'status' | 'createdAt'> & { id?: string },
  ): Promise<DataWriteResult>;
  reviewApproval(input: {
    targetCollection: 'athletes' | 'leagues' | 'leagueAdminApplications';
    targetId: string;
    actorUserId: string;
    decision: 'approved' | 'rejected' | 'requested_information';
    note?: string;
  }): Promise<DataWriteResult>;
  resolveReport(input: {
    reportId: string;
    actorUserId: string;
    decision: 'resolved' | 'dismissed';
    note?: string;
  }): Promise<DataWriteResult>;
  createResultSubmission(data: CreateResultSubmissionInput): Promise<DataWriteResult>;
  confirmResultSubmission(matchId: string, respondedByUserId: string): Promise<DataWriteResult>;
  disputeResultSubmission(
    matchId: string,
    respondedByUserId: string,
    reason: string,
  ): Promise<DataWriteResult>;
  finalizeResultSubmission(matchId: string): Promise<DataWriteResult>;
  resolveDisputedSubmission(data: ResolveResultSubmissionInput): Promise<DataWriteResult>;
  requestResultCorrection(
    matchId: string,
    requestedByUserId: string,
    reason: string,
  ): Promise<DataWriteResult>;
  approveResultCorrection(data: ApproveResultCorrectionInput): Promise<DataWriteResult>;
  subscribeToResultSubmission(
    matchId: string,
    listener: ResultSubmissionListener,
    onError?: (error: Error) => void,
  ): () => void;
}
