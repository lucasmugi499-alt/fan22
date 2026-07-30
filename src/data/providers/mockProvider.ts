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
  leagues,
  matches,
  reports,
  sports,
  sponsors,
  teams,
  users,
  awards,
  comments,
  finalizations,
  leagueNotices,
  notifications,
  resultSubmissionEvents,
  resultSubmissions as seededResultSubmissions,
  rosters,
  seasons,
  sponsorReports,
  standings,
  teamAssignments,
  verifications,
} from '../mockDatabase';
import {
  CreateCommentInput,
  CreateContributionIntentInput,
  CreateFeedPostInput,
  DataWriteResult,
  FeedEngagementInput,
  FollowTargetType,
  GoalPlaceDataProvider,
  ResolveResultSubmissionInput,
  RecordPointsActionInput,
  ReviewSupportNeedInput,
  SaveTargetType,
  TransitionChallengeInput,
} from './types';
import { investorDemoRuntime } from '../investorDemo';
import {
  AdminAuditEvent,
  Challenge,
  League,
  LeagueAdminApplication,
  ResultSubmission,
  SupportNeed,
} from '@/types';
import {
  canAcceptNewSubmission,
  confirmationDeadlineFrom,
} from '@/lib/resultSubmission';
import {
  buildContributionSettlement,
  cappedPointsAward,
  contributionQuote,
  pointsForAction,
  pointsIdempotencyKey,
} from '@/lib/money';
import type { Contribution, PaymentIntent, PointsEvent } from '@/types/money';
import { challengeNextStatus } from '@/lib/challenge';
import { normalizeChallengeStatus } from '@/lib/status';
import { MOCK_PROFILES } from '@/lib/auth/mockAuth';

const followed = new Set<string>();
const saved = new Set<string>();
const storedApplicationsKey = 'goalplace256.demo.leagueAdminApplications';
const storedLeaguesKey = 'goalplace256.demo.leagues';
const resultSubmissions = new Map<string, ResultSubmission>(
  seededResultSubmissions.map((submission) => [submission.id, submission]),
);
const resultSubmissionListeners = new Map<
  string,
  Set<(submission: ResultSubmission | undefined) => void>
>();

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

function notifySubmission(matchId: string) {
  const submission = resultSubmissions.get(matchId);
  for (const listener of resultSubmissionListeners.get(matchId) ?? []) {
    listener(submission);
  }
}

function replaceById<T extends { id: string }>(items: T[], value: T) {
  const index = items.findIndex((item) => item.id === value.id);
  if (index >= 0) items[index] = value;
  else items.unshift(value);
}

function readStoredItems<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T[] : [];
  } catch {
    return [];
  }
}

function writeStoredItems<T>(key: string, items: T[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(items));
}

function mergedById<T extends { id: string }>(base: T[], extra: T[]) {
  return [...new Map([...base, ...extra].map((item) => [item.id, item])).values()];
}

function persistDemoApplication(application: LeagueAdminApplication) {
  replaceById(investorDemoRuntime.leagueAdminApplications, application);
  const stored = readStoredItems<LeagueAdminApplication>(storedApplicationsKey);
  replaceById(stored, application);
  writeStoredItems(storedApplicationsKey, stored);
}

function persistDemoLeague(league: League) {
  replaceById(leagues, league);
  const stored = readStoredItems<League>(storedLeaguesKey);
  replaceById(stored, league);
  writeStoredItems(storedLeaguesKey, stored);
}

function demoLeagueIdForApplication(applicationId: string) {
  return `league_${applicationId}`;
}

function draftLeagueFromApplication(application: LeagueAdminApplication): League {
  return {
    id: demoLeagueIdForApplication(application.id),
    name: application.leagueName,
    sport: application.sport,
    city: application.city,
    country: 'Uganda',
    description: `${application.leagueName} is preparing its first GoalPlace256 season.`,
    status: 'draft',
    plan: 'free',
    verified: false,
    adminUserIds: [application.userId],
    season: 'Not launched',
    teamsCount: 0,
    athletesCount: 0,
    matchesCount: 0,
    matchCompletionRate: 0,
    verifiedResultsRate: 0,
    goalPlaceIndex: 0,
    totalSupport: 0,
    supportersCount: 0,
    verificationRules: {
      requiresLeagueAdminApproval: true,
      requiresRefereeConfirmation: false,
      allowsPerformancePledges: false,
    },
    createdAt: new Date().toISOString(),
  };
}

function take<T extends { id?: string }>(items: T[], limit?: number, afterId?: string) {
  const start = afterId ? Math.max(0, items.findIndex((item) => item.id === afterId) + 1) : 0;
  return limit ? items.slice(start, start + limit) : items.slice(start);
}

function audit(input: Omit<AdminAuditEvent, 'id' | 'createdAt'>) {
  const event: AdminAuditEvent = {
    ...input,
    id: id('audit'),
    createdAt: new Date().toISOString(),
  };
  investorDemoRuntime.adminAuditEvents.unshift(event);
  return event;
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
    return mergedById(leagues, readStoredItems<League>(storedLeaguesKey));
  },
  async getSeasons() {
    return seasons;
  },
  async getLeagueById(idValue) {
    return readStoredItems<League>(storedLeaguesKey).find((league) => league.id === idValue)
      ?? getLeagueById(idValue);
  },
  async getTeams(options) {
    return take(
      teams.filter((team) =>
        (!options?.teamId || team.id === options.teamId) &&
        (!options?.leagueId || team.leagueId === options.leagueId)
      ),
      options?.limit,
    );
  },
  async getTeamById(idValue) {
    return getTeamById(idValue);
  },
  async getAthletes(options) {
    return take(athletes
      .filter((athlete) =>
        (!options?.athleteId || athlete.id === options.athleteId) &&
        (!options?.teamId || athlete.teamId === options.teamId) &&
        (!options?.leagueId || athlete.leagueId === options.leagueId)
      ), options?.limit, options?.afterId);
  },
  async getAthleteById(idValue) {
    return getAthleteById(idValue);
  },
  async getAthleteClaims(options) {
    return investorDemoRuntime.athleteClaims.filter((claim) =>
      (!options?.userId || claim.requesterUserId === options.userId) &&
      (!options?.teamId || claim.teamId === options.teamId) &&
      (!options?.leagueId || claim.leagueId === options.leagueId)
    );
  },
  async getMatches(options) {
    return take(matches
      .filter((match) =>
        (!options?.matchId || match.id === options.matchId) &&
        (!options?.leagueId || match.leagueId === options.leagueId) &&
        (!options?.teamId ||
          match.homeTeamId === options.teamId ||
          match.awayTeamId === options.teamId)
      ), options?.limit, options?.afterId);
  },
  async getMatchById(idValue) {
    return getMatchById(idValue);
  },
  async getChallenges(options) {
    return take(challenges
      .filter((challenge) =>
        (!options?.athleteId || challenge.athleteId === options.athleteId) &&
        (!options?.leagueId || challenge.leagueId === options.leagueId)
      ), options?.limit, options?.afterId);
  },
  async getChallengeById(idValue) {
    return challenges.find((challenge) => challenge.id === idValue);
  },
  async getFeedPosts(options) {
    return take(feedPosts
      .filter((post) =>
        (!options?.athleteId || post.relatedAthleteId === options.athleteId) &&
        (!options?.teamId || post.relatedTeamId === options.teamId) &&
        (!options?.leagueId || post.relatedLeagueId === options.leagueId)
      ), options?.limit, options?.afterId);
  },
  async getLatestFeedPosts(limit = 50) {
    return [...feedPosts]
      .sort((a, b) => +new Date(b.createdAt || b.timestamp || 0) - +new Date(a.createdAt || a.timestamp || 0))
      .slice(0, limit);
  },
  async getFeedPostById(idValue) {
    return feedPosts.find((post) => post.id === idValue);
  },
  async getFeedReaction(postId, userId) {
    return followed.has(`reaction:${postId}:${userId}`);
  },
  async getCommentsByPost(postId) {
    return getCommentsByPost(postId);
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
  async getTeamAssignments() {
    return teamAssignments;
  },
  async getTeamAssignmentById(idValue) {
    return teamAssignments.find((assignment) => assignment.id === idValue);
  },
  async getRosters(options) {
    return take(rosters
      .filter((roster) =>
        (!options?.teamId || roster.teamId === options.teamId) &&
        (!options?.leagueId || roster.leagueId === options.leagueId)
      ), options?.limit);
  },
  async getResultSubmissionEvents(matchId) {
    return resultSubmissionEvents.filter((event) => event.submissionId === matchId);
  },
  async getStoredStandings() {
    return standings;
  },
  async getSponsorReports() {
    return sponsorReports;
  },
  async getSponsorCampaigns() {
    return investorDemoRuntime.sponsorCampaigns;
  },
  async getLeagueNotices(options) {
    return take(
      leagueNotices.filter((notice) =>
        (!options?.leagueId || notice.leagueId === options.leagueId)
        && (!options?.audience || notice.audience === options.audience)
      ),
      options?.limit,
    );
  },
  async getFinalizations() {
    return finalizations;
  },
  async getSupportNeeds(options) {
    return take(investorDemoRuntime.supportNeeds
      .filter((need) =>
        (!options?.athleteId || need.athleteId === options.athleteId) &&
        (!options?.teamId || need.teamId === options.teamId) &&
        (!options?.leagueId || need.leagueId === options.leagueId)
      ), options?.limit);
  },
  async getLeagueAdminApplications() {
    return mergedById(
      investorDemoRuntime.leagueAdminApplications,
      readStoredItems<LeagueAdminApplication>(storedApplicationsKey),
    );
  },
  async getAdminAuditEvents() {
    return investorDemoRuntime.adminAuditEvents;
  },
  async getContributionsByUser(userId) {
    return investorDemoRuntime.contributions.filter((item) => item.supporterUserId === userId);
  },
  async getAllocations() {
    return investorDemoRuntime.allocations;
  },
  async getComplianceCases() {
    return investorDemoRuntime.complianceCases;
  },
  async getStandingsByLeague(leagueId) {
    return getStandingsByLeague(leagueId);
  },
  async getTopSupportedAthletes(limit = 10) {
    return getTopSupportedAthletes(limit);
  },
  async getTopPointsAthletes(limit = 20) {
    return [...athletes]
      .sort((a, b) => (b.goalPlacePoints ?? 0) - (a.goalPlacePoints ?? 0))
      .slice(0, limit);
  },
  async getActiveChallenges() {
    return getActiveChallenges();
  },
  async getVerifiedMatches() {
    return getVerifiedMatches();
  },
  async getResultSubmission(matchId) {
    return resultSubmissions.get(matchId);
  },
  async getTeamConfirmationInbox(teamId) {
    return [...resultSubmissions.values()].filter(
      (submission) =>
        submission.opponentTeamId === teamId &&
        ['pending_confirmation', 'confirmation_overdue'].includes(submission.status),
    );
  },
  async getLeagueResultExceptions(leagueId) {
    return [...resultSubmissions.values()].filter(
      (submission) =>
        submission.leagueId === leagueId &&
        (
          ['disputed', 'confirmation_overdue'].includes(submission.status) ||
          (
            submission.status === 'official' &&
            Boolean(submission.correctionReason) &&
            !submission.correctionApprovedBy
          )
        ),
    );
  },
  async createContributionIntent(data: CreateContributionIntentInput) {
    const existing = investorDemoRuntime.paymentIntents.find(
      (item) => item.idempotencyKey === data.idempotencyKey,
    );
    if (existing) return result(existing.id, 'This demo contribution was already recorded.');
    const quote = contributionQuote(data.supportAmountMinor);
    const now = new Date().toISOString();
    const intentId = id('payment_intent');
    const contributionId = id('contribution');
    const intent: PaymentIntent = {
      id: intentId,
      supporterUserId: data.supporterUserId,
      purpose: data.purpose,
      recipientType: data.recipientType,
      recipientId: data.recipientId,
      supportNeedId: data.supportNeedId,
      campaignId: data.campaignId,
      supportAmountMinor: quote.supportAmountMinor,
      platformFeeMinor: quote.platformFeeMinor,
      totalAmountMinor: quote.totalAmountMinor,
      currency: quote.currency,
      provider: 'synthetic_demo',
      providerReference: `demo_${intentId}`,
      status: 'settled',
      idempotencyKey: data.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };
    const contribution: Contribution = {
      id: contributionId,
      paymentIntentId: intent.id,
      supporterUserId: data.supporterUserId,
      purpose: data.purpose,
      recipientType: data.recipientType,
      recipientId: data.recipientId,
      supportNeedId: data.supportNeedId,
      campaignId: data.campaignId,
      supportAmountMinor: quote.supportAmountMinor,
      platformFeeMinor: quote.platformFeeMinor,
      totalAmountMinor: quote.totalAmountMinor,
      currency: quote.currency,
      status: 'allocated',
      message: data.message,
      idempotencyKey: data.idempotencyKey,
      createdAt: now,
      settledAt: now,
    };
    const journal = buildContributionSettlement({
      transactionId: id('ledger_transaction'),
      contributionId,
      supportAmountMinor: quote.supportAmountMinor,
      platformFeeMinor: quote.platformFeeMinor,
      createdAt: now,
    });
    investorDemoRuntime.paymentIntents.unshift(intent);
    investorDemoRuntime.contributions.unshift(contribution);
    investorDemoRuntime.ledgerTransactions.unshift(journal.transaction);
    investorDemoRuntime.ledgerEntries.unshift(...journal.entries);
    investorDemoRuntime.allocations.unshift({
      id: `allocation_${contributionId}`,
      contributionId,
      recipientType: data.recipientType,
      recipientId: data.recipientId,
      supportNeedId: data.supportNeedId,
      campaignId: data.campaignId,
      amountMinor: quote.supportAmountMinor,
      currency: quote.currency,
      destinationType: data.supportNeedId
        ? investorDemoRuntime.supportNeeds.find((item) => item.id === data.supportNeedId)
          ?.preferredPayoutDestination
        : undefined,
      status: 'pending_review',
      createdAt: now,
    });
    if (data.supportNeedId) {
      const need = investorDemoRuntime.supportNeeds.find((item) => item.id === data.supportNeedId);
      if (need) {
        need.raisedAmount = Math.min(need.targetAmount, need.raisedAmount + quote.supportAmountMinor);
        if (need.raisedAmount >= need.targetAmount) need.status = 'funded';
        need.updatedAt = now;
      }
      const points: PointsEvent = {
        id: id('points'),
        userId: data.supporterUserId,
        actionType: 'verified_need_supported',
        relatedEntityId: data.supportNeedId,
        points: pointsForAction('verified_need_supported', data.supportAmountMinor),
        idempotencyKey: `verified_need_supported:${contributionId}`,
        status: 'confirmed',
        createdAt: now,
      };
      investorDemoRuntime.pointsEvents.unshift(points);
    }
    return result(intent.id, 'Synthetic PSP settlement recorded. No real money moved.');
  },
  async recordPointsAction(data: RecordPointsActionInput) {
    const idempotencyKey = pointsIdempotencyKey(
      data.userId,
      data.actionType,
      data.relatedEntityId,
    );
    const existing = investorDemoRuntime.pointsEvents.find(
      (item) => item.idempotencyKey === idempotencyKey,
    );
    if (existing) return result(existing.id, 'Recognition was already recorded.');
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const confirmed = investorDemoRuntime.pointsEvents.filter(
      (item) => item.userId === data.userId && item.status === 'confirmed',
    );
    const dailyTotal = confirmed
      .filter((item) => new Date(item.createdAt) >= dayStart)
      .reduce((sum, item) => sum + item.points, 0);
    const weeklyTotal = confirmed
      .filter((item) => new Date(item.createdAt) >= weekStart)
      .reduce((sum, item) => sum + item.points, 0);
    const points = cappedPointsAward(data.actionType, dailyTotal, weeklyTotal);
    const event: PointsEvent = {
      id: id('points'),
      userId: data.userId,
      actionType: data.actionType,
      relatedEntityId: data.relatedEntityId,
      points,
      idempotencyKey,
      status: points > 0 ? 'confirmed' : 'reversed',
      createdAt: now.toISOString(),
    };
    investorDemoRuntime.pointsEvents.unshift(event);
    return result(event.id, points > 0 ? `${points} participation points recorded.` : 'Points cap reached.');
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
    feedPosts.unshift(post);
    return result(post.id, 'Demo post created.');
  },
  async createComment(data: CreateCommentInput) {
    const comment = {
      ...data,
      id: data.id ?? id('comment'),
      status: data.status ?? 'published',
      createdAt: data.createdAt ?? new Date().toISOString(),
    };
    comments.push(comment);
    return result(comment.id, 'Demo comment added.');
  },
  async engageFeedPost(data: FeedEngagementInput) {
    const post = feedPosts.find((item) => item.id === data.postId);
    if (!post) throw new Error('This post is not available.');
    const key = `${data.action}:${data.postId}:${data.userId}`;
    if (data.action === 'reaction') {
      if (followed.has(key)) {
        followed.delete(key);
        post.likesCount = Math.max(0, post.likesCount - 1);
        return result(key, 'Reaction removed.');
      }
      followed.add(key);
      post.likesCount += 1;
      return result(key, 'Reaction saved.');
    }
    if (data.action === 'share') {
      if (!followed.has(key)) {
        followed.add(key);
        post.sharesCount += 1;
      }
      return result(key, 'Share recorded.');
    }
    if (data.action === 'comment') {
      const created = await this.createComment({
        postId: data.postId,
        authorId: data.userId,
        authorName: 'Demo fan',
        text: data.text,
      });
      post.commentsCount += 1;
      return created;
    }
    reports.unshift({
      id: key,
      reporterId: data.userId,
      type: 'reported_feed_post',
      targetId: data.postId,
      summary: data.reason,
      reportedEntity: data.postId,
      status: 'open',
      createdAt: new Date().toISOString(),
    });
    return result(key, 'Report sent to the trust team.');
  },
  async toggleFollow(userId: string, targetType: FollowTargetType, targetId: string) {
    const key = `${userId}:${targetType}:${targetId}`;
    if (followed.has(key)) followed.delete(key);
    else followed.add(key);
    const user = users.find((item) => item.id === userId);
    if (user) {
      const field = targetType === 'athlete'
        ? 'followedAthletes'
        : targetType === 'team'
          ? 'followedTeams'
          : 'followedLeagues';
      const current = new Set(user[field] ?? []);
      if (followed.has(key)) current.add(targetId);
      else current.delete(targetId);
      user[field] = [...current];
    }
    if (followed.has(key) && targetType === 'league') {
      await mockProvider.recordPointsAction({
        userId,
        actionType: 'first_league_followed',
        relatedEntityId: targetId,
      });
    }
    if (followed.has(key) && targetType === 'team') {
      await mockProvider.recordPointsAction({
        userId,
        actionType: 'team_followed',
        relatedEntityId: targetId,
      });
    }
    return result(key, followed.has(key) ? 'Demo follow saved.' : 'Demo follow removed.');
  },
  async toggleSave(userId: string, targetType: SaveTargetType, targetId: string) {
    const key = `${userId}:${targetType}:${targetId}`;
    if (saved.has(key)) saved.delete(key);
    else saved.add(key);
    return result(key, saved.has(key) ? 'Demo save added.' : 'Demo save removed.');
  },
  async updateUserProfile(userId, data) {
    const user = users.find((item) => item.id === userId);
    const demoProfile = Object.values(MOCK_PROFILES).find(
      (profile) => profile.id === userId || profile.uid === userId,
    );
    if (!user && !demoProfile) throw new Error('User profile not found.');
    if (user) Object.assign(user, data);
    if (demoProfile) Object.assign(demoProfile, data);
    if (data.onboardingCompletedAt) {
      await mockProvider.recordPointsAction({
        userId,
        actionType: 'fan_onboarding_completed',
      });
    }
    return result(userId, 'Profile updated.');
  },
  async updateAthleteProfile(athleteId, data) {
    const athlete = athletes.find((item) => item.id === athleteId);
    if (!athlete) throw new Error('Athlete profile not found.');
    Object.assign(athlete, data);
    return result(athleteId, 'Athlete profile updated.');
  },
  async createAthleteProfile(data) {
    const team = teams.find((item) => item.id === data.teamId);
    if (!team) throw new Error('Team not found.');
    const athleteId = id('athlete_demo');
    athletes.unshift({
      id: athleteId,
      name: data.name,
      sport: team.sport,
      position: data.position,
      teamId: team.id,
      leagueId: team.leagueId,
      city: team.city,
      country: 'Uganda',
      ageGroup: data.ageGroup,
      bio: `${data.name} is building a verified sporting record with ${team.name}.`,
      verified: false,
      verificationStatus: 'pending',
      totalSupport: 0,
      supportersCount: 0,
      goalPlacePoints: 0,
      stats: {},
      impactNeeds: [],
      createdAt: new Date().toISOString(),
    });
    return result(athleteId, 'Pending athlete profile created.');
  },
  async requestAthleteClaim(athleteId, userId) {
    const athlete = athletes.find((item) => item.id === athleteId);
    if (!athlete) throw new Error('Athlete profile not found.');
    if (athlete.userId) throw new Error('This athlete profile is already linked.');
    const claim = {
      id: id('athlete_claim'),
      athleteId,
      teamId: athlete.teamId,
      leagueId: athlete.leagueId,
      requesterUserId: userId,
      status: 'team_pending' as const,
      createdAt: new Date().toISOString(),
    };
    investorDemoRuntime.athleteClaims.unshift(claim);
    return result(claim.id, claim.status);
  },
  async reviewAthleteClaim(claimId, actorUserId, action, reason) {
    const claim = investorDemoRuntime.athleteClaims.find((item) => item.id === claimId);
    if (!claim) throw new Error('Athlete claim not found.');
    if (action === 'team_confirm') {
      claim.status = 'league_pending';
      claim.teamReviewedByUserId = actorUserId;
    } else if (action === 'league_verify') {
      claim.status = 'linked';
      claim.leagueReviewedByUserId = actorUserId;
      const athlete = athletes.find((item) => item.id === claim.athleteId);
      if (athlete) athlete.userId = claim.requesterUserId;
    } else {
      claim.status = 'rejected';
      claim.rejectionReason = reason;
    }
    claim.updatedAt = new Date().toISOString();
    return result(claim.id, claim.status);
  },
  async updateTeamProfile(teamId, data) {
    const team = teams.find((item) => item.id === teamId);
    if (!team) throw new Error('Team profile not found.');
    Object.assign(team, data);
    return result(teamId, 'Team profile updated.');
  },
  async saveRoster(roster) {
    replaceById(rosters, { ...roster, updatedAt: new Date().toISOString() });
    return result(roster.id, 'Roster saved.');
  },
  async createChallenge(data) {
    const challenge: Challenge = {
      ...data,
      id: data.id ?? id('challenge'),
      createdAt: new Date().toISOString(),
    };
    challenges.unshift(challenge);
    return result(challenge.id, 'Challenge proposal created.');
  },
  async transitionChallenge(data: TransitionChallengeInput) {
    const challenge = challenges.find((item) => item.id === data.challengeId);
    if (!challenge) throw new Error('Challenge not found.');
    const nextStatus = challengeNextStatus(normalizeChallengeStatus(challenge.status), data.action);
    challenge.status = nextStatus;
    challenge.actionHistory = [
      ...(challenge.actionHistory ?? []),
      `${data.action.replaceAll('_', ' ')} by ${data.actorUserId}${data.note ? `: ${data.note}` : ''}`,
    ];
    if (data.action === 'team_approve') challenge.teamApprovedByUserId = data.actorUserId;
    if (data.action === 'league_approve') challenge.leagueApprovedByUserId = data.actorUserId;
    if (data.action === 'submit_evidence') challenge.evidenceRefs = data.evidenceRefs ?? [];
    if (['mark_achieved', 'mark_not_achieved', 'mark_void'].includes(data.action)) {
      challenge.outcomeVerifiedByUserId = data.actorUserId;
      challenge.outcomeNote = data.note;
      challenge.verificationStatus = data.action === 'mark_achieved' ? 'verified' : 'rejected';
    }
    if (data.action === 'open_funding') challenge.termsLockedAt = new Date().toISOString();
    return result(challenge.id, `Challenge moved to ${nextStatus.replaceAll('_', ' ')}.`);
  },
  async createLeagueNotice(data) {
    const notice = {
      ...data,
      id: data.id ?? id('notice'),
      createdAt: new Date().toISOString(),
    };
    leagueNotices.unshift(notice);
    return result(notice.id, 'League notice published.');
  },
  async createSeason(data) {
    const season = {
      ...data,
      id: data.id ?? id('season'),
      createdAt: new Date().toISOString(),
    };
    seasons.unshift(season);
    return result(season.id, 'Season created.');
  },
  async transitionSeason(seasonId, status) {
    const season = seasons.find((item) => item.id === seasonId);
    if (!season) throw new Error('Season not found.');
    season.status = status;
    return result(seasonId, `Season moved to ${status}.`);
  },
  async createTeams(nextTeams) {
    for (const team of nextTeams) replaceById(teams, team);
    return result(nextTeams[0]?.id ?? id('team_batch'), `${nextTeams.length} teams imported.`);
  },
  async createFixtures(fixtures) {
    for (const fixture of fixtures) replaceById(matches, fixture);
    return result(fixtures[0]?.id ?? id('fixture_batch'), `${fixtures.length} fixtures created.`);
  },
  async createTeamAdminInvitation(data) {
    replaceById(teamAssignments, data);
    audit({
      actorUserId: data.invitedByUserId ?? data.userId,
      action: 'invited',
      targetCollection: 'teamAssignments',
      targetId: data.id,
    });
    return {
      ...result(data.id, 'Team Admin invitation created.'),
      actionUrl: `/invitations/team/${data.id}?token=demo`,
    };
  },
  async acceptTeamAdminInvitation(assignmentId, userId, token) {
    if (!token) throw new Error('A complete invitation link is required.');
    const assignment = teamAssignments.find((item) => item.id === assignmentId);
    if (!assignment || (assignment.userId && assignment.userId !== userId)) throw new Error('Invitation not found.');
    assignment.userId = userId;
    assignment.status = 'active';
    assignment.acceptedAt = new Date().toISOString();
    audit({
      actorUserId: userId,
      action: 'accepted',
      targetCollection: 'teamAssignments',
      targetId: assignmentId,
    });
    return result(assignmentId, 'Team Admin invitation accepted.');
  },
  async markNotificationRead(notificationId, read = true) {
    const notification = notifications.find((item) => item.id === notificationId);
    if (!notification) throw new Error('Notification not found.');
    notification.read = read;
    return result(notificationId, read ? 'Notification read.' : 'Notification marked unread.');
  },
  async markAllNotificationsRead(userId) {
    const userNotifications = notifications.filter((item) => item.userId === userId);
    userNotifications.forEach((item) => { item.read = true; });
    return result(userId, `${userNotifications.length} notifications marked read.`);
  },
  subscribeToNotifications(userId, listener) {
    listener(notifications.filter((item) => item.userId === userId));
    return () => {};
  },
  async createSupportNeed(data) {
    const need: SupportNeed = {
      ...data,
      id: data.id ?? id('support_need'),
      raisedAmount: 0,
      recipientUpdates: [],
      createdAt: new Date().toISOString(),
    };
    investorDemoRuntime.supportNeeds.unshift(need);
    return result(need.id, 'Support need published.');
  },
  async addSupportNeedUpdate(needId, input) {
    const need = investorDemoRuntime.supportNeeds.find((item) => item.id === needId);
    if (!need) throw new Error('Support need not found.');
    need.recipientUpdates.unshift({
      id: id('need_update'),
      message: input.message,
      evidenceUrl: input.evidenceUrl,
      createdAt: new Date().toISOString(),
    });
    need.updatedAt = new Date().toISOString();
    return result(needId, 'Support update published.');
  },
  async reviewSupportNeed(data: ReviewSupportNeedInput) {
    const need = investorDemoRuntime.supportNeeds.find(
      (item) => item.id === data.supportNeedId,
    );
    if (!need) throw new Error('Support need not found.');
    if (data.action === 'team_verify') {
      if (need.approvalStatus !== 'proposed') throw new Error('This need is not awaiting team review.');
      need.approvalStatus = 'team_verified';
      need.teamVerifiedByUserId = data.actorUserId;
    } else if (data.action === 'league_approve') {
      if (need.approvalStatus !== 'team_verified') throw new Error('Team verification is required first.');
      need.approvalStatus = 'league_approved';
      need.verificationStatus = 'verified';
      need.leagueApprovedByUserId = data.actorUserId;
    } else {
      need.approvalStatus = 'rejected';
      need.verificationStatus = 'rejected';
      need.status = 'cancelled';
    }
    need.updatedAt = new Date().toISOString();
    return result(need.id, `Support need ${need.approvalStatus.replaceAll('_', ' ')}.`);
  },
  async completeSupportNeed(data) {
    const need = investorDemoRuntime.supportNeeds.find((item) => item.id === data.supportNeedId);
    if (!need) throw new Error('Support need not found.');
    if (need.status !== 'funded') throw new Error('Only a funded need can be completed.');
    if (!need.recipientUpdates.some((update) => Boolean(update.evidenceUrl))) {
      throw new Error('Completion evidence is required.');
    }
    need.status = 'completed';
    need.updatedAt = new Date().toISOString();
    audit({
      actorUserId: data.actorUserId,
      action: 'approved',
      targetCollection: 'supportNeeds',
      targetId: need.id,
      note: data.note,
    });
    return result(need.id, 'Support need marked completed.');
  },
  async createLeagueAdminApplication(data) {
    const application: LeagueAdminApplication = {
      ...data,
      id: data.id ?? id('league_application'),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    persistDemoApplication(application);
    return result(application.id, 'League Admin application submitted.');
  },
  async reviewApproval(input) {
    if (input.targetCollection === 'athletes') {
      const athlete = athletes.find((item) => item.id === input.targetId);
      if (!athlete) throw new Error('Athlete not found.');
      athlete.verificationStatus = input.decision === 'approved' ? 'verified' : 'pending';
      athlete.verified = input.decision === 'approved';
    } else if (input.targetCollection === 'leagues') {
      const league = leagues.find((item) => item.id === input.targetId);
      if (!league) throw new Error('League not found.');
      league.status = input.decision === 'approved' ? 'verified' : 'draft';
      league.verified = input.decision === 'approved';
    } else {
      const application = investorDemoRuntime.leagueAdminApplications.find((item) => item.id === input.targetId)
        ?? readStoredItems<LeagueAdminApplication>(storedApplicationsKey).find((item) => item.id === input.targetId);
      if (!application) throw new Error('Application not found.');
      application.status = input.decision === 'requested_information'
        ? 'needs_information'
        : input.decision;
      application.reviewedByUserId = input.actorUserId;
      application.updatedAt = new Date().toISOString();
      if (input.decision === 'approved') {
        const league = draftLeagueFromApplication(application);
        application.leagueId = league.id;
        persistDemoLeague(league);
      }
      persistDemoApplication(application);
    }
    audit({
      actorUserId: input.actorUserId,
      action: input.decision,
      targetCollection: input.targetCollection,
      targetId: input.targetId,
      note: input.note,
    });
    return result(
      input.targetId,
      input.targetCollection === 'leagueAdminApplications' && input.decision === 'approved'
        ? 'Demo league created.'
        : 'Approval decision recorded.',
    );
  },
  async resolveReport(input) {
    const report = reports.find((item) => item.id === input.reportId);
    if (!report) throw new Error('Report not found.');
    report.status = input.decision;
    report.updatedAt = new Date().toISOString();
    report.actionHistory = [
      ...(report.actionHistory ?? []),
      input.note || (input.decision === 'resolved' ? 'Case resolved' : 'Case dismissed'),
    ];
    audit({
      actorUserId: input.actorUserId,
      action: input.decision,
      targetCollection: 'reports',
      targetId: input.reportId,
      note: input.note,
    });
    return result(input.reportId, 'Trust decision recorded.');
  },
  async createResultSubmission(data) {
    const existing = resultSubmissions.get(data.match.id);
    if (!canAcceptNewSubmission(existing)) {
      throw new Error('This match already has an active result submission.');
    }
    const now = new Date().toISOString();
    const opponentTeamId =
      data.match.homeTeamId === data.submittedByTeamId
        ? data.match.awayTeamId
        : data.match.homeTeamId;
    const submission: ResultSubmission = {
      id: data.match.id,
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
      evidenceNote: data.evidenceNote,
      status: 'pending_confirmation',
      revision: (existing?.revision ?? 0) + 1,
      submittedAsFinal: true,
      confirmationDeadline: confirmationDeadlineFrom(now),
      resultVersion: existing?.resultVersion ?? 1,
      submittedAt: now,
    };
    resultSubmissions.set(data.match.id, submission);
    resultSubmissionEvents.unshift({
      id: id('result_event'),
      submissionId: data.match.id,
      from: existing?.status ?? null,
      to: 'pending_confirmation',
      actor: 'submitting_team',
      actorUserId: data.submittedByUserId,
      createdAt: now,
    });
    notifySubmission(data.match.id);
    return result(data.match.id, 'Demo result submitted.');
  },
  async confirmResultSubmission(matchId, respondedByUserId) {
    const submission = resultSubmissions.get(matchId);
    if (!submission) throw new Error('Result submission not found.');
    const now = new Date().toISOString();
    const official: ResultSubmission = {
      ...submission,
      status: 'official',
      respondedByUserId,
      respondedAt: now,
      resolution: 'opponent_confirmed',
      finalizationSource: 'mutual_confirmation',
      finalizationKey: `${matchId}:${matchId}:${submission.resultVersion}`,
      finalizedAt: now,
    };
    resultSubmissions.set(matchId, official);
    resultSubmissionEvents.unshift({
      id: id('result_event'),
      submissionId: matchId,
      from: submission.status,
      to: 'official',
      actor: 'system',
      actorUserId: 'goalplace-finalizer',
      createdAt: now,
    });
    const match = matches.find((item) => item.id === matchId);
    if (match) {
      match.status = 'completed';
      match.score = { home: official.homeScore, away: official.awayScore };
      match.verificationStatus = 'verified';
      match.officialResultVersion = official.resultVersion;
    }
    notifySubmission(matchId);
    return result(matchId, 'Demo result confirmed and finalized.');
  },
  async disputeResultSubmission(matchId, respondedByUserId, reason) {
    const submission = resultSubmissions.get(matchId);
    if (!submission) throw new Error('Result submission not found.');
    resultSubmissions.set(matchId, {
      ...submission,
      status: 'disputed',
      respondedByUserId,
      respondedAt: new Date().toISOString(),
      disputeReason: reason,
    });
    resultSubmissionEvents.unshift({
      id: id('result_event'),
      submissionId: matchId,
      from: submission.status,
      to: 'disputed',
      actor: 'opponent_team',
      actorUserId: respondedByUserId,
      note: reason,
      createdAt: new Date().toISOString(),
    });
    notifySubmission(matchId);
    return result(matchId, 'Demo dispute recorded.');
  },
  async finalizeResultSubmission(matchId) {
    const submission = resultSubmissions.get(matchId);
    if (!submission) throw new Error('Result submission not found.');
    if (submission.status !== 'official') {
      throw new Error('This result is not ready for finalization.');
    }
    return result(matchId, 'Demo result is official.');
  },
  async resolveDisputedSubmission(data: ResolveResultSubmissionInput) {
    const submission = resultSubmissions.get(data.matchId);
    if (!submission) throw new Error('Result submission not found.');
    const now = new Date().toISOString();
    if (data.decision === 'reject') {
      resultSubmissions.set(data.matchId, {
        ...submission,
        status: 'rejected',
        resolvedByUserId: data.resolvedByUserId,
        resolvedAt: now,
        finalDecisionNote: data.note,
      });
      notifySubmission(data.matchId);
      return result(data.matchId, 'Demo result rejected.');
    }
    const resolution =
      submission.status === 'confirmation_overdue'
        ? 'league_confirmed_unresponsive'
        : data.decision === 'correct'
          ? 'league_corrected'
          : 'league_upheld';
    const updated: ResultSubmission = {
      ...submission,
      status: 'official',
      resolution,
      resolvedByUserId: data.resolvedByUserId,
      resolvedAt: now,
      finalDecisionNote: data.note,
      correctedHomeScore: data.correctedScore?.home,
      correctedAwayScore: data.correctedScore?.away,
      finalizationSource:
        resolution === 'league_confirmed_unresponsive'
          ? 'league_admin_nonresponse_confirmation'
          : 'league_admin_dispute_resolution',
      finalizationKey: `${data.matchId}:${data.matchId}:${submission.resultVersion}`,
      finalizedAt: now,
    };
    resultSubmissions.set(data.matchId, updated);
    const match = matches.find((item) => item.id === data.matchId);
    if (match) {
      match.status = 'completed';
      match.score = {
        home: updated.correctedHomeScore ?? updated.homeScore,
        away: updated.correctedAwayScore ?? updated.awayScore,
      };
      match.verificationStatus = 'verified';
      match.officialResultVersion = updated.resultVersion;
    }
    notifySubmission(data.matchId);
    return result(data.matchId, 'Demo dispute resolved and finalized.');
  },
  async requestResultCorrection(matchId, requestedByUserId, reason) {
    const submission = resultSubmissions.get(matchId);
    if (!submission) throw new Error('Result submission not found.');
    resultSubmissions.set(matchId, {
      ...submission,
      correctionReason: reason,
      correctionRequestedBy: requestedByUserId,
    });
    notifySubmission(matchId);
    return result(matchId, 'Demo correction request recorded.');
  },
  async approveResultCorrection(data) {
    const submission = resultSubmissions.get(data.matchId);
    if (!submission || submission.status !== 'official') {
      throw new Error('Only an official result can be corrected.');
    }
    const now = new Date().toISOString();
    const version = submission.resultVersion + 1;
    const updated: ResultSubmission = {
      ...submission,
      homeScore: data.homeScore,
      awayScore: data.awayScore,
      correctedHomeScore: undefined,
      correctedAwayScore: undefined,
      status: 'official',
      revision: submission.revision + 1,
      resultVersion: version,
      correctionReason: data.reason,
      correctionApprovedBy: data.actorUserId,
      resolvedByUserId: data.actorUserId,
      resolution: 'league_corrected',
      finalDecisionNote: data.reason,
      finalizationKey: `${data.matchId}:${data.matchId}:${version}`,
      finalizedAt: now,
    };
    resultSubmissions.set(data.matchId, updated);
    const match = matches.find((item) => item.id === data.matchId);
    if (match) {
      match.score = { home: data.homeScore, away: data.awayScore };
      match.officialResultVersion = version;
      match.verificationStatus = 'verified';
    }
    notifySubmission(data.matchId);
    return result(data.matchId, `Official result updated to version ${version}.`);
  },
  subscribeToResultSubmission(matchId, listener) {
    const listeners =
      resultSubmissionListeners.get(matchId) ??
      new Set<(submission: ResultSubmission | undefined) => void>();
    listeners.add(listener);
    resultSubmissionListeners.set(matchId, listeners);
    listener(resultSubmissions.get(matchId));
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) resultSubmissionListeners.delete(matchId);
    };
  },
};
