import {
  Challenge,
  Comment,
  FeedPost,
  Athlete,
  AwardCategory,
  League,
  Match,
  Notification,
  Sport,
  Sponsor,
  SupportPledge,
  Team,
  User,
  VerificationStatus,
  WalletTransaction,
} from '@/types';
import { StandingRow } from '../mockDatabase';

export type DataProviderMode = 'mock' | 'firebase';

export type DataWriteResult = {
  ok: boolean;
  id?: string;
  mode: DataProviderMode;
  message?: string;
};

export type FollowTargetType = 'athlete' | 'team' | 'league';
export type SaveTargetType = 'athlete' | 'team' | 'league' | 'match' | 'feedPost';

export type CreateSupportPledgeInput = Omit<SupportPledge, 'id' | 'createdAt' | 'platformFee' | 'netAmount'> & {
  id?: string;
  createdAt?: string;
  platformFee?: number;
  netAmount?: number;
};

export type CreateWalletTransactionInput = Omit<WalletTransaction, 'id' | 'createdAt'> & {
  id?: string;
  createdAt?: string;
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

export interface GoalPlaceDataProvider {
  mode: DataProviderMode;
  getSports(): Promise<Sport[]>;
  getUsers(): Promise<User[]>;
  getUserById(id: string): Promise<User | undefined>;
  getSponsors(): Promise<Sponsor[]>;
  getAwardCategories(): Promise<AwardCategory[]>;
  getLeagues(): Promise<League[]>;
  getLeagueById(id: string): Promise<League | undefined>;
  getTeams(): Promise<Team[]>;
  getTeamById(id: string): Promise<Team | undefined>;
  getAthletes(): Promise<Athlete[]>;
  getAthleteById(id: string): Promise<Athlete | undefined>;
  getMatches(): Promise<Match[]>;
  getMatchById(id: string): Promise<Match | undefined>;
  getChallenges(): Promise<Challenge[]>;
  getChallengeById(id: string): Promise<Challenge | undefined>;
  getFeedPosts(): Promise<FeedPost[]>;
  getFeedPostById(id: string): Promise<FeedPost | undefined>;
  getCommentsByPost(postId: string): Promise<Comment[]>;
  getWalletTransactionsByUser(userId: string): Promise<WalletTransaction[]>;
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  getStandingsByLeague(leagueId: string): Promise<StandingRow[]>;
  getTopSupportedAthletes(limit?: number): Promise<Athlete[]>;
  getActiveChallenges(): Promise<Challenge[]>;
  getVerifiedMatches(): Promise<Match[]>;
  createSupportPledge(data: CreateSupportPledgeInput): Promise<DataWriteResult>;
  createWalletTransaction(data: CreateWalletTransactionInput): Promise<DataWriteResult>;
  createFeedPost(data: CreateFeedPostInput): Promise<DataWriteResult>;
  createComment(data: CreateCommentInput): Promise<DataWriteResult>;
  toggleFollow(userId: string, targetType: FollowTargetType, targetId: string): Promise<DataWriteResult>;
  toggleSave(userId: string, targetType: SaveTargetType, targetId: string): Promise<DataWriteResult>;
  updateMatchVerification(matchId: string, status: VerificationStatus): Promise<DataWriteResult>;
  updateChallengeVerification(challengeId: string, status: VerificationStatus): Promise<DataWriteResult>;
}
