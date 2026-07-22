export type SportSlug = "football" | "basketball" | "rugby";

export type UserRole =
  | "fan"
  | "athlete"
  | "team_admin"
  | "league_admin"
  | "sponsor"
  | "platform_admin"
  | "super_admin";

export type AppRole = UserRole;

export type ProfileStatus = "active" | "pending" | "suspended";

export type SportType = "Football" | "Basketball" | "Rugby";

export type LeagueStatus =
  | "draft"
  | "community"
  | "verified"
  | "partner"
  | "suspended";

export type PlanType = "free" | "pro" | "partner";

export type SeasonStatus =
  | "draft"
  | "registration"
  | "active"
  | "completed"
  | "archived";

export type CompetitionFormat = "league" | "knockout" | "group_knockout";

/**
 * Points awarded per result. Sport-specific because the platform runs football, basketball
 * and rugby side by side and they do not share a scoring system: football is 3/1/0,
 * basketball has no draws at all, and rugby is 4/2/0.
 *
 * `draw: null` means the sport cannot draw — a drawn scoreline is a data error rather than
 * a zero-point result, and standings surface it as such instead of silently awarding 0.
 *
 * Rugby bonus points (a try bonus, and a losing bonus inside a 7-point margin) are NOT
 * modelled here yet: awarding them requires per-team try counts, and `MatchEvent` does not
 * carry them. Adding bonus rules later only extends this record — it does not migrate any
 * match data — whereas omitting `seasonId` from matches now would.
 */
export interface SeasonScoringRules {
  win: number;
  draw: number | null;
  loss: number;
}

/**
 * A season is the unit that competition records belong to. Without it, a league's history
 * is a single undifferentiated pile: last year's table cannot be told from this year's, a
 * roster that changed between seasons cannot be represented, and an athlete's career
 * cannot be read season by season — which is the historical record the platform's
 * long-term value rests on.
 */
export interface Season {
  id: string;
  leagueId: string;
  /** Human label, e.g. "2026 Regular Season". Unique within a league. */
  name: string;
  sport: SportSlug;
  status: SeasonStatus;
  startDate: string;
  endDate?: string;
  competitionFormat: CompetitionFormat;
  scoring: SeasonScoringRules;
  createdAt: string;
}

/**
 * Status vocabularies are canonical lowercase, matching how records are stored in
 * Firestore and the seed data. They previously carried both casings in the same union,
 * which meant `status === 'Verified'` silently returned false for the majority of records
 * that store `'verified'` — so comparisons had to defend with `.toLowerCase()` and any
 * that forgot were quietly wrong. Normalize once at the data boundary
 * (`src/lib/status.ts`), compare against these values, and render labels with the display
 * helpers rather than comparing against human-readable text.
 */

/** Lifecycle only. Whether a result is trustworthy is `verificationStatus`, not this. */
export type MatchStatus = "scheduled" | "live" | "completed" | "cancelled";

export type VerificationStatus = "pending" | "verified" | "rejected" | "disputed";

export type ChallengeStatus =
  | "open"
  | "locked"
  | "achieved"
  | "failed"
  | "paid"
  | "refunded"
  | "disputed";

/**
 * Result submission lifecycle.
 *
 * There is deliberately ONE status field. An earlier draft paired `status` with a separate
 * `opponentResponse`, which reintroduces exactly the failure this codebase just spent a
 * migration removing: two fields describing one truth, free to contradict each other
 * (`status: 'confirmed'` alongside `opponentResponse: 'disputed'`). The opponent's answer
 * is implied by the status — `pending_confirmation` means they have not answered,
 * `confirmed` and `disputed` are their answer — and who supplied it is recorded in
 * `resolution` and `respondedByUserId`.
 *
 * `official` is reachable only by `system`. No client may write it; see firestore.rules.
 */
export type ResultSubmissionStatus =
  | "pending_confirmation"
  /** 72h elapsed with no opponent response. Escalated to the league — never auto-confirmed. */
  | "confirmation_overdue"
  /** Settled and awaiting finalization. How it settled is `finalizationSource`, not a status. */
  | "confirmed"
  | "disputed"
  | "official"
  | "rejected"
  | "withdrawn"
  /** A previously official result replaced by a correction. Archived, never mutated. */
  | "superseded";

/**
 * How a result became finalizable. Deliberately a separate field rather than three
 * finalizable statuses: the status says *whether* a submission is ready, this says *how* it
 * got there. Folding provenance into the status would put two facts in one field — the
 * failure mode this codebase has already had to migrate away from twice.
 *
 * A league admin confirming after silence does NOT carry the provenance of mutual
 * confirmation. The public result may still read "Official"; the audit trail must not.
 */
export type FinalizationSource =
  | "mutual_confirmation"
  | "league_admin_dispute_resolution"
  | "league_admin_nonresponse_confirmation"
  | "correction";

export type ResultSubmissionActor =
  | "submitting_team"
  | "opponent_team"
  | "league_admin"
  | "system";

/** How a submission came to be settled, kept for audit after the fact. */
export type ResultResolution =
  | "opponent_confirmed"
  | "league_confirmed_unresponsive"
  | "league_upheld"
  | "league_corrected";

export interface ScorerEntry {
  athleteId: string;
  teamId: string;
  /** Goals, tries or points attributed to this athlete. */
  count: number;
  minute?: number;
}

/**
 * A claim about a match result, made by one team and answered by the other.
 *
 * This is NOT the official record. Team admins never write to `matches` — they write here,
 * and a trusted server-side finalizer promotes a settled submission onto the match. That
 * separation is what lets Team Admins report results without being able to author official
 * data.
 *
 * The document id is the `matchId`. That is load-bearing: it makes "one active submission
 * per match" an atomic guarantee from Firestore itself, so two team admins submitting
 * simultaneously resolve by first-write-wins with no transaction. The loser of that race
 * is routed to respond to the existing submission rather than creating a second one.
 */
export interface ResultSubmission {
  /** Equal to `matchId` — see the note above. */
  id: string;
  matchId: string;
  leagueId: string;
  seasonId: string;

  submittedByTeamId: string;
  opponentTeamId: string;
  submittedByUserId: string;

  /** The score as claimed by the submitting team. Never overwritten. */
  homeScore: number;
  awayScore: number;
  /** Set only when a league admin adjudicates a different score. */
  correctedHomeScore?: number;
  correctedAwayScore?: number;

  scorers: ScorerEntry[];
  evidenceRefs: string[];
  evidenceNote?: string;

  status: ResultSubmissionStatus;
  /** Increments when a new submission replaces a rejected or withdrawn one. */
  revision: number;

  respondedByUserId?: string;
  disputeReason?: string;

  resolvedByUserId?: string;
  resolution?: ResultResolution;
  finalDecisionNote?: string;

  /** Set true only when the submitter explicitly declares the match ended. */
  submittedAsFinal: boolean;
  /** 72h after submission. Passing it escalates; it never confirms anything. */
  confirmationDeadline: string;
  remindersSentAt?: string[];

  /** How this result became official. Required once status is `official`. */
  finalizationSource?: FinalizationSource;
  confirmedByUserId?: string;
  confirmationReason?: string;
  confirmedAt?: string;

  /**
   * Official results are versioned, not immutable-forever. Referee corrections,
   * eligibility rulings and abandoned matches are ordinary sports operations; the pilot
   * cannot depend on super-admin database surgery for them.
   */
  resultVersion: number;
  supersedesSubmissionId?: string;
  supersededBySubmissionId?: string;
  correctionReason?: string;
  correctionRequestedBy?: string;
  correctionApprovedBy?: string;

  /**
   * `${matchId}:${id}:${resultVersion}`. The finalizer no-ops if this key is already
   * recorded, so an onWrite retry or the reconciliation sweep cannot double-apply a result.
   */
  finalizationKey?: string;

  submittedAt: string;
  respondedAt?: string;
  resolvedAt?: string;
  finalizedAt?: string;
}

/** One immutable entry per transition, stored in the submission's `events` subcollection. */
export interface ResultSubmissionEvent {
  id: string;
  submissionId: string;
  from: ResultSubmissionStatus | null;
  to: ResultSubmissionStatus;
  actor: ResultSubmissionActor;
  actorUserId: string;
  note?: string;
  createdAt: string;
}

export type SupportType =
  | "direct_support"
  | "performance_pledge"
  | "team_pool"
  | "league_campaign";

export type SupportStatus =
  | "pending"
  | "held"
  | "released"
  | "refunded"
  | "failed";

export type FeedPostType =
  | "athlete_highlight"
  | "verified_achievement"
  | "match_result"
  | "support_milestone"
  | "league_update"
  | "league_announcement"
  | "team_update"
  | "fan_comment"
  | "sponsor_impact"
  | "awards_update"
  | "annual_awards"
  | "VerifiedAchievement"
  | "AthleteHighlight"
  | "MatchResult"
  | "SupportMilestone"
  | "LeagueUpdate"
  | "SponsorImpact"
  | "AnnualAwards";

export type Currency = "UGX";

export interface UserProfile {
  id: string;
  uid: string;
  email: string;
  name: string;
  role: AppRole;
  status: ProfileStatus;
  avatarUrl?: string;
  points: number;
  walletBalance: number;
  followedAthletes: string[];
  followedTeams: string[];
  followedLeagues: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface GoalPlaceIndexSignals {
  verification: number;
  matchCompletionRate: number;
  athleteProfileCompletion: number;
  fanEngagement: number;
  supportActivity: number;
  adminReliability: number;
  mediaUploads: number;
}

export interface Sport {
  id: SportSlug;
  name: string;
  icon: string;
  color: string;
  gradient: string;
  description: string;
  statLabels: string[];
  challengeExamples: string[];
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  name?: string;
  role: UserRole;
  photoURL?: string;
  avatarUrl?: string;
  city: string;
  country: "Uganda";
  points: number;
  walletBalance: number;
  followedAthletes?: string[];
  followedTeams?: string[];
  followedLeagues?: string[];
  status: ProfileStatus;
  createdAt: string;
}

export interface League {
  id: string;
  name: string;
  sport: SportSlug | SportType;
  city: string;
  country: "Uganda";
  description: string;
  status: LeagueStatus;
  plan: PlanType;
  verified: boolean;
  adminUserIds: string[];
  /** Legacy label retained for display; `currentSeasonId` is the real relationship. */
  season: string;
  /** The season new fixtures belong to and that dashboards default to. */
  currentSeasonId?: string;
  teamsCount: number;
  athletesCount: number;
  matchesCount: number;
  matchCompletionRate: number;
  verifiedResultsRate: number;
  goalPlaceIndex: number;
  ranking?: number;
  logoUrl?: string;
  verifiedPercentage?: number;
  completionRate?: number;
  indexSignals?: GoalPlaceIndexSignals;
  totalSupport: number;
  supportersCount: number;
  verificationRules: {
    requiresLeagueAdminApproval: boolean;
    requiresRefereeConfirmation: boolean;
    allowsPerformancePledges: boolean;
  };
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  sport: SportSlug | SportType;
  leagueId: string;
  city: string;
  location?: string;
  country: "Uganda";
  description: string;
  logoURL?: string;
  logoUrl?: string;
  plan: "free" | "pro";
  verified: boolean;
  adminUserIds: string[];
  totalSupport: number;
  supportPool?: number;
  supportersCount: number;
  wins: number;
  draws?: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  leaguePoints: number;
  recentResults?: string[];
  teamAdminName?: string;
  teamAdminEmail?: string;
  rosterCompleteness?: number;
  verificationStatus?: VerificationStatus;
  pendingSubmissions?: number;
  lastUpdated?: string;
  record?: string;
  publicProfileCompleteness?: number;
  sponsorVisibility?: string;
  createdAt: string;
}

export interface Athlete {
  id: string;
  userId?: string;
  name: string;
  sport: SportSlug | SportType;
  position: string;
  teamId: string;
  leagueId: string;
  city: string;
  country: "Uganda";
  ageGroup: "U18" | "U21" | "Senior";
  bio: string;
  avatarURL?: string;
  avatarUrl?: string;
  coverURL?: string;
  coverUrl?: string;
  verified: boolean;
  verificationStatus: VerificationStatus;
  totalSupport: number;
  totalEarnings?: number;
  supportersCount: number;
  goalPlacePoints: number;
  stats: Record<string, number>;
  impactNeeds: string[];
  createdAt: string;
}

export interface Match {
  id: string;
  sport: SportSlug | SportType;
  leagueId: string;
  seasonId: string;
  homeTeamId: string;
  teamAId?: string;
  awayTeamId: string;
  teamBId?: string;
  venue: string;
  city: string;
  scheduledAt: string;
  date?: string;
  status: MatchStatus;
  score: {
    home: number | null;
    away: number | null;
  };
  verificationStatus: VerificationStatus;
  /**
   * Which submission version produced the live official result. Guards against a stale
   * finalization overwriting a newer correction: the idempotency ledger cannot catch that,
   * because v1 and v2 have different finalization keys.
   */
  officialResultVersion?: number;
  verifiedBy?: string;
  topPerformerId?: string;
  supportersCount: number;
  totalSupport: number;
  teamAScore?: number;
  teamBScore?: number;
  events: MatchEvent[];
  createdAt: string;
}

export interface MatchEvent {
  minute?: number;
  period?: string;
  type: string;
  athleteId?: string;
  teamId: string;
  description: string;
}

export interface Challenge {
  id: string;
  athleteId: string;
  matchId: string;
  leagueId: string;
  seasonId: string;
  sport: SportSlug | SportType;
  type: string;
  target: number;
  description: string;
  targetDescription?: string;
  totalPledged: number;
  supportersCount: number;
  status: ChallengeStatus;
  verificationStatus: VerificationStatus;
  submittedBy?: string;
  evidenceStatus?: string;
  amountAffected?: number;
  actionHistory?: string[];
  createdAt: string;
}

export interface SupportPledge {
  id: string;
  fanId: string;
  athleteId?: string;
  teamId?: string;
  leagueId?: string;
  challengeId?: string;
  amount: number;
  currency: Currency;
  type: SupportType;
  status: SupportStatus;
  platformFee: number;
  netAmount: number;
  message?: string;
  createdAt: string;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  supportPledgeId?: string;
  type: "deposit" | "support" | "pledge" | "refund" | "payout" | "fee" | string;
  amount: number;
  currency: Currency;
  status: "pending" | "completed" | "failed" | string;
  description: string;
  label?: string;
  method?: string;
  date?: string;
  relatedId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface FeedPost {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole | "team" | "league";
  sport?: SportSlug | SportType;
  authorType?: "Athlete" | "Team" | "League" | "Sponsor" | "Fan" | "Admin";
  type: FeedPostType;
  caption: string;
  mediaURL?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  relatedAthleteId?: string;
  relatedTeamId?: string;
  relatedLeagueId?: string;
  relatedMatchId?: string;
  supportAmount?: number;
  likesCount: number;
  likes?: number;
  commentsCount: number;
  comments?: number;
  sharesCount: number;
  shares?: number;
  flagReason?: string;
  statsRow?: string[];
  verified?: boolean;
  status: "active" | "hidden" | "reported";
  timestamp?: string;
  createdAt: string;
}

export interface Sponsor {
  id: string;
  name: string;
  category: string;
  city: string;
  packageType:
    | "athlete_supporter"
    | "team_partner"
    | "league_builder"
    | "annual_awards_sponsor"
    | "women_youth_sport";
  amountCommitted: number;
  currency: Currency;
  supportedAthleteIds: string[];
  supportedTeamIds: string[];
  supportedLeagueIds: string[];
  impactSummary: string;
  active: boolean;
}

export interface AwardCategory {
  id: string;
  name: string;
  description: string;
  sport?: SportSlug;
  categoryType: "fan" | "athlete" | "team" | "league" | "sponsor";
  eligibilityRules: string[];
  currentLeaderIds: string[];
  sponsorId?: string;
}

export type Award = AwardCategory;

export interface Verification {
  id: string;
  type:
    | "athlete_profile"
    | "team_profile"
    | "league_status"
    | "match_result"
    | "challenge_result"
    | "payout_review";
  relatedId: string;
  status: VerificationStatus;
  submittedBy: string;
  reviewedBy?: string;
  relatedLabel?: string;
  evidenceStatus?: string;
  amountAffected?: number;
  actionHistory?: string[];
  notes: string;
  createdAt: string;
  reviewedAt?: string;
}

export type VerificationRecord = Verification;

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorName?: string;
  text: string;
  status: "published" | "hidden" | "flagged";
  createdAt?: string;
  updatedAt?: string;
}

export interface Notification {
  id: string;
  userId: string;
  type?:
    | "support_received"
    | "pledge_created"
    | "challenge_verified"
    | "match_result_verified"
    | "athlete_followed"
    | "sponsor_campaign_update"
    | "awards_ranking_update";
  title: string;
  body: string;
  read: boolean;
  href?: string;
  createdAt?: string;
}

export interface Report {
  id: string;
  reporterId: string;
  type:
    | "reported_feed_post"
    | "disputed_match_result"
    | "athlete_verification_issue"
    | "payout_review_issue"
    | "support_issue"
    | "profile_issue"
    | "result_issue"
    | "content_issue"
    | "verification_issue";
  status: "open" | "reviewing" | "resolved" | "dismissed";
  summary: string;
  reporterName?: string;
  reportedEntity?: string;
  affectedEntity?: string;
  severity?: "Low" | "Medium" | "High" | "Critical";
  assignedReviewer?: string;
  lastUpdate?: string;
  reasonFlagged?: string;
  actionHistory?: string[];
  targetCollection?: string;
  targetId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminLog {
  id: string;
  actorId: string;
  action: string;
  target: string;
  targetId?: string;
  metadata?: Record<string, string | number | boolean>;
  createdAt?: string;
}
