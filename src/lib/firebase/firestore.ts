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
  AdminAuditEvent,
  AdminLog,
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
  Report,
  ResultSubmission,
  ResultSubmissionEvent,
  Roster,
  Season,
  Sport,
  Sponsor,
  SponsorCampaign,
  SponsorReport,
  StoredStanding,
  SupportNeed,
  SupportPledge,
  Team,
  TeamAssignment,
  Invitation,
  AccessAssignmentRecord,
  AccessIndexRecord,
  User,
  UserProfile,
  Verification,
  WalletTransaction,
} from '@/types';
import type {
  Contribution,
  Allocation,
  Chargeback,
  ComplianceCase,
  LedgerEntry,
  LedgerTransaction,
  PaymentIntent,
  Payout,
  PointsEvent,
  Refund,
  Settlement,
  RecipientEligibility,
  SupportReservation,
} from '@/types/money';
import { db, requireFirebaseClient } from './client';

export type FirestoreCollectionMap = {
  users: User | UserProfile;
  sports: Sport;
  athletes: Athlete;
  athleteClaims: AthleteClaim;
  teams: Team;
  leagues: League;
  seasons: Season;
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
  resultSubmissions: ResultSubmission;
  adminLogs: AdminLog;
  adminAuditEvents: AdminAuditEvent;
  teamAssignments: TeamAssignment;
  invitations: Invitation;
  accessAssignments: AccessAssignmentRecord;
  accessIndex: AccessIndexRecord;
  rosters: Roster;
  standings: StoredStanding;
  sponsorReports: SponsorReport;
  sponsorCampaigns: SponsorCampaign;
  leagueNotices: LeagueNotice;
  finalizations: FinalizationRecord;
  supportNeeds: SupportNeed;
  leagueAdminApplications: LeagueAdminApplication;
  resultSubmissionEvents: ResultSubmissionEvent;
  paymentIntents: PaymentIntent;
  contributions: Contribution;
  ledgerTransactions: LedgerTransaction;
  ledgerEntries: LedgerEntry;
  pointsEvents: PointsEvent;
  allocations: Allocation;
  payouts: Payout;
  refunds: Refund;
  chargebacks: Chargeback;
  settlements: Settlement;
  complianceCases: ComplianceCase;
  recipientEligibility: RecipientEligibility;
  supportReservations: SupportReservation;
};

export type FirestoreCollectionName = keyof FirestoreCollectionMap;

export type PublicCollections = {
  sports: Sport;
  athletes: Athlete;
  teams: Team;
  leagues: League;
  seasons: Season;
  matches: Match;
  challenges: Challenge;
  feedPosts: FeedPost;
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
    sharesCount: 0,
    status: 'active',
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
