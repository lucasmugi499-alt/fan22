export type SportSlug = "football" | "basketball" | "rugby";

export type UserRole =
  | "fan"
  | "athlete"
  | "team_admin"
  | "league_admin"
  | "sponsor"
  | "platform_admin"
  | "super_admin";

export type AppRole = UserRole;

export type AccountClass =
  | "fan"
  | "athlete"
  | "organization_operator"
  | "platform_operator";

export type ProfileStatus = "active" | "pending" | "suspended";

export type SportType = "Football" | "Basketball" | "Rugby";

// Relative, not aliased. This file compiles into the Cloud Functions bundle, where a path
// alias survives into the emitted CommonJS and fails at require time. It happens to erase
// today because the import is type-only, which is exactly the kind of accident that stops
// being true the moment somebody needs a value from here.
import type { CapturePolicy } from '../lib/capturePolicy';

export type LeagueStatus =
  | "draft"
  | "community"
  | "verified"
  | "partner"
  // Platform is running this league directly. One of the two states in which a league is
  // permitted to have no accountable League Admin, the other being `suspended`; both are
  // decisions somebody recorded rather than states a league drifts into by losing its last
  // operator. See src/server/access/lastAdmin.ts.
  | "platform_managed"
  | "suspended";

export type PlanType = "free" | "pro" | "partner";

export type SeasonStatus =
  | "draft"
  | "registration"
  | "active"
  | "completed"
  | "archived";

export type CompetitionFormat = "league" | "knockout" | "group_knockout";

/**
 * Points awarded per result. Sport-specific because the platform runs football, basketball
 * and rugby side by side and they do not share a scoring system: football is 3/1/0,
 * basketball has no draws at all, and rugby is 4/2/0.
 *
 * `draw: null` means the sport cannot draw — a drawn scoreline is a data error rather than
 * a zero-point result, and standings surface it as such instead of silently awarding 0.
 *
 * Rugby bonus points (a try bonus, and a losing bonus inside a 7-point margin) are NOT
 * modelled here yet: awarding them requires per-team try counts, and `MatchEvent` does not
 * carry them. Adding bonus rules later only extends this record — it does not migrate any
 * match data — whereas omitting `seasonId` from matches now would.
 */
export interface SeasonScoringRules {
  win: number;
  draw: number | null;
  loss: number;
}

/**
 * A season is the unit that competition records belong to. Without it, a league's history
 * is a single undifferentiated pile: last year's table cannot be told from this year's, a
 * roster that changed between seasons cannot be represented, and an athlete's career
 * cannot be read season by season — which is the historical record the platform's
 * long-term value rests on.
 */
export interface Season {
  id: string;
  leagueId: string;
  /** Human label, e.g. "2026 Regular Season". Unique within a league. */
  name: string;
  sport: SportSlug;
  status: SeasonStatus;
  startDate: string;
  endDate?: string;
  competitionFormat: CompetitionFormat;
  scoring: SeasonScoringRules;
  /**
   * What the league asks for. Not what applies: Platform can impose a floor, and the
   * resolved value is bound onto each fixture at creation. See src/lib/capturePolicy.ts.
   */
  capturePolicy?: CapturePolicy;
  /** Refuse to assign a Field Manager who has declared an affiliation with either club. */
  neutralFieldManagerRequired?: boolean;
  createdAt: string;
}

/**
 * Status vocabularies are canonical lowercase, matching how records are stored in
 * Firestore and the seed data. They previously carried both casings in the same union,
 * which meant `status === 'Verified'` silently returned false for the majority of records
 * that store `'verified'` — so comparisons had to defend with `.toLowerCase()` and any
 * that forgot were quietly wrong. Normalize once at the data boundary
 * (`src/lib/status.ts`), compare against these values, and render labels with the display
 * helpers rather than comparing against human-readable text.
 */

/** Lifecycle only. Whether a result is trustworthy is `verificationStatus`, not this. */
export type MatchStatus = "scheduled" | "live" | "completed" | "cancelled";

export type VerificationStatus = "pending" | "verified" | "rejected" | "disputed";

export type ChallengeStatus =
  | "draft"
  | "proposed"
  | "team_approved"
  | "league_approved"
  | "funding_open"
  | "funding_locked"
  | "in_progress"
  | "evidence_submitted"
  | "under_review"
  | "achieved"
  | "not_achieved"
  | "void"
  | "allocation_pending"
  | "settled";

export type ChallengeFundingModel = "non_cash" | "sponsor_grant";

/**
 * Result submission lifecycle.
 *
 * There is deliberately ONE status field. An earlier draft paired `status` with a separate
 * `opponentResponse`, which reintroduces exactly the failure this codebase just spent a
 * migration removing: two fields describing one truth, free to contradict each other
 * (`status: 'confirmed'` alongside `opponentResponse: 'disputed'`). The opponent's answer
 * is implied by the status — `pending_confirmation` means they have not answered,
 * `confirmed` and `disputed` are their answer — and who supplied it is recorded in
 * `resolution` and `respondedByUserId`.
 *
 * `official` is reachable only by `system`. No client may write it; see firestore.rules.
 */
export type ResultSubmissionStatus =
  | "pending_confirmation"
  /** 72h elapsed with no opponent response. Escalated to the league — never auto-confirmed. */
  | "confirmation_overdue"
  /** Settled and awaiting finalization. How it settled is `finalizationSource`, not a status. */
  | "confirmed"
  | "disputed"
  | "official"
  | "rejected"
  | "withdrawn"
  /** A previously official result replaced by a correction. Archived, never mutated. */
  | "superseded";

/**
 * How a result became finalizable. Deliberately a separate field rather than three
 * finalizable statuses: the status says *whether* a submission is ready, this says *how* it
 * got there. Folding provenance into the status would put two facts in one field — the
 * failure mode this codebase has already had to migrate away from twice.
 *
 * A league admin confirming after silence does NOT carry the provenance of mutual
 * confirmation. The public result may still read "Official"; the audit trail must not.
 */
/**
 * How a result came to be official, in the words its own audit trail should use.
 *
 * Separate from `sourceType`, which says what kind of record produced it. The two answer
 * different questions and folding them into one field is the "two facts in one field" defect
 * this codebase has migrated away from twice: a result can be `field_capture` by source and
 * `field_capture_league_reviewed` by how it settled, and a reader is owed both.
 *
 * The first three values are the bilateral workflow's, and they are kept because hundreds of
 * historical records carry them. A result confirmed by the opposing club and one confirmed
 * after that club said nothing are not the same evidence, and the quality tier reads the
 * difference.
 */
export type FinalizationSource =
  | "mutual_confirmation"
  | "league_admin_dispute_resolution"
  | "league_admin_nonresponse_confirmation"
  // Added 2026-08-25 with the candidate-based finalizer, when the bilateral workflow stopped
  // being the only way a result could become official.
  | "live_field_capture"
  | "field_capture_league_reviewed"
  | "league_post_match"
  | "platform_exception_resolution"
  | "correction";

export type ResultSubmissionActor =
  | "submitting_team"
  | "opponent_team"
  | "league_admin"
  | "system";

/** How a submission came to be settled, kept for audit after the fact. */
export type ResultResolution =
  | "opponent_confirmed"
  | "league_confirmed_unresponsive"
  | "league_upheld"
  | "league_corrected";

export interface ScorerEntry {
  athleteId: string;
  teamId: string;
  /** Goals, tries or points attributed to this athlete. */
  count: number;
  minute?: number;
}

export interface AthleteStatLine {
  athleteId: string;
  teamId: string;
  /** Verified minutes when the report carries them. */
  minutesPlayed?: number;
  /** Sport-specific stat keys, e.g. assist, rebound, conversion, yellow_card. */
  stats: Record<string, number>;
  playerOfMatch?: boolean;
}

/**
 * A claim about a match result, made by one team and answered by the other.
 *
 * This is NOT the official record. Team admins never write to `matches` — they write here,
 * and a trusted server-side finalizer promotes a settled submission onto the match. That
 * separation is what lets Team Admins report results without being able to author official
 * data.
 *
 * The document id is the `matchId`. That is load-bearing: it makes "one active submission
 * per match" an atomic guarantee from Firestore itself, so two team admins submitting
 * simultaneously resolve by first-write-wins with no transaction. The loser of that race
 * is routed to respond to the existing submission rather than creating a second one.
 */
export interface ResultSubmission {
  /** Equal to `matchId` — see the note above. */
  id: string;
  matchId: string;
  leagueId: string;
  seasonId: string;

  submittedByTeamId: string;
  opponentTeamId: string;
  submittedByUserId: string;

  /** The score as claimed by the submitting team. Never overwritten. */
  homeScore: number;
  awayScore: number;
  /** Set only when a league admin adjudicates a different score. */
  correctedHomeScore?: number;
  correctedAwayScore?: number;

  scorers: ScorerEntry[];
  /**
   * Match-specific active squad/appearance claim by team. This is captured with the final
   * report and becomes official only after opponent confirmation or league resolution.
   */
  activeSquads?: Record<string, string[]>;
  /**
   * Sport-specific per-athlete box-score/event claims captured by Matchday Field Mode.
   * These are trusted only after the submission is confirmed or resolved and finalized.
   */
  athleteStatLines?: AthleteStatLine[];
  evidenceRefs: string[];
  evidenceNote?: string;

  status: ResultSubmissionStatus;
  /** Increments when a new submission replaces a rejected or withdrawn one. */
  revision: number;

  respondedByUserId?: string;
  disputeReason?: string;

  resolvedByUserId?: string;
  resolution?: ResultResolution;
  finalDecisionNote?: string;

  /** Set true only when the submitter explicitly declares the match ended. */
  submittedAsFinal: boolean;
  /** 72h after submission. Passing it escalates; it never confirms anything. */
  confirmationDeadline: string;
  remindersSentAt?: string[];

  /** How this result became official. Required once status is `official`. */
  finalizationSource?: FinalizationSource;
  confirmedByUserId?: string;
  confirmationReason?: string;
  confirmedAt?: string;

  /**
   * Official results are versioned, not immutable-forever. Referee corrections,
   * eligibility rulings and abandoned matches are ordinary sports operations; the pilot
   * cannot depend on super-admin database surgery for them.
   */
  resultVersion: number;
  supersedesSubmissionId?: string;
  supersededBySubmissionId?: string;
  correctionReason?: string;
  correctionRequestedBy?: string;
  correctionApprovedBy?: string;

  /**
   * `${matchId}:${id}:${resultVersion}`. The finalizer no-ops if this key is already
   * recorded, so an onWrite retry or the reconciliation sweep cannot double-apply a result.
   */
  finalizationKey?: string;

  submittedAt: string;
  respondedAt?: string;
  resolvedAt?: string;
  finalizedAt?: string;
}

/**
 * A finalization blocked because the recorded events contradict the submitted score.
 *
 * Written by the trusted finalizer and never by a client. The id is deterministic
 * (`reconciliation_<matchId>_<submissionVersion>`) so a redelivered trigger updates one
 * case rather than opening several, and the submitted events and evidence are referenced
 * rather than copied — the League needs the originals to decide which side is wrong.
 */
export interface ReconciliationException {
  id: string;
  exceptionId: string;
  matchId: string;
  leagueId: string;
  competitionId: string;
  submissionId: string;
  submissionVersion: number;
  sport: string;
  officialHomeScore: number;
  officialAwayScore: number;
  reconstructedHomeScore: number;
  reconstructedAwayScore: number;
  /** Reconstructed minus official. Positive means the events claim more than the result. */
  homeDifference: number;
  awayDifference: number;
  eventIds: string[];
  evidenceRefs: string[];
  reasonCode: string;
  /**
   * Workflow state, owned by Platform. It is deliberately NOT the sporting outcome:
   * resolving a case does not decide the result. The governing League still owns the
   * correction path, so Platform can acknowledge, escalate or close the operational item
   * without ever editing a score.
   */
  status: 'open' | 'acknowledged' | 'escalated' | 'resolved' | 'superseded';
  acknowledgedByUserId?: string;
  acknowledgedAt?: string;
  resolvedByUserId?: string;
  resolvedAt?: string;
  workflowNote?: string;
  reconciliationStatus: 'surplus';
  finalizationStatus: 'blocked';
  reviewStatus: 'league_review_required';
  finalizationAttemptId: string;
  createdAt: string;
  updatedAt: string;
}

/** One immutable entry per transition, stored in the submission's `events` subcollection. */
export interface ResultSubmissionEvent {
  id: string;
  submissionId: string;
  from: ResultSubmissionStatus | null;
  to: ResultSubmissionStatus;
  actor: ResultSubmissionActor;
  actorUserId: string;
  note?: string;
  createdAt: string;
}

export type SupportType =
  | "direct_support"
  | "performance_pledge"
  | "team_pool"
  | "league_campaign";

export type SupportStatus =
  | "pending"
  | "held"
  | "released"
  | "refunded"
  | "failed";

export type FeedPostType =
  | "athlete_highlight"
  | "verified_achievement"
  | "match_result"
  | "support_milestone"
  | "league_update"
  | "league_announcement"
  | "team_update"
  | "fan_comment"
  | "sponsor_impact"
  | "awards_update"
  | "annual_awards"
  | "VerifiedAchievement"
  | "AthleteHighlight"
  | "MatchResult"
  | "SupportMilestone"
  | "LeagueUpdate"
  | "SponsorImpact"
  | "AnnualAwards";

export type Currency = "UGX";

export interface UserProfile {
  id: string;
  uid: string;
  email: string;
  name: string;
  displayName?: string;
  /**
   * Legacy coarse persona used for current route selection and demo accounts.
   * Authorization for scoped operations should use access assignments.
   */
  role: AppRole;
  accountClass?: AccountClass;
  primaryPersona?: AppRole;
  accountStatus?: "invited" | "active" | "suspended" | "disabled" | "deletion_pending";
  personId?: string;
  accessVersion?: number;
  onboardingStatus?: "not_started" | "in_progress" | "completed";
  status: ProfileStatus;
  avatarUrl?: string;
  /** Legacy Community Points balance projection. Prefer `engagementPointsBalance`. */
  points: number;
  engagementPointsBalance?: number;
  walletBalance: number;
  followedAthletes: string[];
  followedTeams: string[];
  followedLeagues: string[];
  city?: string;
  sportPreferences?: SportSlug[];
  notificationPreferences?: NotificationPreferences;
  lowDataMode?: boolean;
  onboardingCompletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface NotificationPreferences {
  matchday: boolean;
  athletes: boolean;
  support: boolean;
  teamOperations: boolean;
  leagueOperations: boolean;
  platformOperations: boolean;
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

export interface Sport {
  id: SportSlug;
  name: string;
  icon: string;
  color: string;
  gradient: string;
  description: string;
  statLabels: string[];
  challengeExamples: string[];
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  name?: string;
  /** Legacy primary persona. Scoped access lives in `accessAssignments`. */
  role: UserRole;
  accountClass?: AccountClass;
  primaryPersona?: AppRole;
  accountStatus?: "invited" | "active" | "suspended" | "disabled" | "deletion_pending";
  personId?: string;
  accessVersion?: number;
  onboardingStatus?: "not_started" | "in_progress" | "completed";
  photoURL?: string;
  avatarUrl?: string;
  city: string;
  country: "Uganda";
  /** Legacy Community Points balance projection. Prefer `engagementPointsBalance`. */
  points: number;
  engagementPointsBalance?: number;
  walletBalance: number;
  followedAthletes?: string[];
  followedTeams?: string[];
  followedLeagues?: string[];
  status: ProfileStatus;
  createdAt: string;
}

export interface League {
  id: string;
  name: string;
  sport: SportSlug | SportType;
  city: string;
  country: "Uganda";
  description: string;
  status: LeagueStatus;
  lifecycleStatus?:
    | "application_approved"
    | "draft"
    | "onboarding"
    | "configuration_review"
    | "ready_to_launch"
    | "active"
    | "paused"
    | "suspended"
    | "completed"
    | "archived";
  plan: PlanType;
  verified: boolean;
  adminUserIds: string[];
  /** Legacy label retained for display; `currentSeasonId` is the real relationship. */
  season: string;
  /** The season new fixtures belong to and that dashboards default to. */
  currentSeasonId?: string;
  teamsCount: number;
  athletesCount: number;
  matchesCount: number;
  matchCompletionRate: number;
  verifiedResultsRate: number;
  goalPlaceIndex: number;
  ranking?: number;
  logoUrl?: string;
  verifiedPercentage?: number;
  completionRate?: number;
  indexSignals?: GoalPlaceIndexSignals;
  totalSupport: number;
  supportersCount: number;
  verificationRules: {
    requiresLeagueAdminApproval: boolean;
    requiresRefereeConfirmation: boolean;
    allowsPerformancePledges: boolean;
  };
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  sport: SportSlug | SportType;
  leagueId: string;
  city: string;
  location?: string;
  country: "Uganda";
  description: string;
  logoURL?: string;
  logoUrl?: string;
  plan: "free" | "pro";
  verified: boolean;
  /**
   * @deprecated ADR-004 retired Team Admin. Authority comes from access assignments, and
   * nothing may grant it by writing an id into this array. Optional so a team created today
   * simply does not carry one.
   */
  adminUserIds?: string[];
  totalSupport: number;
  supportPool?: number;
  supportersCount: number;
  /**
   * Stored standings aggregates, all deprecated and all optional.
   *
   * They were seeded independently of any match, which is how clubs came to display a record
   * in a competition holding no results. The official standings projection is the only
   * authority for a sporting number; these survive only as a fallback on surfaces that have
   * not loaded a table, and a newly created team must not be given a fabricated zero.
   * See scripts/data/deprecated-fields-guard.ts.
   */
  wins?: number;
  draws?: number;
  losses?: number;
  pointsFor?: number;
  pointsAgainst?: number;
  leaguePoints?: number;
  recentResults?: string[];
  teamAdminName?: string;
  teamAdminEmail?: string;
  rosterCompleteness?: number;
  verificationStatus?: VerificationStatus;
  pendingSubmissions?: number;
  lastUpdated?: string;
  record?: string;
  publicProfileCompleteness?: number;
  sponsorVisibility?: string;
  createdAt: string;
}

export interface TeamAssignment {
  id: string;
  userId: string;
  teamId: string;
  leagueId: string;
  seasonId: string;
  role: "team_admin";
  status: "invited" | "active" | "revoked";
  invitedByUserId?: string;
  invitedEmail?: string;
  tokenHash?: string;
  expiresAt?: string;
  emailProvider?: "resend" | "demo";
  emailDelivery?: "sent" | "not_configured" | "failed";
  emailMessageId?: string;
  emailSentAt?: string;
  emailError?: string;
  revokedAt?: string;
  acceptedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Roster {
  id: string;
  leagueId: string;
  seasonId: string;
  teamId: string;
  athleteIds: string[];
  status: "draft" | "submitted" | "confirmed" | "returned";
  completeness: number;
  submittedByUserId?: string;
  approvedByUserId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface StoredStanding {
  id: string;
  leagueId: string;
  seasonId: string;
  sport: SportSlug;
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  difference: number;
  points: number;
  rank: number;
}

export interface Athlete {
  id: string;
  userId?: string;
  /**
   * The name the League registered. Rendered on every surface showing a verified statistic.
   *
   * Not `name`. ADR-001 splits the athlete into a league-authored sporting record and a
   * self-authored persona, and an unqualified `name` is exactly how those two leak into each
   * other when somebody reaches for the obvious field. The nickname lives on
   * `athletePersonas.displayName` and never appears beside a career record.
   */
  legalName: string;
  sport: SportSlug | SportType;
  /**
   * What the League registered them as. Eligibility, standings and fantasy read this and
   * only this. A preferred position is the athlete's to state and lives on their persona.
   */
  registeredPosition: string;
  /** @deprecated Pre-ADR-001 documents. Read through `athleteLegalName()`. */
  name?: string;
  /** @deprecated Pre-ADR-001 documents. Read through `athleteRegisteredPosition()`. */
  position?: string;
  teamId: string;
  leagueId: string;
  city: string;
  country: "Uganda";
  ageGroup: "U18" | "U21" | "Senior";
  bio: string;
  invitedEmail?: string;
  invitationToken?: string;
  invitationTokenHash?: string;
  invitationActionUrl?: string;
  invitationExpiresAt?: string;
  emailProvider?: "resend" | "demo";
  emailDelivery?: "sent" | "not_configured" | "failed";
  emailMessageId?: string;
  emailSentAt?: string;
  emailError?: string;
  avatarURL?: string;
  avatarUrl?: string;
  coverURL?: string;
  coverUrl?: string;
  verified: boolean;
  verificationStatus: VerificationStatus;
  totalSupport: number;
  totalEarnings?: number;
  supportersCount: number;
  goalPlacePoints: number;
  /** Legacy read projection. Official stats live in typed kernel statistic projections. */
  stats: Record<string, number>;
  impactNeeds: string[];
  createdAt: string;
}

/**
 * What an athlete says about themselves. Self-authored, and the only client-writable
 * collection on the platform.
 *
 * ADR-001 splits the athlete in two because one document with one owner cannot serve both
 * purposes. The League needs a registered name and a registered position that govern
 * eligibility, standings and fantasy; the athlete needs a public identity they control. The
 * previous model resolved that tension by giving the athlete nothing, which made an Athlete
 * account not worth opening twice a season.
 *
 * No field here influences a projection, a statistic or an eligibility decision. That is the
 * whole safety property: an athlete can write everything on this document and still cannot
 * author a single measurement of themselves.
 *
 * Note the field names. There is no bare `name` and no bare `position` here either, for the
 * same reason there is none on `Athlete`: the moment both documents have a `name`, the
 * question "which one does this surface render" stops having an obvious answer.
 */
export interface AthletePersona {
  /** Same id as the athlete it belongs to. One persona per athlete, atomically. */
  id: string;
  athleteId: string;
  /** The nickname. Leads the profile header; never appears beside a verified statistic. */
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
  /** What they would like to play. Eligibility and fantasy read registeredPosition instead. */
  preferredPosition?: string;
  secondaryPreferredPosition?: string;
  heightCm?: number;
  preferredFoot?: 'left' | 'right' | 'both';
  hometown?: string;
  socialLinks?: { label: string; url: string }[];
  contactPreference?: 'none' | 'league' | 'public';
  highlights?: { title: string; url: string; addedAt: string }[];
  /** The account that claimed this athlete. Written by the server on claim verification. */
  claimedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * An athlete's report that their verified record is wrong.
 *
 * The one route an athlete has toward the sporting record, and it is deliberately a request
 * rather than an edit. An athlete who believes they scored a goal that was not recorded opens
 * one of these; they do not get a field to type a goal into. A correction produces a new
 * official result version through the same pipeline as any other, with evidence and a
 * reviewer attached.
 */
export interface AthleteStatIssue {
  id: string;
  athleteId: string;
  matchId?: string;
  seasonId?: string;
  leagueId: string;
  raisedByUserId: string;
  category: 'missing_event' | 'wrong_attribution' | 'wrong_score' | 'not_me' | 'other';
  detail: string;
  status: 'open' | 'under_review' | 'accepted' | 'rejected' | 'superseded';
  reviewedByUserId?: string;
  reviewedAt?: string;
  resolutionNote?: string;
  /** The correction version this produced, when it produced one. */
  officialResultVersion?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A reusable contact record for somebody who captures matches. Not an account.
 *
 * ADR-002: a Field Manager is a principal but not an account. They hold no Firebase Auth
 * user, no access assignment and no accessIndex document, and this record exists so a league
 * that uses the same person every week does not retype their phone number every week.
 */
export interface FieldManager {
  id: string;
  leagueId: string;
  displayName: string;
  phone: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt?: string;
  status: 'active' | 'inactive';
}

/** One assignment, one match, one five-hour window. */
export interface FieldManagerAssignment {
  id: string;
  matchId: string;
  leagueId: string;
  seasonId: string;
  fieldManagerId: string;
  assignedByUserId: string;
  status: 'assigned' | 'accepted' | 'checked_in' | 'in_progress' | 'submitted' | 'cancelled';
  accessStartsAt: string;
  accessExpiresAt: string;
  /**
   * Clubs this observer has declared a relationship with. Recorded either way: an affiliated
   * Field Manager is not automatically disqualified, because in grassroots reality the only
   * person present with a working phone may be an assistant coach. What is not permitted is
   * hiding it, so the affiliation is carried into the report's provenance and lowers the
   * data-quality tier.
   */
  declaredAffiliations: string[];
  /** From the competition. When true, an affiliated observer cannot be assigned at all. */
  neutralityRequired: boolean;
  createdAt: string;
  updatedAt?: string;
}

/**
 * The bearer session a Field Manager holds during a match.
 *
 * Only hashes are stored. The plaintext link secret, the PIN and the session token exist in
 * exactly two places: the message the Field Manager received, and the memory of the request
 * that verified them. A database that can reconstruct any of the three is a database whose
 * compromise hands an attacker live capture access to every fixture it holds.
 */
export interface MatchAccessSession {
  id: string;
  matchId: string;
  assignmentId: string;
  bootstrapTokenHash: string;
  bootstrapConsumedAt?: string;
  sessionTokenHash?: string;
  pinHash: string;
  pinSalt: string;
  /** Failed PIN attempts. Counted per assignment, never per IP: a stadium shares one hotspot. */
  attempts: number;
  lockedUntil?: string;
  deviceFingerprintHash?: string;
  /** Incremented by a takeover. Events from an older generation are quarantined, not accepted. */
  sessionGeneration: number;
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string;
  revocationReason?: string;
}

/**
 * The match clock, as anchors rather than a running timer.
 *
 * A JavaScript timer dies when Safari is backgrounded, battery saver engages, or the phone
 * locks, and every one of those is ordinary on the hardware this runs on. The elapsed time is
 * therefore always computed from `periodStartedAt` and `accumulatedMs`, never read off a
 * ticking display, so reopening the page reconstructs the clock rather than resuming it.
 */
export interface MatchClockState {
  id: string;
  matchId: string;
  period: '1' | '2' | 'ET1' | 'ET2';
  state: 'not_started' | 'running' | 'paused' | 'period_break' | 'full_time';
  periodStartedAt?: string;
  pausedAt?: string;
  /** Time already banked in this period, in milliseconds. */
  accumulatedMs: number;
  sessionGeneration: number;
  /** Optimistic concurrency: a stale writer loses rather than overwrites. */
  version: number;
  adjustments: { deltaMs: number; reason: string; at: string }[];
  updatedAt: string;
}

/** What the Field Manager confirmed before kickoff. Immutable once written. */
export interface MatchLineupSnapshot {
  id: string;
  matchId: string;
  assignmentId: string;
  confirmedAt: string;
  teams: Record<string, {
    starting: string[];
    bench: string[];
    notPresent: string[];
  }>;
  packageVersion: string;
}

/** One observation from the touchline. Append-only. */
export interface LiveMatchEvent {
  eventId: string;
  matchId: string;
  leagueId: string;
  seasonId: string;
  sport: SportSlug;
  eventType: string;
  period: string;
  gameClockMs: number;
  teamId: string;
  athleteId: string | null;
  payload: Record<string, unknown>;
  source: 'field_manager' | 'league_emergency_takeover';
  assignmentId: string;
  sessionId: string;
  sessionGeneration: number;
  clientEventId: string;
  clientSequence: number;
  /** An observation, never authority. The clock comes from the anchor. */
  deviceTime: string;
  createdAtServer: string;
  supersedesEventId?: string;
  correctionReason?: string;
  status: 'active' | 'superseded' | 'quarantined';
}

/** The attested claim a Field Manager submits at full time. */
export interface MatchReport {
  /** The match id. One active report per match, atomically. */
  id: string;
  matchId: string;
  leagueId: string;
  assignmentId?: string;
  sessionId?: string;
  /**
   * V2 sources only. `legacy_team_submission` is deliberately not a value here: legacy
   * submissions stay in `resultSubmissions` and adapt into the finalization candidate
   * directly. Putting the legacy value in this enum invites a backfill that copies history
   * into a document shape that did not exist when the history was made.
   */
  source: 'field_capture' | 'league_post_match';
  /** Collected independently, before the reconstructed score is shown. The omission detector. */
  declaredHomeScore: number;
  declaredAwayScore: number;
  reconstructedHomeScore: number;
  reconstructedAwayScore: number;
  /**
   * The exact event set this report attested to.
   *
   * A Field Manager confirms a record at full time and the events beneath it can still change:
   * a quarantined session syncs minutes later, a correction lands. Without this binding,
   * finalization consumes whatever the collection happens to hold when it runs, and the official
   * result is built from events nobody attested to.
   *
   * The digest is over content rather than a total, because the loud failure is a score that
   * moved and the quiet one is a goal reattributed from one athlete to another: identical score,
   * different career record.
   */
  eventCount: number;
  eventDigest: string;
  eventStreamVersion: number;
  /**
   * Which attestation this is. A late event does not amend a report; it invalidates this
   * version and the Field Manager attests again, producing the next one.
   */
  reportVersion: number;
  attestedByMatchSessionId?: string;
  /** @deprecated Superseded by `eventDigest`, which is sensitive to content rather than ids. */
  payloadHash?: string;
  lineupSnapshotId?: string;
  clockAdjustments: { deltaMs: number; reason: string; at: string }[];
  attestedAt: string;
  attestationText: string;
  exceptions: string[];
  /**
   * `ready_for_finalization` is deliberately distinct from `auto_finalized`.
   *
   * It means every gate passed and nothing is waiting on a human. It does NOT mean an official
   * record exists, and conflating the two would put a lie in the data: a report marked
   * finalized with no official result version behind it is exactly the kind of second source
   * of truth this architecture exists to prevent.
   */
  /**
   * `requires_re_attestation` is what a late event produces.
   *
   * Not a silent amendment, and not a refusal to record the event. The observation is real and
   * is kept; what it invalidates is the claim that a particular set of events was the match. The
   * Field Manager, or the league, attests again over the new set.
   */
  status:
    | 'submitted'
    | 'ready_for_finalization'
    | 'requires_re_attestation'
    | 'auto_finalized'
    | 'league_review'
    | 'official'
    | 'superseded';
  resultVersion: number;
  finalizationKey?: string;
  createdAt: string;
  updatedAt: string;
}

export type MatchExceptionCode =
  | 'declared_score_mismatch'
  | 'event_sequence_gap'
  | 'unsynced_events_at_submit'
  | 'late_events_from_revoked_session'
  | 'athlete_not_registered'
  | 'athlete_ineligible'
  | 'match_abandoned'
  | 'policy_violation'
  | 'lineup_discrepancy_reported'
  | 'clock_anomaly'
  | 'post_window_correction'
  | 'takeover_occurred'
  | 'affiliated_observer'
  | 'result_never_reported';

/** The League's review queue. Distinct from reconciliationExceptions, which Platform owns. */
export interface MatchOperationalException {
  id: string;
  matchId: string;
  leagueId: string;
  reportId?: string;
  code: MatchExceptionCode;
  /** Blocking exceptions stop auto-finalization. Non-blocking ones lower confidence. */
  blocking: boolean;
  detail: Record<string, unknown>;
  status: 'open' | 'proposed' | 'resolved' | 'escalated' | 'superseded';
  conflictContext?: Record<string, unknown>;
  proposedByUserId?: string;
  proposedResolution?: string;
  proposedAt?: string;
  ratifiedByUserId?: string;
  ratifiedAt?: string;
  escalatedAt?: string;
  escalationDeadline?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Person {
  id: string;
  legalName?: string;
  preferredName?: string;
  email?: string;
  phone?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Organization {
  id: string;
  name: string;
  country: "Uganda";
  status: "draft" | "onboarding" | "active" | "paused" | "suspended" | "archived";
  createdAt: string;
  updatedAt?: string;
}

export interface RosterMembership {
  id: string;
  athleteId: string;
  teamId: string;
  leagueId: string;
  competitionId: string;
  seasonId: string;
  positionCode: string;
  shirtNumber?: string;
  registrationStatus:
    | "proposed"
    | "team_confirmed"
    | "league_verified"
    | "suspended"
    | "released";
  effectiveFrom: string;
  effectiveTo?: string;
  eligibilityRulePackVersion: string;
  verifiedByUserId?: string;
  verifiedAt?: string;
}

/**
 * A person's sporting relationship with a club. Grants nothing.
 *
 * The self-confirmation guard detected conflict by asking whether the actor held a
 * team-scoped assignment. That was sound while system authority over a team was a reliable
 * proxy for sporting affiliation with it. ADR-004 broke the proxy: a League Admin who also
 * coaches Kampala United holds no team-scoped authority at all, because team contacts are
 * person records now, and is still exactly the person who should not adjudicate a Kampala
 * United dispute alone.
 *
 * Read only by conflict policy, never by an authorization decision. That separation is
 * invariant 23 and is the reason this is its own collection rather than a field on the team:
 * `Team.adminUserIds` is membership metadata carrying zero authority, and it has already
 * caused one access-divergence incident by acquiring a second job.
 */
export type TeamRelationship =
  | 'coach'
  | 'manager'
  | 'officer'
  | 'official'
  | 'player'
  | 'owner'
  | 'family';

export interface TeamAffiliation {
  id: string;
  userId: string;
  teamId: string;
  leagueId: string;
  seasonId?: string;
  relationship: TeamRelationship;
  /** How this was learned: the person said so, or the league recorded it. */
  basis: 'declared' | 'league_recorded';
  declaredAt: string;
  declaredByUserId: string;
  recordedByUserId?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  status: 'active' | 'ended' | 'disputed';
  note?: string;
}

export interface AthleteClaim {
  id: string;
  athleteId: string;
  teamId: string;
  leagueId: string;
  requesterUserId: string;
  status: 'team_pending' | 'league_pending' | 'linked' | 'rejected';
  teamReviewedByUserId?: string;
  leagueReviewedByUserId?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AthleteSeasonStat {
  id: string;
  athleteId: string;
  seasonId: string;
  leagueId: string;
  teamId: string;
  stats: Record<string, number>;
  officialMatchIds: string[];
  verifiedAt: string;
}

export interface AthleteTeamHistory {
  id: string;
  athleteId: string;
  teamId: string;
  leagueId: string;
  seasonId: string;
  joinedAt: string;
  leftAt?: string;
  verified: boolean;
}

export interface AthleteVerificationRecord {
  id: string;
  athleteId: string;
  type: 'identity' | 'team_affiliation' | 'season_stats' | 'award';
  status: VerificationStatus;
  verifiedByUserId?: string;
  createdAt: string;
}

export interface Match {
  id: string;
  sport: SportSlug | SportType;
  leagueId: string;
  seasonId: string;
  homeTeamId: string;
  teamAId?: string;
  awayTeamId: string;
  teamBId?: string;
  venue: string;
  city: string;
  scheduledAt: string;
  date?: string;
  status: MatchStatus;
  score: {
    home: number | null;
    away: number | null;
  };
  verificationStatus: VerificationStatus;
  /**
   * Which submission version produced the live official result. Guards against a stale
   * finalization overwriting a newer correction: the idempotency ledger cannot catch that,
   * because v1 and v2 have different finalization keys.
   */
  officialResultVersion?: number;
  verifiedBy?: string;
  topPerformerId?: string;
  supportersCount: number;
  totalSupport: number;
  teamAScore?: number;
  teamBScore?: number;
  events: MatchEvent[];
  /**
   * The capture policy in force when this fixture was created, resolved as
   * max(leagueRequested, platformMinimum) and frozen here.
   *
   * Bound at creation rather than read at result time, exactly as rule-pack versions bind to
   * a match. Without that, tightening a competition's policy mid-season retroactively
   * invalidates matches that were legitimately captured under the old one. Absent on
   * fixtures created before the field existed, which resolve to the permissive default.
   */
  effectiveCapturePolicy?: CapturePolicy;
  capturePolicyBoundAt?: string;
  createdAt: string;
}

export interface MatchEvent {
  minute?: number;
  period?: string;
  type: string;
  athleteId?: string;
  teamId: string;
  description: string;
}

export * from './fantasy';

export interface Challenge {
  id: string;
  athleteId: string;
  matchId?: string;
  leagueId: string;
  seasonId: string;
  sport: SportSlug | SportType;
  type: string;
  target: number;
  description: string;
  targetDescription?: string;
  totalPledged: number;
  supportersCount: number;
  status: ChallengeStatus;
  fundingModel: ChallengeFundingModel;
  sponsorId?: string;
  sponsorGrantAmountMinor?: number;
  termsLockedAt?: string;
  evidenceRefs?: string[];
  outcomeNote?: string;
  teamApprovedByUserId?: string;
  leagueApprovedByUserId?: string;
  outcomeVerifiedByUserId?: string;
  verificationStatus: VerificationStatus;
  submittedBy?: string;
  evidenceStatus?: string;
  amountAffected?: number;
  actionHistory?: string[];
  createdAt: string;
}

export interface ChallengeApproval {
  id: string;
  challengeId: string;
  stage: "team_feasibility" | "league_rules" | "outcome" | "platform_review";
  decision: "approved" | "rejected" | "achieved" | "not_achieved" | "void";
  actorUserId: string;
  actorRole: "team_admin" | "league_admin" | "platform_admin";
  note?: string;
  createdAt: string;
}

export interface SupportPledge {
  id: string;
  fanId: string;
  athleteId?: string;
  teamId?: string;
  leagueId?: string;
  challengeId?: string;
  supportNeedId?: string;
  amount: number;
  currency: Currency;
  type: SupportType;
  status: SupportStatus;
  platformFee: number;
  netAmount: number;
  message?: string;
  createdAt: string;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  supportPledgeId?: string;
  type: "deposit" | "support" | "pledge" | "refund" | "payout" | "fee" | string;
  amount: number;
  currency: Currency;
  status: "pending" | "completed" | "failed" | string;
  description: string;
  label?: string;
  method?: string;
  date?: string;
  relatedId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface FeedPost {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole | "team" | "league";
  sport?: SportSlug | SportType;
  authorType?: "Athlete" | "Team" | "League" | "Sponsor" | "Fan" | "Admin";
  type: FeedPostType;
  caption: string;
  mediaURL?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  relatedAthleteId?: string;
  relatedTeamId?: string;
  relatedLeagueId?: string;
  relatedMatchId?: string;
  supportAmount?: number;
  likesCount: number;
  likes?: number;
  commentsCount: number;
  comments?: number;
  sharesCount: number;
  shares?: number;
  flagReason?: string;
  statsRow?: string[];
  verified?: boolean;
  status: "active" | "hidden" | "reported";
  timestamp?: string;
  createdAt: string;
}

export interface Sponsor {
  id: string;
  name: string;
  category: string;
  city: string;
  packageType:
    | "athlete_supporter"
    | "team_partner"
    | "league_builder"
    | "annual_awards_sponsor"
    | "women_youth_sport";
  amountCommitted: number;
  currency: Currency;
  supportedAthleteIds: string[];
  supportedTeamIds: string[];
  supportedLeagueIds: string[];
  impactSummary: string;
  active: boolean;
}

export interface SponsorReport {
  id: string;
  campaignId?: string;
  leagueId: string;
  seasonId: string;
  period: string;
  verifiedMatches: number;
  verifiedAthletes: number;
  teamAdminActivityRate: number;
  resultReportingCompliance: number;
  fanProfiles: number;
  supportTransactions: number;
  supportValueUGX: number;
  storiesGenerated: number;
  evidenceItems: number;
  status: "draft" | "generated" | "shared";
  generatedAt: string;
}

export interface SponsorCampaign {
  id: string;
  sponsorId: string;
  name: string;
  objective: string;
  budgetUGX: number;
  supportedLeagueIds: string[];
  supportedTeamIds: string[];
  supportedAthleteIds: string[];
  evidenceUrls: string[];
  status: 'draft' | 'active' | 'completed' | 'archived';
  startsAt: string;
  endsAt?: string;
  createdAt: string;
}

export interface LeagueNotice {
  id: string;
  leagueId: string;
  seasonId: string;
  type:
    | "fixture_update"
    | "postponement"
    | "result_announcement"
    | "disciplinary"
    | "registration"
    | "verification_reminder"
    | "sponsor_message"
    | "emergency";
  title: string;
  message: string;
  audience: "public" | "all_teams" | "team_admins" | "athletes";
  priority: "normal" | "important" | "urgent";
  publishedByUserId: string;
  createdAt: string;
}

export interface FinalizationRecord {
  id: string;
  matchId: string;
  submissionId: string;
  resultVersion: number;
  status: "applied" | "skipped" | "failed";
  appliedAt: string;
  source: FinalizationSource;
}

export interface AwardCategory {
  id: string;
  name: string;
  description: string;
  sport?: SportSlug;
  categoryType: "fan" | "athlete" | "team" | "league" | "sponsor";
  eligibilityRules: string[];
  currentLeaderIds: string[];
  sponsorId?: string;
}

export type Award = AwardCategory;

export interface Verification {
  id: string;
  type:
    | "athlete_profile"
    | "team_profile"
    | "league_status"
    | "match_result"
    | "challenge_result"
    | "payout_review";
  relatedId: string;
  status: VerificationStatus;
  submittedBy: string;
  reviewedBy?: string;
  relatedLabel?: string;
  evidenceStatus?: string;
  amountAffected?: number;
  actionHistory?: string[];
  notes: string;
  createdAt: string;
  reviewedAt?: string;
}

export type VerificationRecord = Verification;

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorName?: string;
  text: string;
  status: "published" | "hidden" | "flagged";
  createdAt?: string;
  updatedAt?: string;
}

export interface Notification {
  id: string;
  userId: string;
  type?:
    | "support_received"
    | "pledge_created"
    | "challenge_verified"
    | "match_result_verified"
    | "fixture_reminder"
    | "venue_changed"
    | "result_confirmation_required"
    | "result_disputed"
    | "league_notice"
    | "support_need_funded"
    | "athlete_followed"
    | "sponsor_campaign_update"
    | "awards_ranking_update"
    | "fantasy_lineup_deadline"
    | "fantasy_athlete_unavailable"
    | "fantasy_fixture_postponed"
    | "fantasy_player_active"
    | "fantasy_provisional_score"
    | "fantasy_match_pending_verification"
    | "fantasy_points_official"
    | "fantasy_score_corrected"
    | "fantasy_round_recap"
    | "fantasy_mini_league_invitation"
    | "fantasy_mini_league_rank_change";
  title: string;
  body: string;
  read: boolean;
  href?: string;
  createdAt?: string;
}

export interface AdminAuditEvent {
  id: string;
  actorUserId: string;
  action:
    | "approved"
    | "rejected"
    | "requested_information"
    | "resolved"
    | "dismissed"
    | "invited"
    | "accepted"
    | "created"
    | "updated"
    | "revoked"
    | "blocked"
    | "verified"
    | "activated"
    | "suspended"
    | "disabled";
  targetCollection: string;
  targetId: string;
  note?: string;
  createdAt: string;
}

export type AccessRoleKey =
  | "super_admin"
  | "platform_admin"
  | "platform_reviewer"
  | "platform_support"
  | "league_owner"
  | "league_admin"
  | "league_operator"
  | "league_verifier"
  | "team_owner"
  | "team_admin"
  | "roster_manager"
  | "result_reporter"
  | "content_manager"
  | "athlete_self"
  | "athlete_guardian";

export type AccessScopeType = "platform" | "organization" | "league" | "team" | "athlete";

export interface Invitation {
  id: string;
  type:
    | "platform_admin"
    | "league_owner"
    | "league_admin"
    | "team_owner"
    | "team_admin"
    | "athlete"
    | "guardian";
  invitedEmail?: string;
  invitedPhone?: string;
  roleKey: AccessRoleKey;
  scopeType: AccessScopeType;
  scopeId: string;
  permissionBundleId?: string;
  tokenHash?: string;
  tokenVersion: number;
  status:
    | "draft"
    | "queued"
    | "sent"
    | "delivered"
    | "viewed"
    | "accepted"
    | "declined"
    | "expired"
    | "revoked"
    | "superseded"
    | "failed_delivery";
  invitedByUserId: string;
  applicationId?: string;
  organizationId?: string;
  leagueId?: string;
  actionUrl?: string;
  expiresAt: string;
  viewedAt?: string;
  acceptedAt?: string;
  declinedAt?: string;
  revokedAt?: string;
  sentAt?: string;
  deliveredAt?: string;
  deliveryAttemptCount?: number;
  lastDeliveryAttemptId?: string;
  lastDeliveryStatus?: "sent" | "not_configured" | "failed" | "queued";
  deliveryError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvitationDeliveryAttempt {
  id: string;
  invitationId: string;
  channel: "email";
  destination: string;
  provider: "resend";
  status: "queued" | "sent" | "failed_delivery";
  providerStatus?: "sent" | "not_configured" | "failed";
  providerMessageId?: string;
  error?: string;
  attemptNumber: number;
  requestedByUserId: string;
  reason?: string;
  createdAt: string;
  completedAt?: string;
  updatedAt: string;
}

export interface AccessAssignmentRecord {
  id: string;
  userId: string;
  roleKey: AccessRoleKey;
  scopeType: AccessScopeType;
  scopeId: string;
  permissionBundleId: string;
  status: "pending" | "active" | "suspended" | "expired" | "revoked";
  grantedByUserId: string;
  invitationId?: string;
  applicationId?: string;
  validFrom: string;
  validUntil?: string;
  suspendedAt?: string;
  revokedAt?: string;
  revocationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccessIndexRecord {
  userId: string;
  scopeType: AccessScopeType;
  scopeId: string;
  activeRoles: AccessRoleKey[];
  capabilities: string[];
  assignmentIds: string[];
  accessVersion: number;
  updatedAt: string;
}

export interface LeagueAdminApplication {
  id: string;
  userId: string;
  applicantName?: string;
  applicantEmail?: string;
  applicantPhone?: string;
  leagueName: string;
  sport: SportSlug;
  country?: string;
  region?: string;
  city: string;
  estimatedTeams?: number;
  estimatedAthletes?: number;
  competitionFormat?: string;
  currentOperations?: string;
  evidenceNote: string;
  status:
    | "draft"
    | "email_verification_pending"
    | "pending"
    | "submitted"
    | "under_review"
    | "needs_information"
    | "resubmitted"
    | "risk_review"
    | "waitlisted"
    | "approved"
    | "rejected"
    | "withdrawn"
    | "expired"
    | "converted_to_onboarding";
  leagueId?: string;
  organizationId?: string;
  invitationId?: string;
  invitationActionUrl?: string;
  riskFlags?: string[];
  riskLevel?: "low" | "medium" | "high";
  duplicateCandidates?: Array<{
    id: string;
    kind: "league" | "application";
    title: string;
    city?: string;
    status?: string;
    score: number;
    reason: string;
  }>;
  requestedInformation?: {
    fields: string[];
    message: string;
    requestedByUserId: string;
    requestedAt: string;
  };
  informationDeliveryStatus?: "queued" | "sent" | "failed_delivery";
  informationDeliveryError?: string;
  invitationDeliveryStatus?: "queued" | "sent" | "failed_delivery";
  reviewedByUserId?: string;
  applicantMessage?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SupportNeed {
  id: string;
  athleteId?: string;
  teamId?: string;
  leagueId: string;
  title: string;
  story: string;
  targetAmount: number;
  raisedAmount: number;
  status: "open" | "funded" | "completed" | "cancelled";
  approvalStatus: "proposed" | "team_verified" | "league_approved" | "rejected";
  verificationStatus: VerificationStatus;
  preferredPayoutDestination:
    | "approved_vendor"
    | "verified_team"
    | "verified_academy"
    | "adult_athlete"
    | "verified_guardian"
    | "evidence_reimbursement";
  payoutDestinationStatus: "pending_verification" | "verified" | "suspended";
  recipientIsMinor?: boolean;
  guardianConsentVerified?: boolean;
  teamVerifiedByUserId?: string;
  leagueApprovedByUserId?: string;
  recipientUpdates: Array<{
    id: string;
    message: string;
    evidenceUrl?: string;
    createdAt: string;
  }>;
  createdByUserId: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SupportNeedApproval {
  id: string;
  supportNeedId: string;
  athleteId?: string;
  teamId?: string;
  leagueId: string;
  stage: "team_verification" | "league_publication";
  decision: "approved" | "rejected";
  actorUserId: string;
  note?: string;
  createdAt: string;
}

export interface Report {
  id: string;
  reporterId: string;
  type:
    | "reported_feed_post"
    | "disputed_match_result"
    | "athlete_verification_issue"
    | "payout_review_issue"
    | "support_issue"
    | "profile_issue"
    | "result_issue"
    | "content_issue"
    | "verification_issue";
  status: "open" | "reviewing" | "resolved" | "dismissed";
  summary: string;
  reporterName?: string;
  reportedEntity?: string;
  affectedEntity?: string;
  severity?: "Low" | "Medium" | "High" | "Critical";
  assignedReviewer?: string;
  lastUpdate?: string;
  reasonFlagged?: string;
  actionHistory?: string[];
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
