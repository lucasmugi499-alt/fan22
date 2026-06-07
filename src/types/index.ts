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

export type MatchStatus =
  | "scheduled"
  | "live"
  | "completed"
  | "verified"
  | "disputed"
  | "Upcoming"
  | "Live"
  | "Completed";

export type VerificationStatus =
  | "pending"
  | "verified"
  | "rejected"
  | "disputed"
  | "Pending"
  | "Verified"
  | "Rejected"
  | "Disputed";

export type ChallengeStatus =
  | "open"
  | "locked"
  | "achieved"
  | "failed"
  | "paid"
  | "refunded"
  | "disputed"
  | "Active"
  | "Achieved"
  | "Failed";

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
  season: string;
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
