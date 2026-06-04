export type SportType = 'Football' | 'Basketball' | 'Rugby';

export type UserRole = 'Fan' | 'Athlete' | 'Team Admin' | 'League Admin' | 'Sponsor' | 'Scout';

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
  ranking: number;
  logoUrl: string;
  verifiedPercentage: number;
  completionRate: number;
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
}

export interface Challenge {
  id: string;
  athleteId: string;
  matchId: string;
  targetDescription: string;
  totalPledged: number;
  supportersCount: number;
  status: 'Active' | 'Achieved' | 'Failed';
  verificationStatus: 'Pending' | 'Verified';
}

export interface SupportPledge {
  id: string;
  fanId: string;
  athleteId: string;
  challengeId?: string;
  amount: number;
  status: 'Pledged' | 'Paid' | 'Refunded';
  createdAt: string;
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
