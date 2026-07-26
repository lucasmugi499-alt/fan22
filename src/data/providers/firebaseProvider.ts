'use client';

import {
  DocumentData,
  DocumentSnapshot,
  QueryConstraint,
  addDoc,
  collection,
  doc,
  getDoc,
  limit as limitQuery,
  onSnapshot,
  orderBy,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
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
  ResolveResultSubmissionInput,
  SaveTargetType,
} from './types';
import {
  Comment,
  Match,
  Notification,
  Report,
  ResultSubmission,
  ResultSubmissionActor,
  ResultSubmissionEvent,
  ResultSubmissionStatus,
  Team,
  Verification,
  VerificationStatus,
  WalletTransaction,
} from '@/types';
import { buildLeagueStandings } from '@/lib/leagueModel';
import {
  canAcceptNewSubmission,
  checkTransition,
  confirmationDeadlineFrom,
} from '@/lib/resultSubmission';

function missingFirebase<T>(fallback: T): T {
  if (typeof window !== 'undefined') {
    console.warn('NEXT_PUBLIC_DATA_MODE=firebase was requested, but Firebase client env vars are missing. Falling back safely.');
  }
  return fallback;
}

async function readCollection<T>(name: FirestoreCollectionName, constraints: QueryConstraint[] = []) {
  if (!isFirebaseConfigured) return missingFirebase([] as T[]);
  return getCollectionDocs<T>(name, constraints);
}

async function readDoc<T>(collectionName: string, id: string) {
  if (!isFirebaseConfigured) return missingFirebase(undefined as T | undefined);
  const { db } = requireFirebaseClient();
  const snapshot = await getDoc(doc(db, collectionName, id));
  if (snapshot.exists()) return { id: snapshot.id, ...snapshot.data() } as T;
  return undefined;
}

async function writeResult(id: string, message?: string): Promise<DataWriteResult> {
  return { ok: true, id, mode: 'firebase', message };
}

async function requestTrustedFinalization(matchId: string) {
  const { auth } = requireFirebaseClient();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Sign in again before finalizing this result.');

  const response = await fetch(
    `/api/result-submissions/${encodeURIComponent(matchId)}/finalize`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await currentUser.getIdToken()}`,
      },
    }
  );
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error ?? 'GoalPlace256 could not finalize this result.');
  }
}

function buildStandings(leagueId: string, teams: Team[], matches: Match[]) {
  return buildLeagueStandings(
    teams.filter((team) => team.leagueId === leagueId),
    matches.filter((match) => match.leagueId === leagueId)
  );
}

function submissionFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>
): ResultSubmission | undefined {
  if (!snapshot.exists()) return undefined;
  return { id: snapshot.id, ...snapshot.data() } as ResultSubmission;
}

function eventPayload(input: {
  matchId: string;
  from: ResultSubmissionStatus | null;
  to: ResultSubmissionStatus;
  actor: ResultSubmissionActor;
  actorUserId: string;
  note?: string;
  createdAt: string;
}): Omit<ResultSubmissionEvent, 'id'> {
  return {
    submissionId: input.matchId,
    from: input.from,
    to: input.to,
    actor: input.actor,
    actorUserId: input.actorUserId,
    createdAt: input.createdAt,
    ...(input.note ? { note: input.note } : {}),
  };
}

function assertTransition(
  submission: ResultSubmission,
  to: ResultSubmissionStatus,
  actor: ResultSubmissionActor,
  input: {
    resolution?: ResultSubmission['resolution'];
    correctedScore?: { home: number; away: number };
  } = {}
) {
  const decision = checkTransition({ submission, to, actor, ...input });
  if (!decision.ok) throw new Error(decision.message);
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
  async getSeasons() {
    return isFirebaseConfigured ? readCollection('seasons') : mockProvider.getSeasons();
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
  async getLatestFeedPosts(limit = 50) {
    if (!isFirebaseConfigured) return mockProvider.getLatestFeedPosts(limit);
    return readCollection('feedPosts', [orderBy('createdAt', 'desc'), limitQuery(limit)]);
  },
  async getFeedPostById(id) {
    return isFirebaseConfigured ? readDoc('feedPosts', id) : mockProvider.getFeedPostById(id);
  },
  async getCommentsByPost(postId) {
    if (!isFirebaseConfigured) return mockProvider.getCommentsByPost(postId);
    return readCollection<Comment>('comments', [where('postId', '==', postId)]);
  },
  async getWalletTransactionsByUser(userId) {
    if (!isFirebaseConfigured) return mockProvider.getWalletTransactionsByUser(userId);
    return readCollection<WalletTransaction>(
      'walletTransactions',
      [where('userId', '==', userId)]
    );
  },
  async getNotificationsByUser(userId) {
    if (!isFirebaseConfigured) return mockProvider.getNotificationsByUser(userId);
    return readCollection<Notification>('notifications', [where('userId', '==', userId)]);
  },
  async getReports() {
    return isFirebaseConfigured ? readCollection<Report>('reports') : mockProvider.getReports();
  },
  async getVerifications() {
    return isFirebaseConfigured ? readCollection<Verification>('verifications') : mockProvider.getVerifications();
  },
  async getStandingsByLeague(leagueId) {
    if (!isFirebaseConfigured) return mockProvider.getStandingsByLeague(leagueId);
    const [teams, matches] = await Promise.all([
      readCollection<Team>('teams', [where('leagueId', '==', leagueId)]),
      readCollection<Match>('matches', [where('leagueId', '==', leagueId)]),
    ]);
    return buildStandings(leagueId, teams, matches);
  },
  async getTopSupportedAthletes(limit = 10) {
    if (!isFirebaseConfigured) return mockProvider.getTopSupportedAthletes(limit);
    return readCollection('athletes', [orderBy('totalSupport', 'desc'), limitQuery(limit)]);
  },
  async getTopPointsAthletes(limit = 20) {
    if (!isFirebaseConfigured) return mockProvider.getTopPointsAthletes(limit);
    return readCollection('athletes', [orderBy('goalPlacePoints', 'desc'), limitQuery(limit)]);
  },
  async getActiveChallenges() {
    if (!isFirebaseConfigured) return mockProvider.getActiveChallenges();
    return readCollection('challenges', [where('status', 'in', ['open', 'active'])]);
  },
  async getVerifiedMatches() {
    if (!isFirebaseConfigured) return mockProvider.getVerifiedMatches();
    return readCollection('matches', [where('verificationStatus', '==', 'verified')]);
  },
  async getResultSubmission(matchId) {
    if (!isFirebaseConfigured) return mockProvider.getResultSubmission(matchId);
    const { db } = requireFirebaseClient();
    return submissionFromSnapshot(await getDoc(doc(db, 'resultSubmissions', matchId)));
  },
  async getTeamConfirmationInbox(teamId) {
    if (!isFirebaseConfigured) return mockProvider.getTeamConfirmationInbox(teamId);
    const submissions = await readCollection<ResultSubmission>('resultSubmissions', [
      where('opponentTeamId', '==', teamId),
    ]);
    return submissions.filter((submission) =>
      ['pending_confirmation', 'confirmation_overdue'].includes(submission.status)
    );
  },
  async getLeagueResultExceptions(leagueId) {
    if (!isFirebaseConfigured) return mockProvider.getLeagueResultExceptions(leagueId);
    const submissions = await readCollection<ResultSubmission>('resultSubmissions', [
      where('leagueId', '==', leagueId),
    ]);
    return submissions.filter((submission) =>
      ['disputed', 'confirmation_overdue'].includes(submission.status)
    );
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
  async createResultSubmission(data) {
    if (!isFirebaseConfigured) return mockProvider.createResultSubmission(data);
    if (
      data.submittedByTeamId !== data.match.homeTeamId &&
      data.submittedByTeamId !== data.match.awayTeamId
    ) {
      throw new Error('The submitting team is not part of this fixture.');
    }

    const { db } = requireFirebaseClient();
    const submissionRef = doc(db, 'resultSubmissions', data.match.id);
    await runTransaction(db, async (transaction) => {
      const existing = submissionFromSnapshot(await transaction.get(submissionRef));
      if (!canAcceptNewSubmission(existing)) {
        throw new Error('This match already has an active result submission.');
      }

      const now = new Date().toISOString();
      const opponentTeamId =
        data.match.homeTeamId === data.submittedByTeamId
          ? data.match.awayTeamId
          : data.match.homeTeamId;
      const submission: Omit<ResultSubmission, 'id'> = {
        matchId: data.match.id,
        leagueId: data.match.leagueId,
        seasonId: data.match.seasonId,
        submittedByTeamId: data.submittedByTeamId,
        opponentTeamId,
        submittedByUserId: data.submittedByUserId,
        homeScore: data.homeScore,
        awayScore: data.awayScore,
        scorers: data.scorers ?? [],
        evidenceRefs: data.evidenceRefs ?? [],
        ...(data.evidenceNote ? { evidenceNote: data.evidenceNote } : {}),
        status: 'pending_confirmation',
        revision: (existing?.revision ?? 0) + 1,
        submittedAsFinal: true,
        confirmationDeadline: confirmationDeadlineFrom(now),
        resultVersion: existing?.resultVersion ?? 1,
        submittedAt: now,
      };

      transaction.set(submissionRef, submission);
      transaction.set(
        doc(collection(submissionRef, 'events')),
        eventPayload({
          matchId: data.match.id,
          from: existing?.status ?? null,
          to: 'pending_confirmation',
          actor: 'submitting_team',
          actorUserId: data.submittedByUserId,
          createdAt: now,
        })
      );
    });
    return writeResult(data.match.id, 'Result submitted for opponent confirmation.');
  },
  async confirmResultSubmission(matchId, respondedByUserId) {
    if (!isFirebaseConfigured) {
      return mockProvider.confirmResultSubmission(matchId, respondedByUserId);
    }

    const { db } = requireFirebaseClient();
    const submissionRef = doc(db, 'resultSubmissions', matchId);
    await runTransaction(db, async (transaction) => {
      const submission = submissionFromSnapshot(await transaction.get(submissionRef));
      if (!submission) throw new Error('Result submission not found.');
      assertTransition(submission, 'confirmed', 'opponent_team');

      const now = new Date().toISOString();
      transaction.update(submissionRef, {
        status: 'confirmed',
        resolution: 'opponent_confirmed',
        respondedByUserId,
        respondedAt: now,
      });
      transaction.set(
        doc(collection(submissionRef, 'events')),
        eventPayload({
          matchId,
          from: submission.status,
          to: 'confirmed',
          actor: 'opponent_team',
          actorUserId: respondedByUserId,
          createdAt: now,
        })
      );
    });
    await requestTrustedFinalization(matchId);
    return writeResult(matchId, 'Result confirmed. Finalization is in progress.');
  },
  async disputeResultSubmission(matchId, respondedByUserId, reason) {
    if (!isFirebaseConfigured) {
      return mockProvider.disputeResultSubmission(matchId, respondedByUserId, reason);
    }
    if (!reason.trim()) throw new Error('Add a reason for the dispute.');

    const { db } = requireFirebaseClient();
    const submissionRef = doc(db, 'resultSubmissions', matchId);
    await runTransaction(db, async (transaction) => {
      const submission = submissionFromSnapshot(await transaction.get(submissionRef));
      if (!submission) throw new Error('Result submission not found.');
      assertTransition(submission, 'disputed', 'opponent_team');

      const now = new Date().toISOString();
      transaction.update(submissionRef, {
        status: 'disputed',
        respondedByUserId,
        respondedAt: now,
        disputeReason: reason.trim(),
      });
      transaction.set(
        doc(collection(submissionRef, 'events')),
        eventPayload({
          matchId,
          from: submission.status,
          to: 'disputed',
          actor: 'opponent_team',
          actorUserId: respondedByUserId,
          note: reason.trim(),
          createdAt: now,
        })
      );
    });
    return writeResult(matchId, 'Dispute sent to the league for review.');
  },
  async finalizeResultSubmission(matchId) {
    if (!isFirebaseConfigured) return mockProvider.finalizeResultSubmission(matchId);
    await requestTrustedFinalization(matchId);
    return writeResult(matchId, 'Finalization completed.');
  },
  async resolveDisputedSubmission(data: ResolveResultSubmissionInput) {
    if (!isFirebaseConfigured) return mockProvider.resolveDisputedSubmission(data);

    const { db } = requireFirebaseClient();
    const submissionRef = doc(db, 'resultSubmissions', data.matchId);
    await runTransaction(db, async (transaction) => {
      const submission = submissionFromSnapshot(await transaction.get(submissionRef));
      if (!submission) throw new Error('Result submission not found.');
      const to = data.decision === 'reject' ? 'rejected' : 'confirmed';
      const resolution =
        data.decision === 'correct'
          ? 'league_corrected'
          : submission.status === 'confirmation_overdue'
            ? 'league_confirmed_unresponsive'
            : 'league_upheld';
      assertTransition(submission, to, 'league_admin', {
        resolution,
        correctedScore: data.correctedScore,
      });

      const now = new Date().toISOString();
      transaction.update(submissionRef, {
        status: to,
        resolvedByUserId: data.resolvedByUserId,
        resolvedAt: now,
        ...(to === 'confirmed' ? { resolution } : {}),
        ...(data.correctedScore
          ? {
              correctedHomeScore: data.correctedScore.home,
              correctedAwayScore: data.correctedScore.away,
            }
          : {}),
        ...(data.note?.trim() ? { finalDecisionNote: data.note.trim() } : {}),
      });
      transaction.set(
        doc(collection(submissionRef, 'events')),
        eventPayload({
          matchId: data.matchId,
          from: submission.status,
          to,
          actor: 'league_admin',
          actorUserId: data.resolvedByUserId,
          note: data.note?.trim(),
          createdAt: now,
        })
      );
    });
    if (data.decision !== 'reject') {
      await requestTrustedFinalization(data.matchId);
    }
    return writeResult(
      data.matchId,
      data.decision === 'reject'
        ? 'Result rejected.'
        : 'League decision recorded. Finalization is in progress.'
    );
  },
  async requestResultCorrection(matchId, requestedByUserId, reason) {
    if (!isFirebaseConfigured) {
      return mockProvider.requestResultCorrection(matchId, requestedByUserId, reason);
    }
    if (!reason.trim()) throw new Error('Add a reason for the correction request.');

    const { auth, db } = requireFirebaseClient();
    if (!auth.currentUser) throw new Error('Sign in again before requesting a correction.');
    await updateDoc(doc(db, 'resultSubmissions', matchId), {
      correctionReason: reason.trim(),
      correctionRequestedBy: auth.currentUser.uid,
    });
    return writeResult(matchId, 'Correction request recorded for review.');
  },
  subscribeToResultSubmission(matchId, listener, onError) {
    if (!isFirebaseConfigured) {
      return mockProvider.subscribeToResultSubmission(matchId, listener, onError);
    }

    const { db } = requireFirebaseClient();
    return onSnapshot(
      doc(db, 'resultSubmissions', matchId),
      (snapshot) => listener(submissionFromSnapshot(snapshot)),
      (error) => onError?.(error)
    );
  },
};
