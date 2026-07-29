'use client';

import {
  DocumentData,
  DocumentSnapshot,
  QueryConstraint,
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  documentId,
  getDoc,
  limit as limitQuery,
  onSnapshot,
  orderBy,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { isFirebaseConfigured, requireFirebaseClient } from '@/lib/firebase/client';
import { FirestoreCollectionName, getCollectionDocs } from '@/lib/firebase/firestore';
import { mockProvider } from './mockProvider';
import {
  CreateCommentInput,
  CreateContributionIntentInput,
  CreateFeedPostInput,
  DataWriteResult,
  FollowTargetType,
  GoalPlaceDataProvider,
  ResolveResultSubmissionInput,
  ApproveResultCorrectionInput,
  RecordPointsActionInput,
  ReviewSupportNeedInput,
  SaveTargetType,
  TransitionChallengeInput,
} from './types';
import {
  Comment,
  AdminAuditEvent,
  Athlete,
  FinalizationRecord,
  LeagueAdminApplication,
  LeagueNotice,
  Match,
  Notification,
  Report,
  ResultSubmission,
  ResultSubmissionActor,
  ResultSubmissionEvent,
  ResultSubmissionStatus,
  Roster,
  SponsorReport,
  StoredStanding,
  SupportNeed,
  Team,
  TeamAssignment,
  Verification,
  VerificationStatus,
} from '@/types';
import type { Allocation, ComplianceCase, Contribution } from '@/types/money';
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

async function requestTrustedAccess(
  body: { action: 'accept_team_invitation'; assignmentId: string } |
    { action: 'approve_league_admin'; applicationId: string },
) {
  const { auth } = requireFirebaseClient();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Sign in again before completing this access action.');
  const response = await fetch('/api/access', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await currentUser.getIdToken()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'GoalPlace256 could not update access.');
  await currentUser.getIdToken(true);
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

function requireActor(expectedUserId?: string) {
  const { auth } = requireFirebaseClient();
  const actor = auth.currentUser?.uid;
  if (!actor) throw new Error('Sign in again before completing this action.');
  if (expectedUserId && actor !== expectedUserId) {
    throw new Error('This action must be attributed to the signed-in account.');
  }
  return actor;
}

function auditPayload(input: Omit<AdminAuditEvent, 'id' | 'createdAt'>) {
  return {
    ...input,
    createdAt: serverTimestamp(),
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
  async getTeams(options) {
    if (!isFirebaseConfigured) return mockProvider.getTeams(options);
    if (options?.teamId) {
      const team = await readDoc<Team>('teams', options.teamId);
      return team ? [team] : [];
    }
    const constraints: QueryConstraint[] = [];
    if (options?.leagueId) constraints.push(where('leagueId', '==', options.leagueId));
    constraints.push(limitQuery(options?.limit ?? 100));
    return readCollection('teams', constraints);
  },
  async getTeamById(id) {
    return isFirebaseConfigured ? readDoc('teams', id) : mockProvider.getTeamById(id);
  },
  async getAthletes(options) {
    if (!isFirebaseConfigured) return mockProvider.getAthletes(options);
    if (options?.athleteId) {
      const athlete = await readDoc<Athlete>('athletes', options.athleteId);
      return athlete ? [athlete] : [];
    }
    const constraints: QueryConstraint[] = [];
    if (options?.teamId) constraints.push(where('teamId', '==', options.teamId));
    else if (options?.leagueId) constraints.push(where('leagueId', '==', options.leagueId));
    constraints.push(orderBy(documentId()));
    if (options?.afterId) constraints.push(startAfter(options.afterId));
    constraints.push(limitQuery(options?.limit ?? 100));
    return readCollection('athletes', constraints);
  },
  async getAthleteById(id) {
    return isFirebaseConfigured ? readDoc('athletes', id) : mockProvider.getAthleteById(id);
  },
  async getMatches(options) {
    if (!isFirebaseConfigured) return mockProvider.getMatches(options);
    if (options?.matchId) {
      const match = await readDoc<Match>('matches', options.matchId);
      return match ? [match] : [];
    }
    if (options?.teamId) {
      const constraints = [limitQuery(options.limit ?? 100)];
      const [home, away] = await Promise.all([
        readCollection<Match>('matches', [where('homeTeamId', '==', options.teamId), ...constraints]),
        readCollection<Match>('matches', [where('awayTeamId', '==', options.teamId), ...constraints]),
      ]);
      return [...new Map([...home, ...away].map((match) => [match.id, match])).values()]
        .slice(0, options.limit ?? 100);
    }
    const constraints: QueryConstraint[] = [];
    if (options?.leagueId) constraints.push(where('leagueId', '==', options.leagueId));
    constraints.push(orderBy(documentId()));
    if (options?.afterId) constraints.push(startAfter(options.afterId));
    constraints.push(limitQuery(options?.limit ?? 100));
    return readCollection('matches', constraints);
  },
  async getMatchById(id) {
    return isFirebaseConfigured ? readDoc('matches', id) : mockProvider.getMatchById(id);
  },
  async getChallenges(options) {
    if (!isFirebaseConfigured) return mockProvider.getChallenges(options);
    const constraints: QueryConstraint[] = [];
    if (options?.athleteId) constraints.push(where('athleteId', '==', options.athleteId));
    else if (options?.leagueId) constraints.push(where('leagueId', '==', options.leagueId));
    constraints.push(limitQuery(options?.limit ?? 100));
    return readCollection('challenges', constraints);
  },
  async getChallengeById(id) {
    return isFirebaseConfigured ? readDoc('challenges', id) : mockProvider.getChallengeById(id);
  },
  async getFeedPosts(options) {
    if (!isFirebaseConfigured) return mockProvider.getFeedPosts(options);
    const constraints: QueryConstraint[] = [];
    if (options?.athleteId) constraints.push(where('relatedAthleteId', '==', options.athleteId));
    else if (options?.teamId) constraints.push(where('relatedTeamId', '==', options.teamId));
    else if (options?.leagueId) constraints.push(where('relatedLeagueId', '==', options.leagueId));
    constraints.push(orderBy(documentId()));
    if (options?.afterId) constraints.push(startAfter(options.afterId));
    constraints.push(limitQuery(options?.limit ?? 50));
    return readCollection('feedPosts', constraints);
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
  async getTeamAssignments() {
    return isFirebaseConfigured
      ? readCollection<TeamAssignment>('teamAssignments')
      : mockProvider.getTeamAssignments();
  },
  async getTeamAssignmentById(id) {
    return isFirebaseConfigured
      ? readDoc<TeamAssignment>('teamAssignments', id)
      : mockProvider.getTeamAssignmentById(id);
  },
  async getRosters(options) {
    if (!isFirebaseConfigured) return mockProvider.getRosters(options);
    const constraints: QueryConstraint[] = [];
    if (options?.teamId) constraints.push(where('teamId', '==', options.teamId));
    else if (options?.leagueId) constraints.push(where('leagueId', '==', options.leagueId));
    constraints.push(limitQuery(options?.limit ?? 100));
    return readCollection<Roster>('rosters', constraints);
  },
  async getResultSubmissionEvents(matchId) {
    if (!isFirebaseConfigured) return mockProvider.getResultSubmissionEvents(matchId);
    const response = await fetch(`/api/result-submissions/${encodeURIComponent(matchId)}/events`);
    const body = await response.json().catch(() => ({})) as {
      events?: ResultSubmissionEvent[];
      error?: string;
    };
    if (!response.ok) throw new Error(body.error ?? 'Result provenance is unavailable.');
    return body.events ?? [];
  },
  async getStoredStandings() {
    return isFirebaseConfigured
      ? readCollection<StoredStanding>('standings')
      : mockProvider.getStoredStandings();
  },
  async getSponsorReports() {
    return isFirebaseConfigured
      ? readCollection<SponsorReport>('sponsorReports')
      : mockProvider.getSponsorReports();
  },
  async getLeagueNotices(options) {
    if (!isFirebaseConfigured) return mockProvider.getLeagueNotices(options);
    const constraints: QueryConstraint[] = [];
    if (options?.leagueId) constraints.push(where('leagueId', '==', options.leagueId));
    constraints.push(limitQuery(options?.limit ?? 50));
    return readCollection<LeagueNotice>('leagueNotices', constraints);
  },
  async getFinalizations() {
    return isFirebaseConfigured
      ? readCollection<FinalizationRecord>('finalizations')
      : mockProvider.getFinalizations();
  },
  async getSupportNeeds(options) {
    if (!isFirebaseConfigured) return mockProvider.getSupportNeeds(options);
    const constraints: QueryConstraint[] = [];
    if (options?.athleteId) constraints.push(where('athleteId', '==', options.athleteId));
    else if (options?.teamId) constraints.push(where('teamId', '==', options.teamId));
    else if (options?.leagueId) constraints.push(where('leagueId', '==', options.leagueId));
    constraints.push(limitQuery(options?.limit ?? 100));
    return readCollection<SupportNeed>('supportNeeds', constraints);
  },
  async getLeagueAdminApplications() {
    return isFirebaseConfigured
      ? readCollection<LeagueAdminApplication>('leagueAdminApplications')
      : mockProvider.getLeagueAdminApplications();
  },
  async getAdminAuditEvents() {
    return isFirebaseConfigured
      ? readCollection<AdminAuditEvent>('adminAuditEvents')
      : mockProvider.getAdminAuditEvents();
  },
  async getContributionsByUser(userId) {
    if (!isFirebaseConfigured) return mockProvider.getContributionsByUser(userId);
    requireActor(userId);
    return readCollection<Contribution>('contributions', [
      where('supporterUserId', '==', userId),
      orderBy('createdAt', 'desc'),
      limitQuery(100),
    ]);
  },
  async getAllocations() {
    if (!isFirebaseConfigured) return mockProvider.getAllocations();
    return readCollection<Allocation>('allocations', [limitQuery(100)]);
  },
  async getComplianceCases() {
    if (!isFirebaseConfigured) return mockProvider.getComplianceCases();
    return readCollection<ComplianceCase>('complianceCases', [limitQuery(100)]);
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
    return readCollection('challenges', [where('status', 'in', [
      'funding_open',
      'funding_locked',
      'in_progress',
      'evidence_submitted',
      'under_review',
    ])]);
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
      ['disputed', 'confirmation_overdue'].includes(submission.status) ||
      (
        submission.status === 'official' &&
        Boolean(submission.correctionReason) &&
        !submission.correctionApprovedBy
      )
    );
  },
  async createContributionIntent(data: CreateContributionIntentInput) {
    if (!isFirebaseConfigured) return mockProvider.createContributionIntent(data);
    requireActor(data.supporterUserId);
    const { auth } = requireFirebaseClient();
    const response = await fetch('/api/payments/intents', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await auth.currentUser!.getIdToken()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    const body = await response.json().catch(() => ({})) as { id?: string; error?: string; nextStep?: string };
    if (!response.ok) throw new Error(body.error ?? 'Payment intent could not be created.');
    return writeResult(body.id ?? data.idempotencyKey, body.nextStep ?? 'Payment request created.');
  },
  async recordPointsAction(data: RecordPointsActionInput) {
    if (!isFirebaseConfigured) return mockProvider.recordPointsAction(data);
    requireActor(data.userId);
    const { auth } = requireFirebaseClient();
    const response = await fetch('/api/points/events', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await auth.currentUser!.getIdToken()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    const body = await response.json().catch(() => ({})) as {
      id?: string;
      message?: string;
      error?: string;
    };
    if (!response.ok) throw new Error(body.error ?? 'Points activity could not be recorded.');
    return writeResult(body.id ?? `${data.actionType}:${data.relatedEntityId ?? 'once'}`, body.message);
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
    requireActor(userId);
    const { db } = requireFirebaseClient();
    const ref = doc(db, 'users', userId);
    const field = targetType === 'athlete'
      ? 'followedAthletes'
      : targetType === 'team'
        ? 'followedTeams'
        : 'followedLeagues';
    let following = false;
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = (snapshot.data()?.[field] ?? []) as string[];
      following = !current.includes(targetId);
      transaction.update(ref, {
        [field]: following ? arrayUnion(targetId) : arrayRemove(targetId),
        updatedAt: serverTimestamp(),
      });
    });
    if (following && targetType === 'league') {
      await firebaseProvider.recordPointsAction({
        userId,
        actionType: 'first_league_followed',
        relatedEntityId: targetId,
      }).catch(() => undefined);
    }
    if (following && targetType === 'team') {
      await firebaseProvider.recordPointsAction({
        userId,
        actionType: 'team_followed',
        relatedEntityId: targetId,
      }).catch(() => undefined);
    }
    return writeResult(targetId, following ? 'Follow saved.' : 'Follow removed.');
  },
  async toggleSave(userId: string, targetType: SaveTargetType, targetId: string) {
    if (!isFirebaseConfigured) return mockProvider.toggleSave(userId, targetType, targetId);
    const { db } = requireFirebaseClient();
    const ref = doc(db, 'users', userId, 'saves', `${targetType}_${targetId}`);
    await setDoc(ref, { userId, targetType, targetId, updatedAt: serverTimestamp() }, { merge: true });
    return writeResult(ref.id);
  },
  async updateUserProfile(userId, data) {
    requireActor(userId);
    const { db } = requireFirebaseClient();
    await updateDoc(doc(db, 'users', userId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
    if (data.onboardingCompletedAt) {
      await firebaseProvider.recordPointsAction({
        userId,
        actionType: 'fan_onboarding_completed',
      }).catch(() => undefined);
    }
    return writeResult(userId, 'Profile updated.');
  },
  async updateAthleteProfile(athleteId, data) {
    requireActor();
    const { db } = requireFirebaseClient();
    await updateDoc(doc(db, 'athletes', athleteId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
    return writeResult(athleteId, 'Athlete profile updated.');
  },
  async updateTeamProfile(teamId, data) {
    requireActor();
    const { db } = requireFirebaseClient();
    await updateDoc(doc(db, 'teams', teamId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
    return writeResult(teamId, 'Team profile updated.');
  },
  async saveRoster(roster) {
    requireActor();
    const { db } = requireFirebaseClient();
    await setDoc(doc(db, 'rosters', roster.id), {
      ...roster,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return writeResult(roster.id, 'Roster saved.');
  },
  async createChallenge(data) {
    requireActor(data.submittedBy);
    const { db } = requireFirebaseClient();
    const ref = data.id ? doc(db, 'challenges', data.id) : doc(collection(db, 'challenges'));
    await setDoc(ref, {
      ...data,
      id: ref.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return writeResult(ref.id, 'Challenge proposal created.');
  },
  async transitionChallenge(data: TransitionChallengeInput) {
    if (!isFirebaseConfigured) return mockProvider.transitionChallenge(data);
    requireActor(data.actorUserId);
    const { auth } = requireFirebaseClient();
    const response = await fetch(
      `/api/challenges/${encodeURIComponent(data.challengeId)}/transition`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await auth.currentUser!.getIdToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(data),
      },
    );
    const body = await response.json().catch(() => ({})) as {
      status?: string;
      error?: string;
    };
    if (!response.ok) throw new Error(body.error ?? 'Challenge action could not be recorded.');
    return writeResult(data.challengeId, body.status);
  },
  async createLeagueNotice(data) {
    requireActor(data.publishedByUserId);
    const { db } = requireFirebaseClient();
    const ref = data.id ? doc(db, 'leagueNotices', data.id) : doc(collection(db, 'leagueNotices'));
    await setDoc(ref, {
      ...data,
      id: ref.id,
      createdAt: serverTimestamp(),
    });
    return writeResult(ref.id, 'League notice published.');
  },
  async createSeason(data) {
    requireActor();
    const { db } = requireFirebaseClient();
    const ref = data.id ? doc(db, 'seasons', data.id) : doc(collection(db, 'seasons'));
    await setDoc(ref, {
      ...data,
      id: ref.id,
      createdAt: serverTimestamp(),
    });
    return writeResult(ref.id, 'Season created.');
  },
  async createTeams(teams) {
    requireActor();
    if (!teams.length) throw new Error('Add at least one team.');
    const { db } = requireFirebaseClient();
    const batch = writeBatch(db);
    for (const team of teams) batch.set(doc(db, 'teams', team.id), team);
    await batch.commit();
    return writeResult(teams[0].id, `${teams.length} teams imported.`);
  },
  async createFixtures(fixtures) {
    requireActor();
    if (!fixtures.length) throw new Error('Add at least one fixture.');
    const { db } = requireFirebaseClient();
    const batch = writeBatch(db);
    for (const fixture of fixtures) {
      batch.set(doc(db, 'matches', fixture.id), fixture);
    }
    await batch.commit();
    return writeResult(fixtures[0].id, `${fixtures.length} fixtures created.`);
  },
  async createTeamAdminInvitation(data) {
    const actor = requireActor(data.invitedByUserId);
    const { db } = requireFirebaseClient();
    const batch = writeBatch(db);
    batch.set(doc(db, 'teamAssignments', data.id), data);
    const auditRef = doc(collection(db, 'adminAuditEvents'));
    batch.set(auditRef, auditPayload({
      actorUserId: actor,
      action: 'invited',
      targetCollection: 'teamAssignments',
      targetId: data.id,
    }));
    await batch.commit();
    return writeResult(data.id, 'Team Admin invitation created.');
  },
  async acceptTeamAdminInvitation(assignmentId, userId) {
    requireActor(userId);
    await requestTrustedAccess({ action: 'accept_team_invitation', assignmentId });
    return writeResult(assignmentId, 'Team Admin invitation accepted.');
  },
  async markNotificationRead(notificationId, read = true) {
    requireActor();
    const { db } = requireFirebaseClient();
    await updateDoc(doc(db, 'notifications', notificationId), { read });
    return writeResult(notificationId);
  },
  async createSupportNeed(data) {
    const actor = requireActor(data.createdByUserId);
    const { db } = requireFirebaseClient();
    const ref = data.id ? doc(db, 'supportNeeds', data.id) : doc(collection(db, 'supportNeeds'));
    await setDoc(ref, {
      ...data,
      id: ref.id,
      createdByUserId: actor,
      raisedAmount: 0,
      recipientUpdates: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return writeResult(ref.id, 'Support need published.');
  },
  async addSupportNeedUpdate(needId, input) {
    requireActor();
    const { db } = requireFirebaseClient();
    await updateDoc(doc(db, 'supportNeeds', needId), {
      recipientUpdates: arrayUnion({
        id: crypto.randomUUID(),
        ...input,
        createdAt: new Date().toISOString(),
      }),
      updatedAt: serverTimestamp(),
    });
    return writeResult(needId, 'Support update published.');
  },
  async reviewSupportNeed(data: ReviewSupportNeedInput) {
    if (!isFirebaseConfigured) return mockProvider.reviewSupportNeed(data);
    requireActor(data.actorUserId);
    const { auth } = requireFirebaseClient();
    const response = await fetch(
      `/api/support-needs/${encodeURIComponent(data.supportNeedId)}/review`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await auth.currentUser!.getIdToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(data),
      },
    );
    const body = await response.json().catch(() => ({})) as {
      status?: string;
      error?: string;
    };
    if (!response.ok) throw new Error(body.error ?? 'Support need review failed.');
    return writeResult(data.supportNeedId, body.status);
  },
  async completeSupportNeed(data) {
    if (!isFirebaseConfigured) return mockProvider.completeSupportNeed(data);
    requireActor(data.actorUserId);
    const { auth } = requireFirebaseClient();
    const response = await fetch(
      `/api/support-needs/${encodeURIComponent(data.supportNeedId)}/completion`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await auth.currentUser!.getIdToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(data),
      },
    );
    const body = await response.json().catch(() => ({})) as {
      status?: string;
      error?: string;
    };
    if (!response.ok) throw new Error(body.error ?? 'Support need completion failed.');
    return writeResult(data.supportNeedId, body.status);
  },
  async createLeagueAdminApplication(data) {
    const actor = requireActor(data.userId);
    const { db } = requireFirebaseClient();
    const ref = data.id
      ? doc(db, 'leagueAdminApplications', data.id)
      : doc(collection(db, 'leagueAdminApplications'));
    await setDoc(ref, {
      ...data,
      id: ref.id,
      userId: actor,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return writeResult(ref.id, 'League Admin application submitted.');
  },
  async reviewApproval(input) {
    const actor = requireActor(input.actorUserId);
    if (
      input.targetCollection === 'leagueAdminApplications' &&
      input.decision === 'approved'
    ) {
      await requestTrustedAccess({
        action: 'approve_league_admin',
        applicationId: input.targetId,
      });
      return writeResult(input.targetId, 'League Admin access granted.');
    }
    const { db } = requireFirebaseClient();
    const batch = writeBatch(db);
    const targetRef = doc(db, input.targetCollection, input.targetId);
    if (input.targetCollection === 'athletes') {
      batch.update(targetRef, {
        verified: input.decision === 'approved',
        verificationStatus: input.decision === 'approved' ? 'verified' : 'pending',
        updatedAt: serverTimestamp(),
      });
    } else if (input.targetCollection === 'leagues') {
      batch.update(targetRef, {
        verified: input.decision === 'approved',
        status: input.decision === 'approved' ? 'verified' : 'draft',
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(targetRef, {
        status: input.decision === 'requested_information'
          ? 'needs_information'
          : input.decision,
        reviewedByUserId: actor,
        updatedAt: serverTimestamp(),
      });
    }
    const auditRef = doc(collection(db, 'adminAuditEvents'));
    batch.set(auditRef, auditPayload({
      actorUserId: actor,
      action: input.decision,
      targetCollection: input.targetCollection,
      targetId: input.targetId,
      note: input.note,
    }));
    await batch.commit();
    return writeResult(input.targetId, 'Approval decision recorded.');
  },
  async resolveReport(input) {
    const actor = requireActor(input.actorUserId);
    const { db } = requireFirebaseClient();
    const batch = writeBatch(db);
    batch.update(doc(db, 'reports', input.reportId), {
      status: input.decision,
      updatedAt: serverTimestamp(),
      ...(input.note ? { actionHistory: arrayUnion(input.note) } : {}),
    });
    const auditRef = doc(collection(db, 'adminAuditEvents'));
    batch.set(auditRef, auditPayload({
      actorUserId: actor,
      action: input.decision,
      targetCollection: 'reports',
      targetId: input.reportId,
      note: input.note,
    }));
    await batch.commit();
    return writeResult(input.reportId, 'Trust decision recorded.');
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
  async approveResultCorrection(data: ApproveResultCorrectionInput) {
    if (!isFirebaseConfigured) return mockProvider.approveResultCorrection(data);
    requireActor(data.actorUserId);
    const { auth } = requireFirebaseClient();
    const response = await fetch(
      `/api/result-submissions/${encodeURIComponent(data.matchId)}/correction`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await auth.currentUser!.getIdToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(data),
      },
    );
    const body = await response.json().catch(() => ({})) as { error?: string; version?: number };
    if (!response.ok) throw new Error(body.error ?? 'Correction approval failed.');
    return writeResult(data.matchId, `Official result updated to version ${body.version}.`);
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
