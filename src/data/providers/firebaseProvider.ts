'use client';

import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { isFirebaseConfigured, requireFirebaseClient } from '@/lib/firebase/client';
import { FirestoreCollectionName, getCollectionDocs } from '@/lib/firebase/firestore';
import { mockProvider } from './mockProvider';
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
import { VerificationStatus } from '@/types';

function missingFirebase<T>(fallback: T): T {
  if (typeof window !== 'undefined') {
    console.warn('NEXT_PUBLIC_DATA_MODE=firebase was requested, but Firebase client env vars are missing. Falling back safely.');
  }
  return fallback;
}

async function readCollection<T>(name: FirestoreCollectionName) {
  if (!isFirebaseConfigured) return missingFirebase([] as T[]);
  return getCollectionDocs<T>(name);
}

async function readDoc<T>(collectionName: string, id: string) {
  if (!isFirebaseConfigured) return missingFirebase(undefined as T | undefined);
  const { db } = requireFirebaseClient();
  const snapshot = await getDoc(doc(db, collectionName, id));
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as T) : undefined;
}

async function writeResult(id: string, message?: string): Promise<DataWriteResult> {
  return { ok: true, id, mode: 'firebase', message };
}

export const firebaseProvider: GoalPlaceDataProvider = {
  mode: 'firebase',
  async getSports() {
    return isFirebaseConfigured ? readCollection('sports') : mockProvider.getSports();
  },
  async getUsers() {
    return isFirebaseConfigured ? readCollection('users') : mockProvider.getUsers();
  },
  async getUserById(id) {
    return isFirebaseConfigured ? readDoc('users', id) : mockProvider.getUserById(id);
  },
  async getSponsors() {
    return isFirebaseConfigured ? readCollection('sponsors') : mockProvider.getSponsors();
  },
  async getAwardCategories() {
    return isFirebaseConfigured ? readCollection('awards') : mockProvider.getAwardCategories();
  },
  async getLeagues() {
    return isFirebaseConfigured ? readCollection('leagues') : mockProvider.getLeagues();
  },
  async getLeagueById(id) {
    return isFirebaseConfigured ? readDoc('leagues', id) : mockProvider.getLeagueById(id);
  },
  async getTeams() {
    return isFirebaseConfigured ? readCollection('teams') : mockProvider.getTeams();
  },
  async getTeamById(id) {
    return isFirebaseConfigured ? readDoc('teams', id) : mockProvider.getTeamById(id);
  },
  async getAthletes() {
    return isFirebaseConfigured ? readCollection('athletes') : mockProvider.getAthletes();
  },
  async getAthleteById(id) {
    return isFirebaseConfigured ? readDoc('athletes', id) : mockProvider.getAthleteById(id);
  },
  async getMatches() {
    return isFirebaseConfigured ? readCollection('matches') : mockProvider.getMatches();
  },
  async getMatchById(id) {
    return isFirebaseConfigured ? readDoc('matches', id) : mockProvider.getMatchById(id);
  },
  async getChallenges() {
    return isFirebaseConfigured ? readCollection('challenges') : mockProvider.getChallenges();
  },
  async getChallengeById(id) {
    return isFirebaseConfigured ? readDoc('challenges', id) : mockProvider.getChallengeById(id);
  },
  async getFeedPosts() {
    return isFirebaseConfigured ? readCollection('feedPosts') : mockProvider.getFeedPosts();
  },
  async getFeedPostById(id) {
    return isFirebaseConfigured ? readDoc('feedPosts', id) : mockProvider.getFeedPostById(id);
  },
  async getCommentsByPost(postId) {
    if (!isFirebaseConfigured) return mockProvider.getCommentsByPost(postId);
    const comments = await readCollection<Awaited<ReturnType<typeof mockProvider.getCommentsByPost>>[number]>('comments');
    return comments.filter((comment) => comment.postId === postId);
  },
  async getWalletTransactionsByUser(userId) {
    if (!isFirebaseConfigured) return mockProvider.getWalletTransactionsByUser(userId);
    const transactions = await readCollection<Awaited<ReturnType<typeof mockProvider.getWalletTransactionsByUser>>[number]>('walletTransactions');
    return transactions.filter((transaction) => transaction.userId === userId);
  },
  async getNotificationsByUser(userId) {
    if (!isFirebaseConfigured) return mockProvider.getNotificationsByUser(userId);
    const notifications = await readCollection<Awaited<ReturnType<typeof mockProvider.getNotificationsByUser>>[number]>('notifications');
    return notifications.filter((notification) => notification.userId === userId);
  },
  async getStandingsByLeague(leagueId) {
    return mockProvider.getStandingsByLeague(leagueId);
  },
  async getTopSupportedAthletes(limit = 10) {
    const athletes = await this.getAthletes();
    return [...athletes].sort((a, b) => b.totalSupport - a.totalSupport).slice(0, limit);
  },
  async getActiveChallenges() {
    const challenges = await this.getChallenges();
    return challenges.filter((challenge) => challenge.status === 'open');
  },
  async getVerifiedMatches() {
    const matches = await this.getMatches();
    return matches.filter((match) => match.verificationStatus === 'verified');
  },
  async createSupportPledge(data: CreateSupportPledgeInput) {
    if (!isFirebaseConfigured) return mockProvider.createSupportPledge(data);
    const { db } = requireFirebaseClient();
    const amount = data.amount;
    const platformFee = data.platformFee ?? Math.round(amount * 0.03);
    const payload = {
      ...data,
      platformFee,
      netAmount: data.netAmount ?? amount - platformFee,
      status: data.status ?? 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const ref = data.id ? doc(db, 'supportPledges', data.id) : doc(collection(db, 'supportPledges'));
    await setDoc(ref, payload, { merge: true });
    return writeResult(ref.id, 'Demo support recorded. Real payments are not enabled yet.');
  },
  async createWalletTransaction(data: CreateWalletTransactionInput) {
    if (!isFirebaseConfigured) return mockProvider.createWalletTransaction(data);
    const { db } = requireFirebaseClient();
    const ref = data.id ? doc(db, 'walletTransactions', data.id) : doc(collection(db, 'walletTransactions'));
    await setDoc(ref, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    return writeResult(ref.id);
  },
  async createFeedPost(data: CreateFeedPostInput) {
    if (!isFirebaseConfigured) return mockProvider.createFeedPost(data);
    const { db } = requireFirebaseClient();
    const ref = data.id ? doc(db, 'feedPosts', data.id) : doc(collection(db, 'feedPosts'));
    await setDoc(ref, {
      ...data,
      likesCount: data.likesCount ?? 0,
      commentsCount: data.commentsCount ?? 0,
      sharesCount: data.sharesCount ?? 0,
      status: data.status ?? 'active',
      timestamp: data.createdAt ?? new Date().toISOString(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return writeResult(ref.id);
  },
  async createComment(data: CreateCommentInput) {
    if (!isFirebaseConfigured) return mockProvider.createComment(data);
    const { db } = requireFirebaseClient();
    const ref = await addDoc(collection(db, 'comments'), {
      ...data,
      status: data.status ?? 'published',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return writeResult(ref.id);
  },
  async toggleFollow(userId: string, targetType: FollowTargetType, targetId: string) {
    if (!isFirebaseConfigured) return mockProvider.toggleFollow(userId, targetType, targetId);
    const { db } = requireFirebaseClient();
    const ref = doc(db, 'users', userId, 'follows', `${targetType}_${targetId}`);
    await setDoc(ref, { userId, targetType, targetId, updatedAt: serverTimestamp() }, { merge: true });
    return writeResult(ref.id);
  },
  async toggleSave(userId: string, targetType: SaveTargetType, targetId: string) {
    if (!isFirebaseConfigured) return mockProvider.toggleSave(userId, targetType, targetId);
    const { db } = requireFirebaseClient();
    const ref = doc(db, 'users', userId, 'saves', `${targetType}_${targetId}`);
    await setDoc(ref, { userId, targetType, targetId, updatedAt: serverTimestamp() }, { merge: true });
    return writeResult(ref.id);
  },
  async updateMatchVerification(matchId: string, status: VerificationStatus) {
    if (!isFirebaseConfigured) return mockProvider.updateMatchVerification(matchId, status);
    const { db } = requireFirebaseClient();
    await updateDoc(doc(db, 'matches', matchId), { verificationStatus: status, updatedAt: serverTimestamp() });
    return writeResult(matchId);
  },
  async updateChallengeVerification(challengeId: string, status: VerificationStatus) {
    if (!isFirebaseConfigured) return mockProvider.updateChallengeVerification(challengeId, status);
    const { db } = requireFirebaseClient();
    await updateDoc(doc(db, 'challenges', challengeId), { verificationStatus: status, updatedAt: serverTimestamp() });
    return writeResult(challengeId);
  },
};
