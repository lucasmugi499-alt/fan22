import type { SportSlug } from '@/types';
import type { Principal } from './principal';

export type KernelRecordStatus =
  | 'draft'
  | 'validated'
  | 'reviewed'
  | 'approved'
  | 'scheduled'
  | 'active'
  | 'retired';

export type DataCollectionLevel = 'result' | 'basic' | 'standard' | 'advanced';

export type RuleBindingVersion = {
  sportDefinitionVersion: string;
  competitionRulePackVersion: string;
  collectionProfileVersion: string;
  statisticDefinitionVersion: string;
  fantasyScoringProfileVersion?: string;
  displayProfileVersion: string;
};

export type VersionedKernelRecord = {
  id: string;
  version: string;
  schemaVersion: string;
  status: KernelRecordStatus;
  sportId: SportSlug;
  effectiveFrom?: string;
  contentHash: string;
  createdByUserId: string;
  approvedByUserIds: string[];
  createdAt: string;
  approvedAt?: string;
  supersedesVersion?: string;
  changeSummary: string;
};

export type ScoreContribution = {
  eventType: string;
  /** Fixed points for this event. Ignored when `variableValue` is set. */
  points: number;
  description: string;
  /**
   * The event carries its own point value in `payload.value` rather than scoring a fixed
   * amount.
   *
   * Basketball needs this. A submission reports that an athlete scored N points without
   * saying how — the breakdown into free throws, two-pointers and three-pointers is simply
   * not collected at grassroots level. Before this existed, the finalizer expanded one
   * N-point event into N synthetic `basketball.free_throw_made` events so that fixed weights
   * would sum correctly. The arithmetic came out right and the sporting history was false: a
   * three-pointer was recorded as three made free throws.
   *
   * A canonical event record has to describe what actually happened. "Scored 3 points,
   * breakdown not collected" is true; "made three free throws" is not.
   */
  variableValue?: boolean;
};

export type SportDefinition = VersionedKernelRecord & {
  name: string;
  variants: string[];
  legalScoringEvents: ScoreContribution[];
};

export type EventTypeDefinition = {
  code: string;
  sportId: SportSlug;
  minimumCollectionLevel: DataCollectionLevel;
  payloadSchemaVersion: string;
  scoring?: {
    points: number;
    attribution: 'team' | 'opponent' | 'primary_athlete';
  };
};

export type DataCollectionProfile = VersionedKernelRecord & {
  level: DataCollectionLevel;
  requiredEventTypes: string[];
  optionalEventTypes: string[];
  unsupportedEventTypes: string[];
  requiredMatchFields: string[];
  requiredRosterFields: string[];
  requiredAthleteStats: string[];
  minimumCoverage: {
    rosterCoveragePercent: number;
    eventCoveragePercent: number;
    reportingCompliancePercent: number;
  };
  fantasyEligibleStatisticCodes: string[];
};

export type TieBreakerRule = {
  code:
    | 'competition_points'
    | 'head_to_head_points'
    | 'score_difference'
    | 'score_for'
    | 'wins'
    | 'disciplinary_score'
    | 'drawing_of_lots';
  direction: 'asc' | 'desc' | 'manual';
};

export type StandingBonusRule = {
  code: string;
  statistic: string;
  operator: 'gte' | 'lte' | 'equals' | 'between';
  threshold: number;
  upperThreshold?: number;
  award: number;
};

export type CompetitionRulePack = VersionedKernelRecord & {
  resultPoints: {
    win: number;
    draw?: number;
    loss: number;
    noContest?: number;
    forfeitWin?: number;
    forfeitLoss?: number;
  };
  bonusRules: StandingBonusRule[];
  deductions?: {
    code: string;
    points: number;
    authorityRequired: string;
  }[];
  tieBreakers: TieBreakerRule[];
};

export type StatisticDefinition = VersionedKernelRecord & {
  code: string;
  entityType: 'athlete' | 'team';
  valueType: 'integer' | 'decimal' | 'duration' | 'percentage';
  sourceEventTypes: string[];
  aggregation: 'count' | 'sum_payload' | 'sum_qualifier' | 'derived_ratio' | 'conditional_count';
  minimumCollectionLevel: DataCollectionLevel;
};

export type FantasyScoringRule = {
  id: string;
  statisticCode: string;
  operator: 'per_unit' | 'equals' | 'gte' | 'lte' | 'between' | 'first_occurrence' | 'threshold_band';
  points: number;
  unit?: number;
  threshold?: number;
  upperThreshold?: number;
  positionCodes?: string[];
  requiresAppearance?: boolean;
  maximumAward?: number;
};

export type FantasyScoringProfile = VersionedKernelRecord & {
  name: string;
  minimumDataCollectionLevel: Exclude<DataCollectionLevel, 'result'>;
  rules: FantasyScoringRule[];
  captainMultiplier: number;
  viceCaptainFallback: boolean;
  roundingMode: 'none' | 'floor' | 'round' | 'ceil';
  effectiveFromRoundId?: string;
};

export type EngagementPointProfile = VersionedKernelRecord & {
  dailyCap: number;
  weeklyCap: number;
  actions: {
    actionCode: string;
    award: number;
    eligibilityPolicy: string;
    repeatPolicy: string;
    maximumPerPeriod?: number;
  }[];
};

export type MatchEventClaimStatus =
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'corrected'
  | 'superseded'
  | 'held_for_review';

export type MatchEventClaim<TPayload = unknown> = {
  id: string;
  eventType: string;
  sportId: SportSlug;
  competitionId: string;
  seasonId: string;
  roundId?: string;
  matchId: string;
  sequence: number;
  teamId?: string;
  primaryAthleteId?: string;
  relatedAthleteIds?: string[];
  payload: TPayload;
  submittedByUserId: string;
  submittedByTeamId?: string;
  evidenceRefs?: string[];
  status: MatchEventClaimStatus;
  createdAt: string;
};

export type OfficialSportEvent<TPayload = unknown> = {
  id: string;
  eventType: string;
  eventSchemaVersion: string;
  sportDefinitionVersion: string;
  sportId: SportSlug;
  competitionId: string;
  seasonId: string;
  roundId?: string;
  matchId: string;
  sequence: number;
  occurredAt?: string;
  periodCode?: string;
  gameClock?: {
    minute?: number;
    second?: number;
    remaining?: boolean;
  };
  teamId?: string;
  primaryAthleteId?: string;
  relatedAthleteIds?: string[];
  payload: TPayload;
  qualifiers?: Record<string, string | number | boolean>;
  sourceClaimId: string;
  /**
   * Optional since schema 2.0.0. A field-capture event is produced by a match ops session
   * that has no Firebase user, so the uid stopped being the universal way an event names
   * its author. Still written for events a user produced.
   *
   * This type models any STORED event, at either schema version, which is why both this and
   * `sourcePrincipal` are optional here. Emission is where the requirement is enforced:
   * `validateOfficialEventShape()` refuses an event that carries neither, and the finalizer's
   * own record type requires `sourcePrincipal` so a missed event builder fails to compile.
   */
  submittedByUserId?: string;
  /** Who acted. Required at schema 2.0.0. Absent on 1.0.0 events, which are never rewritten. */
  sourcePrincipal?: Principal;
  submittedByTeamId?: string;
  evidenceRefs?: string[];
  officialResultVersion: number;
  officialEventVersion: number;
  verificationStatus: 'official';
  idempotencyKey: string;
  supersedesEventId?: string;
  supersededByEventId?: string;
  createdAt: string;
  finalizedAt: string;
};

export type ScoreReconciliationStatus =
  | 'valid'
  | 'valid_with_warning'
  | 'incomplete'
  | 'inconsistent'
  | 'blocked'
  | 'held_for_review';

export type ScoreTrace = {
  formulaVersion: string;
  home: number;
  away: number;
  status: ScoreReconciliationStatus;
  components: {
    eventId: string;
    eventType: string;
    teamId?: string;
    points: number;
    appliedTo: 'home' | 'away' | 'ignored';
  }[];
  issues: string[];
};

export type ProjectionMetadata = {
  projectionVersion: string;
  rulePackVersion: string;
  sourceVersionHash: string;
  rebuiltAt: string;
};

export type StandingProjection = {
  teamId: string;
  competitionId: string;
  seasonId: string;
  stageId?: string;
  values: Record<string, number>;
  rank: number;
  tieBreakTrace: string[];
  sourceMatchVersions: {
    matchId: string;
    officialResultVersion: number;
  }[];
} & ProjectionMetadata;

export type AthleteMatchStatisticProjection = {
  athleteId: string;
  matchId: string;
  competitionId: string;
  seasonId: string;
  values: Record<string, number>;
  sourceEventIds: string[];
} & ProjectionMetadata;

export type FantasyPointEvent = {
  id: string;
  fantasyCompetitionId: string;
  scoringProfileVersion: string;
  roundId: string;
  matchId: string;
  officialResultVersion: number;
  officialEventVersion: number;
  athleteId: string;
  statisticCode: string;
  scoringRuleId: string;
  quantity: number;
  basePoints: number;
  status: 'provisional' | 'official' | 'superseded' | 'void';
  idempotencyKey: string;
  supersedesPointEventId?: string;
  createdAt: string;
};

export type MatchDataCoverage = {
  resultCoverage: 'complete' | 'incomplete';
  rosterCoverage: 'none' | 'partial' | 'complete';
  eventCoverage: 'none' | 'partial' | 'score_reconcilable' | 'complete';
  statisticCoverageLevel: DataCollectionLevel;
  fantasyEligible: boolean;
  qualityScore: number;
  qualityIssues: string[];
};

export type ProjectionRebuildJob = {
  id: string;
  projectionType: 'standings' | 'athlete_statistics' | 'fantasy_round' | 'sponsor_report';
  scope: {
    competitionId: string;
    seasonId: string;
    roundId?: string;
    matchId?: string;
  };
  sourceVersionHash: string;
  ruleVersion: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  processedCount: number;
  errorCount: number;
  checkpoint?: string;
  startedAt?: string;
  completedAt?: string;
};
