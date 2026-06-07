'use client';

import {
  athletes,
  challenges,
  feedPosts,
  getActiveChallenges,
  getAthleteById,
  getCommentsByPost,
  getLeagueById,
  getMatchById,
  getNotificationsByUser,
  getStandingsByLeague,
  getTeamById,
  getTopSupportedAthletes,
  getUserById,
  getVerifiedMatches,
  getWalletByUser,
  leagues,
  matches,
  reports,
  sports,
  sponsors,
  teams,
  users,
  awards,
  verifications,
} from '../mockDatabase';
import {
  CreateCommentInput,
  CreateFeedPostInput,
  CreateSupportPledgeInput,
  CreateWalletTransactionInput,
  DataWriteResult,
  FollowTargetType,
  GoalPlaceDataProvider,
  SaveTargetType,
} from './types';
import { feedPosts as feedPostStore } from '../mockFeedPosts';
import { supportPledges } from '../mockSupportPledges';
import { walletTransactions as walletStore } from '../mockWalletTransactions';
import { comments as commentStore } from '../mockComments';
import { VerificationStatus } from '@/types';

const followed = new Set<string>();
const saved = new Set<string>();

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function demoToast(message: string) {
  if (typeof window === 'undefined') return;
  import('sonner').then(({ toast }) => toast.success(message)).catch(() => undefined);
}

function result(idValue: string, message = 'Demo action recorded. No real payment occurred.'): DataWriteResult {
  demoToast(message);
  return { ok: true, id: idValue, mode: 'mock', message };
}

export const mockProvider: GoalPlaceDataProvider = {
  mode: 'mock',
  async getSports() {
    return sports;
  },
  async getUsers() {
    return users;
  },
  async getUserById(idValue) {
    return getUserById(idValue);
  },
  async getSponsors() {
    return sponsors;
  },
  async getAwardCategories() {
    return awards;
  },
  async getLeagues() {
    return leagues;
  },
  async getLeagueById(idValue) {
    return getLeagueById(idValue);
  },
  async getTeams() {
    return teams;
  },
  async getTeamById(idValue) {
    return getTeamById(idValue);
  },
  async getAthletes() {
    return athletes;
  },
  async getAthleteById(idValue) {
    return getAthleteById(idValue);
  },
  async getMatches() {
    return matches;
  },
  async getMatchById(idValue) {
    return getMatchById(idValue);
  },
  async getChallenges() {
    return challenges;
  },
  async getChallengeById(idValue) {
    return challenges.find((challenge) => challenge.id === idValue);
  },
  async getFeedPosts() {
    return feedPosts;
  },
  async getFeedPostById(idValue) {
    return feedPosts.find((post) => post.id === idValue);
  },
  async getCommentsByPost(postId) {
    return getCommentsByPost(postId);
  },
  async getWalletTransactionsByUser(userId) {
    return getWalletByUser(userId);
  },
  async getNotificationsByUser(userId) {
    return getNotificationsByUser(userId);
  },
  async getReports() {
    return reports;
  },
  async getVerifications() {
    return verifications;
  },
  async getStandingsByLeague(leagueId) {
    return getStandingsByLeague(leagueId);
  },
  async getTopSupportedAthletes(limit = 10) {
    return getTopSupportedAthletes(limit);
  },
  async getActiveChallenges() {
    return getActiveChallenges();
  },
  async getVerifiedMatches() {
    return getVerifiedMatches();
  },
  async createSupportPledge(data: CreateSupportPledgeInput) {
    const amount = data.amount;
    const platformFee = data.platformFee ?? Math.round(amount * 0.03);
    const pledge = {
      ...data,
      id: data.id ?? id('supportPledge'),
      currency: data.currency ?? 'UGX',
      platformFee,
      netAmount: data.netAmount ?? amount - platformFee,
      createdAt: data.createdAt ?? new Date().toISOString(),
    };
    supportPledges.unshift(pledge);
    return result(pledge.id, 'Demo support recorded. Real payments are not enabled yet.');
  },
  async createWalletTransaction(data: CreateWalletTransactionInput) {
    const transaction = {
      ...data,
      id: data.id ?? id('walletTransaction'),
      currency: data.currency ?? 'UGX',
      createdAt: data.createdAt ?? new Date().toISOString(),
    };
    walletStore.unshift(transaction);
    return result(transaction.id, 'Demo wallet transaction recorded.');
  },
  async createFeedPost(data: CreateFeedPostInput) {
    const post = {
      ...data,
      id: data.id ?? id('feedPost'),
      likesCount: data.likesCount ?? 0,
      commentsCount: data.commentsCount ?? 0,
      sharesCount: data.sharesCount ?? 0,
      status: data.status ?? 'active',
      createdAt: data.createdAt ?? new Date().toISOString(),
    };
    feedPostStore.unshift(post);
    return result(post.id, 'Demo post created.');
  },
  async createComment(data: CreateCommentInput) {
    const comment = {
      ...data,
      id: data.id ?? id('comment'),
      status: data.status ?? 'published',
      createdAt: data.createdAt ?? new Date().toISOString(),
    };
    commentStore.push(comment);
    return result(comment.id, 'Demo comment added.');
  },
  async toggleFollow(userId: string, targetType: FollowTargetType, targetId: string) {
    const key = `${userId}:${targetType}:${targetId}`;
    if (followed.has(key)) followed.delete(key);
    else followed.add(key);
    return result(key, followed.has(key) ? 'Demo follow saved.' : 'Demo follow removed.');
  },
  async toggleSave(userId: string, targetType: SaveTargetType, targetId: string) {
    const key = `${userId}:${targetType}:${targetId}`;
    if (saved.has(key)) saved.delete(key);
    else saved.add(key);
    return result(key, saved.has(key) ? 'Demo save added.' : 'Demo save removed.');
  },
  async updateMatchVerification(matchId: string, status: VerificationStatus) {
    const match = matches.find((item) => item.id === matchId);
    if (match) match.verificationStatus = status;
    return result(matchId, `Demo match verification marked ${status}.`);
  },
  async updateChallengeVerification(challengeId: string, status: VerificationStatus) {
    const challenge = challenges.find((item) => item.id === challengeId);
    if (challenge) challenge.verificationStatus = status;
    return result(challengeId, `Demo challenge verification marked ${status}.`);
  },
};
