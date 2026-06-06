export type SportSlug = "football" | "basketball" | "rugby";

export type UserRole =
  | "fan"
  | "athlete"
  | "team_admin"
  | "league_admin"
  | "sponsor"
  | "platform_admin"
  | "super_admin";

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
  | "disputed";

export type VerificationStatus =
  | "pending"
  | "verified"
  | "rejected"
  | "disputed";

export type ChallengeStatus =
  | "open"
  | "locked"
  | "achieved"
  | "failed"
  | "paid"
  | "refunded"
  | "disputed";

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
  | "sponsor_impact"
  | "awards_update";

export type Currency = "UGX";

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
  role: UserRole;
  photoURL?: string;
  city: string;
  country: "Uganda";
  points: number;
  walletBalance: number;
  status: "active" | "pending" | "suspended";
  createdAt: string;
}

export interface League {
  id: string;
  name: string;
  sport: SportSlug;
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
  sport: SportSlug;
  leagueId: string;
  city: string;
  country: "Uganda";
  description: string;
  logoURL?: string;
  plan: "free" | "pro";
  verified: boolean;
  adminUserIds: string[];
  totalSupport: number;
  supportersCount: number;
  wins: number;
  draws?: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  leaguePoints: number;
  createdAt: string;
}

export interface Athlete {
  id: string;
  userId?: string;
  name: string;
  sport: SportSlug;
  position: string;
  teamId: string;
  leagueId: string;
  city: string;
  country: "Uganda";
  ageGroup: "U18" | "U21" | "Senior";
  bio: string;
  avatarURL?: string;
  coverURL?: string;
  verified: boolean;
  verificationStatus: VerificationStatus;
  totalSupport: number;
  supportersCount: number;
  goalPlacePoints: number;
  stats: Record<string, number>;
  impactNeeds: string[];
  createdAt: string;
}

export interface Match {
  id: string;
  sport: SportSlug;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  venue: string;
  city: string;
  scheduledAt: string;
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
  sport: SportSlug;
  type: string;
  target: number;
  description: string;
  totalPledged: number;
  supportersCount: number;
  status: ChallengeStatus;
  verificationStatus: VerificationStatus;
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
  type: "deposit" | "support" | "pledge" | "refund" | "payout" | "fee";
  amount: number;
  currency: Currency;
  status: "pending" | "completed" | "failed";
  description: string;
  relatedId?: string;
  createdAt: string;
}

export interface FeedPost {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole | "team" | "league";
  sport?: SportSlug;
  type: FeedPostType;
  caption: string;
  mediaURL?: string;
  relatedAthleteId?: string;
  relatedTeamId?: string;
  relatedLeagueId?: string;
  relatedMatchId?: string;
  supportAmount?: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  status: "active" | "hidden" | "reported";
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
  notes: string;
  createdAt: string;
  reviewedAt?: string;
}
