'use client';

import {
  DocumentData,
  CollectionReference,
  QueryConstraint,
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  AdminLog,
  Athlete,
  AwardCategory,
  Challenge,
  Comment,
  FeedPost,
  League,
  Match,
  Notification,
  Report,
  Sport,
  Sponsor,
  SupportPledge,
  Team,
  User,
  UserProfile,
  Verification,
  WalletTransaction,
} from '@/types';
import { db, requireFirebaseClient } from './client';

export type FirestoreCollectionMap = {
  users: User | UserProfile;
  sports: Sport;
  athletes: Athlete;
  teams: Team;
  leagues: League;
  matches: Match;
  challenges: Challenge;
  supportPledges: SupportPledge;
  walletTransactions: WalletTransaction;
  feedPosts: FeedPost;
  comments: Comment;
  notifications: Notification;
  sponsors: Sponsor;
  awards: AwardCategory;
  verifications: Verification;
  reports: Report;
  adminLogs: AdminLog;
};

export type FirestoreCollectionName = keyof FirestoreCollectionMap;

export type PublicCollections = {
  sports: Sport;
  athletes: Athlete;
  teams: Team;
  leagues: League;
  matches: Match;
  challenges: Challenge;
  feedPosts: FeedPost;
};

export type SupportPledgeInput = {
  fanId: string;
  athleteId?: string;
  teamId?: string;
  leagueId?: string;
  challengeId?: string;
  amount: number;
  type: 'direct_support' | 'performance_pledge' | 'team_pool' | 'league_campaign';
  status: 'pending' | 'held' | 'released' | 'refunded' | 'failed';
};

export function collectionRef(name: FirestoreCollectionName) {
  const { db } = requireFirebaseClient();
  return collection(db, name);
}

export function typedCollectionRef<Name extends FirestoreCollectionName>(name: Name) {
  const { db } = requireFirebaseClient();
  return collection(db, name) as CollectionReference<FirestoreCollectionMap[Name], DocumentData>;
}

export async function getCollectionDocs<T>(name: FirestoreCollectionName, constraints: QueryConstraint[] = []) {
  if (!db) return [];
  const ref = collection(db, name);
  const snapshot = await getDocs(constraints.length ? query(ref, ...constraints) : ref);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as T);
}

export function subscribeToCollection<T>(
  name: FirestoreCollectionName,
  callback: (items: T[]) => void,
  constraints: QueryConstraint[] = [],
  onError?: (error: Error) => void
) {
  if (!db) {
    callback([]);
    return () => {};
  }

  const ref = collection(db, name);
  return onSnapshot(
    constraints.length ? query(ref, ...constraints) : ref,
    (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as T)),
    (error) => onError?.(error)
  );
}

export function publicCollectionConstraints(name: keyof PublicCollections) {
  if (name === 'feedPosts') return [orderBy('timestamp', 'desc')];
  return [];
}

export async function createSupportPledge(input: SupportPledgeInput) {
  const { db } = requireFirebaseClient();
  const platformFee = Math.round(input.amount * 0.03);
  const netAmount = input.amount - platformFee;

  const pledge = {
    ...input,
    currency: 'UGX',
    platformFee,
    netAmount,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const pledgeRef = await addDoc(collection(db, 'supportPledges'), pledge);
  await addDoc(collection(db, 'walletTransactions'), {
    userId: input.fanId,
    type: input.type === 'performance_pledge' ? 'Performance pledge' : 'Support',
    label: input.athleteId ? `Support pledge for athlete ${input.athleteId}` : 'GoalPlace256 support',
    amount: -input.amount,
    currency: 'UGX',
    status: input.status,
    supportPledgeId: pledgeRef.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return pledgeRef.id;
}

export async function createFeedPost(input: {
  authorId: string;
  authorRole: string;
  sport: string;
  type: string;
  caption: string;
  mediaURL?: string;
  relatedAthleteId?: string;
  relatedTeamId?: string;
  relatedLeagueId?: string;
  relatedMatchId?: string;
}) {
  const { db } = requireFirebaseClient();
  const docRef = await addDoc(collection(db, 'feedPosts'), {
    ...input,
    authorType: input.authorRole === 'sponsor' ? 'Sponsor' : input.authorRole === 'platform_admin' || input.authorRole === 'super_admin' ? 'Admin' : 'Fan',
    mediaUrl: input.mediaURL ?? '',
    likes: 0,
    comments: 0,
    shares: 0,
    likesCount: 0,
    commentsCount: 0,
    status: 'published',
    verified: input.type === 'VerifiedAchievement',
    timestamp: new Date().toISOString(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function updateVerificationStatus({
  collectionName,
  id,
  verificationStatus,
  verifiedBy,
}: {
  collectionName: 'matches' | 'challenges' | 'verifications';
  id: string;
  verificationStatus: 'Pending' | 'Verified' | 'Disputed' | 'Rejected';
  verifiedBy: string;
}) {
  const { db } = requireFirebaseClient();
  await updateDoc(doc(db, collectionName, id), {
    verificationStatus,
    verifiedBy,
    updatedAt: serverTimestamp(),
  } satisfies DocumentData);
}

export function constraintsForOwner(field: string, uid: string) {
  return [where(field, '==', uid)];
}
