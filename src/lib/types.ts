export type SportType = 'Football' | 'Basketball' | 'Rugby';

export type UserRole = 'Fan' | 'Athlete' | 'Team Admin' | 'League Admin' | 'Sponsor' | 'Scout';

export type LeagueStatus =
  | 'draft'
  | 'community'
  | 'verified'
  | 'partner'
  | 'suspended';

export type AppRole =
  | 'fan'
  | 'athlete'
  | 'team_admin'
  | 'league_admin'
  | 'sponsor'
  | 'platform_admin'
  | 'super_admin';

export type ProfileStatus = 'active' | 'pending' | 'suspended';

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

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  points: number;
  walletBalance: number;
  followedAthletes: string[];
  followedTeams: string[];
  followedLeagues: string[];
}

export interface Athlete {
  id: string;
  userId?: string;
  name: string;
  sport: SportType;
  position: string;
  teamId: string;
  leagueId: string;
  country: string;
  city: string;
  verified: boolean;
  avatarUrl: string;
  coverUrl: string;
  supportersCount: number;
  totalEarnings: number;
  stats: Record<string, string | number>;
  bio: string;
}

export interface Team {
  id: string;
  name: string;
  sport: SportType;
  location: string;
  leagueId: string;
  adminUserIds?: string[];
  logoUrl: string;
  supportPool: number;
  recentResults: string[]; // e.g. ["W", "L", "D"]
  stats: Record<string, string | number>;
}

export interface League {
  id: string;
  name: string;
  sport: SportType;
  country: string;
  city: string;
  status: LeagueStatus;
  plan?: 'free' | 'pro' | 'partner';
  adminUserIds?: string[];
  ranking: number;
  logoUrl: string;
  verified?: boolean;
  verifiedPercentage: number;
  completionRate: number;
  teamsCount?: number;
  athletesCount?: number;
  matchesCount?: number;
  goalPlaceIndex: number;
  indexSignals: GoalPlaceIndexSignals;
  verificationRules?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Match {
  id: string;
  sport: SportType;
  leagueId: string;
  teamAId: string;
  teamBId: string;
  teamAScore?: number;
  teamBScore?: number;
  status: 'Upcoming' | 'Live' | 'Completed';
  date: string;
  venue: string;
  verificationStatus: 'Pending' | 'Verified' | 'Disputed';
  verifiedBy?: string;
  updatedAt?: string;
}

export interface Challenge {
  id: string;
  athleteId: string;
  matchId: string;
  leagueId?: string;
  targetDescription: string;
  totalPledged: number;
  supportersCount: number;
  status: 'Active' | 'Achieved' | 'Failed';
  verificationStatus: 'Pending' | 'Verified' | 'Disputed' | 'Rejected';
  verifiedBy?: string;
  updatedAt?: string;
}

export interface SupportPledge {
  id: string;
  fanId: string;
  athleteId?: string;
  teamId?: string;
  leagueId?: string;
  challengeId?: string;
  amount: number;
  currency?: 'UGX';
  type?: 'direct_support' | 'performance_pledge' | 'team_pool' | 'league_campaign';
  status: 'pending' | 'held' | 'released' | 'refunded' | 'failed' | 'Pledged' | 'Paid' | 'Refunded';
  createdAt: string;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  supportPledgeId?: string;
  type: string;
  label: string;
  amount: number;
  currency?: 'UGX';
  status: string;
  method?: string;
  date?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FeedPost {
  id: string;
  authorId: string;
  authorType: 'Athlete' | 'Team' | 'League' | 'Sponsor' | 'Fan' | 'Admin';
  sport: SportType;
  type:
    | 'VerifiedAchievement'
    | 'AthleteHighlight'
    | 'MatchResult'
    | 'SupportMilestone'
    | 'LeagueUpdate'
    | 'SponsorImpact'
    | 'AnnualAwards';
  caption: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  timestamp: string;
  likes: number;
  comments: number;
  shares: number;
  statsRow?: string[]; // e.g., ["20 points", "120,000 UGX unlocked"]
  verified: boolean;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  text: string;
  status: 'published' | 'hidden' | 'flagged';
  createdAt?: string;
  updatedAt?: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  href?: string;
  createdAt?: string;
}

export interface Sponsor {
  id: string;
  name: string;
  contactUserId?: string;
  adminUserIds?: string[];
  package?: string;
  status: 'lead' | 'active' | 'paused';
  focus: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Award {
  id: string;
  name: string;
  season: string;
  category: string;
  eligibleLeagueIds: string[];
  status: 'draft' | 'open' | 'closed' | 'awarded';
  createdAt?: string;
  updatedAt?: string;
}

export interface VerificationRecord {
  id: string;
  type: 'league' | 'team' | 'athlete' | 'match_result' | 'challenge' | 'payout';
  leagueId?: string;
  teamId?: string;
  athleteId?: string;
  matchId?: string;
  challengeId?: string;
  supportPledgeId?: string;
  status: 'Pending' | 'Verified' | 'Disputed' | 'Rejected';
  submittedBy?: string;
  verifiedBy?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Report {
  id: string;
  reporterId: string;
  type: 'support_issue' | 'profile_issue' | 'result_issue' | 'content_issue' | 'verification_issue';
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  summary: string;
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
