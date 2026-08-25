import { Firestore, Transaction } from 'firebase-admin/firestore';
import { planFinalization } from '../lib/resultSubmission';
// Relative, not aliased: the Cloud Functions build compiles this file without the
// application's path aliases.
import { SPORT_DEFINITIONS } from '../kernel/definitions/sportCatalogues';
import { reconstructMatchScore } from '../kernel/formulas/score';
import { resolveAthleteParticipation } from '../kernel/projections/participation';
import type { OfficialSportEvent } from '../kernel/types';
// Relative, like every other import in this file: it compiles into the Cloud Functions
// bundle, where a path alias survives into the emitted CommonJS and fails at require time.
import { userPrincipal, provenanceQuad, type Principal } from '../kernel/principal';
import { athleteRegisteredPosition } from '../lib/athleteIdentity';
import { validateOfficialEventShape } from '../kernel/validators/officialEventGuard';
import { Athlete, AthleteStatLine, Match, ResultSubmission } from '../types';
// Relative, not `@/`. This module compiles into the Cloud Functions bundle, where a path
// alias survives into the emitted CommonJS and fails at require time — tsc resolves the
// alias, it does not rewrite it. Every other import here is relative for the same reason.
import {
  MAX_FINALIZATION_WRITES,
  finalizationWriteBudgetExceeded,
  projectedFinalizationWrites,
  submissionLimitBreaches,
  type SubmissionShape,
} from '../lib/sport/submissionLimits';
import { decideFinalization, type FinalizerActivation } from './finalizerActivation';

/**
 * Bound to the kernel rather than hardcoded, so a definition change is traceable.
 *
 * 2.0.0 since the actor became a union: `sourcePrincipal` replaces `submittedByUserId` as
 * the required record of who acted, because a field-capture event has no Firebase user.
 * Events already stored at 1.0.0 keep their shape and are never rewritten; readers handle
 * both via `principalFromEvent()`.
 */
const EVENT_SCHEMA_VERSION = '2.0.0';

const SUBMISSIONS = 'resultSubmissions';
const MATCHES = 'matches';
const FINALIZATIONS = 'finalizations';
const OFFICIAL_SPORT_EVENTS = 'officialSportEvents';
const RECONCILIATION_EXCEPTIONS = 'reconciliationExceptions';
const OUTBOX = 'outbox';

/** The one event type this module emits. Consumers subscribe to it; it knows none of them. */
export const RECONCILIATION_EXCEPTION_CREATED = 'result.reconciliation_exception.created';

/**
 * Deterministic, so a redelivered trigger cannot emit the event twice. Derived from the
 * exception id, which is itself deterministic.
 */
export function reconciliationOutboxId(exceptionId: string) {
  return `result_reconciliation_exception_created_${exceptionId}`;
}

/**
 * Deterministic, so a redelivered trigger finds the existing case instead of opening a
 * second one. Keyed on the submission version because a corrected resubmission is a new
 * case, not an update to the old one.
 */
export function reconciliationExceptionId(matchId: string, submissionVersion: number) {
  return `reconciliation_${matchId}_${submissionVersion}`;
}

/** Set on the submission so a later write to it cannot re-enter finalization. */
export const BLOCKED_RECONCILIATION = 'blocked_reconciliation';
/** Distinct from a surplus block: the input is unsafe to expand, not contradictory. */
export const BLOCKED_OVERSIZED = 'blocked_oversized_submission';

/**
 * What an event builder needs to know about where a result came from.
 *
 * Structural rather than `ResultSubmission`, so the same builders serve a legacy bilateral
 * submission and a field capture report without either knowing the other exists. This is the
 * extraction the finalization candidate is for: the compatibility boundary sits here, at the
 * input, rather than inside the emission logic or in storage.
 *
 * `ResultSubmission` already satisfies this shape apart from `sourcePrincipal`, which the
 * legacy call site supplies from its submitting user.
 */
type OfficialEventSource = {
  /** The record this result was built from. Becomes `sourceClaimId` on every event. */
  id: string;
  sourcePrincipal: Principal;
  /** Still written for a result a user produced. Absent for field capture. */
  submittedByUserId?: string;
  /** Legacy only: a field report is not submitted by a team. */
  submittedByTeamId?: string;
  evidenceRefs?: string[];
  scorers?: ResultSubmission['scorers'];
  athleteStatLines?: ResultSubmission['athleteStatLines'];
  activeSquads?: ResultSubmission['activeSquads'];
};

type OfficialSportEventRecord = {
  id: string;
  eventType: string;
  eventSchemaVersion: string;
  sportDefinitionVersion: string;
  sportId: 'football' | 'basketball' | 'rugby';
  competitionId: string;
  seasonId: string;
  matchId: string;
  sequence: number;
  gameClock?: {
    minute?: number;
    remaining?: boolean;
  };
  teamId: string;
  /**
   * The athlete this event is about, or null when it is a team-only event.
   *
   * Null rather than `''`. An empty string is not "no athlete" — it is an athlete id that
   * happens to be empty, and it behaves like one everywhere downstream: it groups, it
   * indexes, it joins, and it quietly forms a bucket in career-stat rebuilds and search
   * projections that belongs to nobody. Team-only events (an unattributed score adjustment)
   * are a real category and are modelled as one.
   */
  primaryAthleteId: string | null;
  payload: Record<string, unknown>;
  sourceClaimId: string;
  /**
   * Required at emission, unlike on the stored-event type in the kernel, which has to model
   * both schema versions. Requiring it here is the compile-time gate: a new event builder
   * that forgets to name its author does not typecheck, rather than failing the shape guard
   * at run time on a real match.
   */
  sourcePrincipal: Principal;
  /** Still written for events a user produced. No longer the only way an event names one. */
  submittedByUserId?: string;
  /**
   * Legacy only. A field capture event has no submitting team: one observer watched the
   * match, and attributing it to a club would invent exactly the bias the model removes.
   */
  submittedByTeamId?: string;
  evidenceRefs: string[];
  officialResultVersion: number;
  officialEventVersion: number;
  verificationStatus: 'official';
  idempotencyKey: string;
  createdAt: string;
  finalizedAt: string;
};

/**
 * The sport definition's own version.
 *
 * `sportDefinitionVersion` answers "which sport definition produced this event".
 * `eventSchemaVersion` answers "what shape is this document". They are different questions
 * that happened to have the same answer while both were '1.0.0', which is how one site came
 * to use the event schema constant as a fallback for the other. They diverged at A0, so the
 * coincidence is now a defect: a missing definition would have stamped an event as having
 * been produced by sport definition 2.0.0, which does not exist.
 *
 * Throws rather than guessing. Every sport reaching this point is one of the three in the
 * catalogue, so a miss means the kernel is misconfigured, and inventing a version number for
 * an official record is worse than refusing to write one.
 */
function sportDefinitionVersionFor(sport: 'football' | 'basketball' | 'rugby') {
  const definition = SPORT_DEFINITIONS.find((entry) => entry.sportId === sport);
  if (!definition) {
    throw new Error(`No sport definition for ${sport}; refusing to stamp an official event.`);
  }
  return definition.version;
}

function officialPositionGroup(
  sport: 'football' | 'basketball' | 'rugby',
  position: string,
) {
  if (sport === 'football') {
    if (position === 'Goalkeeper') return 'goalkeeper';
    if (['Right Back', 'Centre Back', 'Left Back', 'Utility Defender'].includes(position)) return 'defender';
    if (['Striker', 'Forward'].includes(position)) return 'forward';
    return 'midfielder';
  }
  if (sport === 'basketball') {
    if (['Point Guard', 'Shooting Guard', 'Guard'].includes(position)) return 'guard';
    if (['Power Forward', 'Center'].includes(position)) return 'big';
    return 'wing';
  }
  if (['Loosehead Prop', 'Hooker', 'Tighthead Prop', 'Prop'].includes(position)) return 'front_row';
  if (position === 'Lock') return 'second_row';
  if (['Blindside Flanker', 'Openside Flanker', 'Number 8', 'Back Row', 'Utility Forward'].includes(position)) return 'back_row';
  if (['Scrum-half', 'Fly-half'].includes(position)) return 'half_back';
  return 'back';
}

function scorerEventType(sport: 'football' | 'basketball' | 'rugby') {
  if (sport === 'football') return 'football.goal';
  if (sport === 'rugby') return 'rugby.try';
  return 'basketball.points';
}

function activeSquadEventType(sport: 'football' | 'basketball' | 'rugby') {
  return `${sport}.active_squad`;
}

const SPORT_STAT_EVENT_TYPES: Record<'football' | 'basketball' | 'rugby', Record<string, string>> = {
  football: {
    minutes_played: 'football.minutes_played',
    assist: 'football.assist',
    yellow_card: 'football.yellow_card',
    red_card: 'football.red_card',
    own_goal: 'football.own_goal',
  },
  basketball: {
    minutes_played: 'basketball.minutes_played',
    rebound: 'basketball.rebound',
    assist: 'basketball.assist',
    steal: 'basketball.steal',
    block: 'basketball.block',
    turnover: 'basketball.turnover',
    technical_foul: 'basketball.technical_fouls',
    ejection: 'basketball.ejection',
  },
  rugby: {
    minutes_played: 'rugby.minutes_played',
    conversion: 'rugby.conversion_made',
    penalty_goal: 'rugby.penalty_goal_made',
    drop_goal: 'rugby.drop_goal_made',
    assist: 'rugby.assist',
    yellow_card: 'rugby.yellow_card',
    red_card: 'rugby.red_card',
  },
};

const STANDARD_STAT_KEYS = new Set([
  'minutes_played',
  'assist',
  'rebound',
  'conversion',
  'penalty_goal',
  'drop_goal',
  'yellow_card',
  'red_card',
  'own_goal',
  'technical_foul',
  'ejection',
]);

const ADVANCED_STAT_KEYS = new Set(['steal', 'block', 'turnover']);

/**
 * Squad entries keyed by athlete, plus the athletes claimed by both teams.
 *
 * The previous implementation kept the last write for a duplicated athlete, so someone
 * submitted under both sides silently became a member of whichever team appeared later.
 * A conflicting attribution is a data-quality fact and is surfaced rather than resolved
 * by ordering.
 */
function sanitizedActiveSquads(submission: Pick<OfficialEventSource, 'activeSquads'>, match: Match) {
  const validTeams = new Set([match.homeTeamId, match.awayTeamId]);
  const result = new Map<string, { athleteId: string; teamId: string }>();
  const conflicting = new Set<string>();
  for (const [teamId, athleteIds] of Object.entries(submission.activeSquads ?? {})) {
    if (!validTeams.has(teamId) || !Array.isArray(athleteIds)) continue;
    for (const athleteId of athleteIds) {
      if (typeof athleteId !== 'string' || !athleteId.trim()) continue;
      const existing = result.get(athleteId);
      if (existing && existing.teamId !== teamId) {
        conflicting.add(athleteId);
        continue;
      }
      result.set(athleteId, { athleteId, teamId });
    }
  }
  for (const athleteId of conflicting) result.delete(athleteId);
  return Object.assign(result, { conflictingAthleteIds: conflicting });
}

export type AthleteEligibilityIssue = {
  athleteId: string;
  claimedTeamId: string | null;
  registeredTeamId: string | null;
  reason:
    | 'athlete_not_found'
    | 'conflicting_team_attribution'
    | 'team_not_in_match'
    | 'not_registered_to_claimed_team';
};

/**
 * Decides whether a claimed athlete may receive official records for this match.
 *
 * The finalizer validated that a submitted team belonged to the fixture, but never that
 * the athlete belonged to that team — so a result could credit goals to someone from an
 * unrelated club. It also defaulted an unattributable athlete to the home team, which
 * silently invented an affiliation.
 *
 * Ineligible athletes are excluded from official records and reported, never guessed at.
 */
function assessAthleteEligibility({
  athleteId,
  claimedTeamId,
  registeredTeamId,
  match,
  conflicting,
}: {
  athleteId: string;
  claimedTeamId: string | null;
  registeredTeamId: string | null;
  match: Match;
  conflicting: boolean;
}): AthleteEligibilityIssue | null {
  if (conflicting) {
    return { athleteId, claimedTeamId, registeredTeamId, reason: 'conflicting_team_attribution' };
  }
  if (!claimedTeamId) {
    return { athleteId, claimedTeamId, registeredTeamId, reason: 'team_not_in_match' };
  }
  if (claimedTeamId !== match.homeTeamId && claimedTeamId !== match.awayTeamId) {
    return { athleteId, claimedTeamId, registeredTeamId, reason: 'team_not_in_match' };
  }
  // A blank registration is tolerated: many grassroots athletes are created mid-season
  // and the roster link follows. A registration to a DIFFERENT club is not.
  if (registeredTeamId && registeredTeamId !== claimedTeamId) {
    return { athleteId, claimedTeamId, registeredTeamId, reason: 'not_registered_to_claimed_team' };
  }
  return null;
}

function sanitizedStatLines(
  submission: ResultSubmission,
  match: Match,
  sport: 'football' | 'basketball' | 'rugby',
) {
  const validTeams = new Set([match.homeTeamId, match.awayTeamId]);
  const supportedStats = SPORT_STAT_EVENT_TYPES[sport];
  const result = new Map<string, AthleteStatLine>();

  for (const line of submission.athleteStatLines ?? []) {
    if (
      !line
      || typeof line.athleteId !== 'string'
      || !line.athleteId.trim()
      || typeof line.teamId !== 'string'
      || !validTeams.has(line.teamId)
    ) {
      continue;
    }

    const stats: Record<string, number> = {};
    if (typeof line.minutesPlayed === 'number' && Number.isFinite(line.minutesPlayed)) {
      const minutes = Math.max(0, Math.trunc(line.minutesPlayed));
      if (minutes > 0) stats.minutes_played = minutes;
    }
    for (const [statKey, value] of Object.entries(line.stats ?? {})) {
      if (!supportedStats[statKey] || typeof value !== 'number' || !Number.isFinite(value)) continue;
      const normalized = Math.max(0, Math.trunc(value));
      if (normalized > 0) stats[statKey] = normalized;
    }
    if (!Object.keys(stats).length && !line.playerOfMatch) continue;

    const existing = result.get(line.athleteId);
    result.set(line.athleteId, {
      athleteId: line.athleteId,
      teamId: existing?.teamId ?? line.teamId,
      minutesPlayed: Math.max(existing?.minutesPlayed ?? 0, stats.minutes_played ?? 0),
      stats: {
        ...(existing?.stats ?? {}),
        ...Object.fromEntries(
          Object.entries(stats).map(([key, value]) => [
            key,
            value + (existing?.stats[key] ?? 0),
          ]),
        ),
      },
      playerOfMatch: Boolean(existing?.playerOfMatch || line.playerOfMatch),
    });
  }

  return result;
}

function officialStatLineEvents({
  match,
  submission,
  sport,
  statLines,
  finalizedAt,
  resultVersion,
  startSequence = 1,
}: {
  match: Match;
  submission: OfficialEventSource;
  sport: 'football' | 'basketball' | 'rugby';
  statLines: Map<string, AthleteStatLine>;
  finalizedAt: string;
  resultVersion: number;
  startSequence?: number;
}) {
  const events: OfficialSportEventRecord[] = [];
  let sequence = startSequence;
  const eventTypes = SPORT_STAT_EVENT_TYPES[sport];

  for (const line of statLines.values()) {
    const statEntries = Object.entries(line.stats)
      .filter(([statKey, value]) => eventTypes[statKey] && value > 0);
    for (const [statKey, value] of statEntries) {
      const eventCount = statKey === 'minutes_played' ? 1 : value;
      for (let index = 0; index < eventCount; index += 1) {
        const eventId = `${match.id}_v${resultVersion}_event_${String(sequence).padStart(4, '0')}`;
        events.push({
          id: eventId,
          eventType: eventTypes[statKey],
          eventSchemaVersion: EVENT_SCHEMA_VERSION,
          sportDefinitionVersion: sportDefinitionVersionFor(sport),
          sportId: sport,
          competitionId: match.leagueId,
          seasonId: match.seasonId,
          matchId: match.id,
          sequence,
          teamId: line.teamId,
          primaryAthleteId: line.athleteId,
          payload: {
            value: statKey === 'minutes_played' ? value : 1,
            statKey,
            source: 'result_submission_stat_line',
          },
          sourceClaimId: submission.id,
          // The claim's author is the event's author. The caller (trigger, sweeper, route)
          // is who ran the finalization, which is a different question and is recorded on
          // the ledger entry as provenance rather than on each event.
          sourcePrincipal: submission.sourcePrincipal,
          submittedByUserId: submission.submittedByUserId,
          submittedByTeamId: submission.submittedByTeamId,
          evidenceRefs: submission.evidenceRefs ?? [],
          officialResultVersion: resultVersion,
          officialEventVersion: 1,
          verificationStatus: 'official',
          idempotencyKey: `${submission.id}:v${resultVersion}:stat:${line.teamId}:${line.athleteId}:${statKey}:${index + 1}`,
          createdAt: finalizedAt,
          finalizedAt,
        });
        sequence += 1;
      }
    }
    if (line.playerOfMatch) {
      const eventId = `${match.id}_v${resultVersion}_event_${String(sequence).padStart(4, '0')}`;
      events.push({
        id: eventId,
        eventType: `${sport}.player_of_match`,
        eventSchemaVersion: EVENT_SCHEMA_VERSION,
        sportDefinitionVersion: sportDefinitionVersionFor(sport),
        sportId: sport,
        competitionId: match.leagueId,
        seasonId: match.seasonId,
        matchId: match.id,
        sequence,
        teamId: line.teamId,
        primaryAthleteId: line.athleteId,
        payload: {
          value: 1,
          statKey: 'player_of_match',
          source: 'result_submission_stat_line',
        },
        sourceClaimId: submission.id,
        // The claim's author is the event's author. The caller (trigger, sweeper, route)
        // is who ran the finalization, which is a different question and is recorded on
        // the ledger entry as provenance rather than on each event.
        sourcePrincipal: submission.sourcePrincipal,
        submittedByUserId: submission.submittedByUserId,
        submittedByTeamId: submission.submittedByTeamId,
        evidenceRefs: submission.evidenceRefs ?? [],
        officialResultVersion: resultVersion,
        officialEventVersion: 1,
        verificationStatus: 'official',
        idempotencyKey: `${submission.id}:v${resultVersion}:stat:${line.teamId}:${line.athleteId}:player_of_match`,
        createdAt: finalizedAt,
        finalizedAt,
      });
      sequence += 1;
    }
  }

  return events;
}

function statLineDataLevel(statLine?: AthleteStatLine) {
  if (!statLine) return 'basic';
  const keys = Object.keys(statLine.stats);
  if (keys.some((key) => ADVANCED_STAT_KEYS.has(key))) return 'advanced';
  if (keys.some((key) => STANDARD_STAT_KEYS.has(key)) || statLine.playerOfMatch) return 'standard';
  return 'basic';
}

function officialActiveSquadEvents({
  match,
  submission,
  sport,
  finalizedAt,
  resultVersion,
}: {
  match: Match;
  submission: OfficialEventSource;
  sport: 'football' | 'basketball' | 'rugby';
  finalizedAt: string;
  resultVersion: number;
}) {
  const events: OfficialSportEventRecord[] = [];
  let sequence = 1;
  const eventType = activeSquadEventType(sport);

  for (const entry of sanitizedActiveSquads(submission, match).values()) {
    const eventId = `${match.id}_v${resultVersion}_event_${String(sequence).padStart(4, '0')}`;
    events.push({
      id: eventId,
      eventType,
      eventSchemaVersion: EVENT_SCHEMA_VERSION,
      sportDefinitionVersion: sportDefinitionVersionFor(sport),
      sportId: sport,
      competitionId: match.leagueId,
      seasonId: match.seasonId,
      matchId: match.id,
      sequence,
      teamId: entry.teamId,
      primaryAthleteId: entry.athleteId,
      payload: {
        value: 1,
        source: 'result_submission_active_squad',
      },
      sourceClaimId: submission.id,
      // The claim's author is the event's author. The caller (trigger, sweeper, route)
      // is who ran the finalization, which is a different question and is recorded on
      // the ledger entry as provenance rather than on each event.
      sourcePrincipal: submission.sourcePrincipal,
      submittedByUserId: submission.submittedByUserId,
      submittedByTeamId: submission.submittedByTeamId,
      evidenceRefs: submission.evidenceRefs ?? [],
      officialResultVersion: resultVersion,
      officialEventVersion: 1,
      verificationStatus: 'official',
      idempotencyKey: `${submission.id}:v${resultVersion}:active_squad:${entry.teamId}:${entry.athleteId}`,
      createdAt: finalizedAt,
      finalizedAt,
    });
    sequence += 1;
  }

  return events;
}

/**
 * Reconciles the official events against the official score using the kernel's sport
 * definitions, and records the difference explicitly.
 *
 * The finalizer previously published events and a score without ever checking that one
 * produced the other. A rugby result carrying only tries would publish an official
 * record whose events account for 15 of a 27-point total, with nothing saying so.
 *
 * Where credited events fall short of the official score, the remainder is written as an
 * `unattributed_team_score` event. That keeps the official record internally consistent
 * and makes the missing attribution a visible data-quality fact rather than a silent gap.
 * A surplus is never "corrected" by inventing negative scoring — it is reported as an
 * inconsistency for a human to resolve.
 */
function reconcileOfficialScore({
  sport,
  events,
  match,
  submission,
  score,
  resultVersion,
  finalizedAt,
}: {
  sport: 'football' | 'basketball' | 'rugby';
  events: OfficialSportEventRecord[];
  match: Match;
  submission: OfficialEventSource;
  score: { home: number; away: number };
  resultVersion: number;
  finalizedAt: string;
}) {
  const definition = SPORT_DEFINITIONS.find((entry) => entry.sportId === sport);
  const teams = { homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId };

  const trace = definition
    ? reconstructMatchScore({
      sportDefinition: definition,
      // Basketball scoring events carry their point value in the payload rather than a
      // fixed per-event weight, so they are expanded before reconstruction.
      events: events as unknown as OfficialSportEvent[],
      teams,
      claimedScore: score,
    })
    : {
      formulaVersion: `${sport}@unknown`,
      home: 0,
      away: 0,
      status: 'incomplete' as const,
      components: [],
      issues: [`No kernel sport definition for ${sport}.`],
    };

  const shortfall = {
    home: Math.max(0, score.home - trace.home),
    away: Math.max(0, score.away - trace.away),
  };
  const surplus = {
    home: Math.max(0, trace.home - score.home),
    away: Math.max(0, trace.away - score.away),
  };

  // Derived from the highest sequence present, not the array length. Once ineligible
  // athletes are filtered out the array is shorter than the sequence numbers it carries, so
  // length + 1 could reuse an id that survived the filter.
  let sequence = events.reduce((highest, event) => Math.max(highest, event.sequence), 0) + 1;
  const adjustmentEvents: OfficialSportEventRecord[] = [];
  for (const side of ['home', 'away'] as const) {
    const points = shortfall[side];
    if (points <= 0) continue;
    const teamId = side === 'home' ? match.homeTeamId : match.awayTeamId;
    const eventId = `${match.id}_v${resultVersion}_event_${String(sequence).padStart(4, '0')}`;
    adjustmentEvents.push({
      id: eventId,
      eventType: `${sport}.unattributed_team_score`,
      eventSchemaVersion: EVENT_SCHEMA_VERSION,
      sportDefinitionVersion: sportDefinitionVersionFor(sport),
      sportId: sport,
      competitionId: match.leagueId,
      seasonId: match.seasonId,
      matchId: match.id,
      sequence,
      teamId,
      // Not attributable to any athlete: that is the entire point of the record.
      primaryAthleteId: null,
      payload: {
        value: points,
        source: 'score_reconciliation',
        reason: 'Official score exceeds the points attributable to recorded events.',
      },
      sourceClaimId: submission.id,
      // The claim's author is the event's author. The caller (trigger, sweeper, route)
      // is who ran the finalization, which is a different question and is recorded on
      // the ledger entry as provenance rather than on each event.
      sourcePrincipal: submission.sourcePrincipal,
      submittedByUserId: submission.submittedByUserId,
      submittedByTeamId: submission.submittedByTeamId,
      evidenceRefs: submission.evidenceRefs ?? [],
      officialResultVersion: resultVersion,
      officialEventVersion: 1,
      verificationStatus: 'official',
      idempotencyKey: `${submission.id}:v${resultVersion}:unattributed:${teamId}`,
      createdAt: finalizedAt,
      finalizedAt,
    });
    sequence += 1;
  }

  return {
    trace,
    adjustmentEvents,
    unattributed: shortfall,
    surplus,
  };
}

/*
 * `expandForScoring` was removed on 2026-08-23.
 *
 * It turned one `basketball.points` event worth N into N synthetic
 * `basketball.free_throw_made` events, so that the kernel's fixed per-event weights would
 * sum to the right total. The arithmetic was correct and the sporting history was false — a
 * three-pointer was recorded, permanently and officially, as three made free throws.
 *
 * The kernel now understands variable-value scoring events, so `basketball.points` is
 * reconstructed from the value it actually carries. The canonical record says "scored N
 * points, breakdown not collected", which is what the submission actually claims.
 */

function officialScorerEvents({
  match,
  submission,
  sport,
  finalizedAt,
  resultVersion,
  startSequence = 1,
}: {
  match: Match;
  submission: OfficialEventSource;
  sport: 'football' | 'basketball' | 'rugby';
  finalizedAt: string;
  resultVersion: number;
  startSequence?: number;
}) {
  const events: OfficialSportEventRecord[] = [];
  let sequence = startSequence;
  const eventType = scorerEventType(sport);

  for (const scorer of submission.scorers ?? []) {
    const eventCount = sport === 'basketball' ? 1 : Math.max(0, Math.trunc(scorer.count));
    for (let index = 0; index < eventCount; index += 1) {
      const eventId = `${match.id}_v${resultVersion}_event_${String(sequence).padStart(4, '0')}`;
      events.push({
        id: eventId,
        eventType,
        eventSchemaVersion: EVENT_SCHEMA_VERSION,
        sportDefinitionVersion: sportDefinitionVersionFor(sport),
        sportId: sport,
        competitionId: match.leagueId,
        seasonId: match.seasonId,
        matchId: match.id,
        sequence,
        ...(typeof scorer.minute === 'number' ? {
          gameClock: {
            minute: scorer.minute,
            remaining: false,
          },
        } : {}),
        teamId: scorer.teamId,
        primaryAthleteId: scorer.athleteId,
        payload: {
          value: sport === 'basketball' ? scorer.count : 1,
          source: 'result_submission_scorer',
        },
        sourceClaimId: submission.id,
        // The claim's author is the event's author. The caller (trigger, sweeper, route)
        // is who ran the finalization, which is a different question and is recorded on
        // the ledger entry as provenance rather than on each event.
        sourcePrincipal: submission.sourcePrincipal,
        submittedByUserId: submission.submittedByUserId,
        submittedByTeamId: submission.submittedByTeamId,
        evidenceRefs: submission.evidenceRefs ?? [],
        officialResultVersion: resultVersion,
        officialEventVersion: 1,
        verificationStatus: 'official',
        idempotencyKey: `${submission.id}:v${resultVersion}:event:${sequence}`,
        createdAt: finalizedAt,
        finalizedAt,
      });
      sequence += 1;
    }
  }

  return events;
}

export type FinalizeOutcome =
  | { action: 'finalized'; finalizationKey: string }
  | { action: 'skipped'; reason: string }
  /**
   * The submitted score and the events that are supposed to produce it disagree in the one
   * direction that cannot be repaired by attribution. No official record was written.
   */
  | { action: 'blocked'; reason: 'reconciliation_surplus'; exceptionId: string }
  /**
   * The submission is larger than a single finalization may safely expand. No official
   * record was written and, crucially, none will be attempted again until a human looks —
   * the alternative is a transaction that fails on its operation budget and retries forever.
   */
  | { action: 'blocked'; reason: 'submission_too_large'; exceptionId: string };

/**
 * Promote a settled claim onto the official match record in one idempotent transaction.
 * This module is server-only and is shared by App Hosting and Cloud Functions.
 */
export async function finalizeSubmission(
  db: Firestore,
  matchId: string,
  /**
   * Required, with no default. The activation gate binds to the finalization path itself
   * rather than to one caller: previously only the Firestore trigger consulted it, so the
   * scheduled sweeper, the correction route and the authenticated /finalize endpoint could
   * each publish official records while the mode was `off` or `canary`. Making this
   * mandatory means a new caller cannot forget the switch — it will not compile.
   */
  activation: FinalizerActivation,
): Promise<FinalizeOutcome> {
  const submissionRef = db.collection(SUBMISSIONS).doc(matchId);

  // Checked before the transaction opens and before any read of the submission, so an
  // `off` deployment cannot write an official record even if the rest of this regressed.
  const gate = decideFinalization({
    submissionId: matchId,
    mode: activation.mode,
    canaryAllowlist: activation.canaryAllowlist,
  });
  if (!gate.proceed) return { action: 'skipped', reason: gate.reason };

  return db.runTransaction(async (tx: Transaction) => {
    const submissionSnap = await tx.get(submissionRef);
    if (!submissionSnap.exists) return { action: 'skipped', reason: 'no_submission' };

    const submission = { id: submissionSnap.id, ...submissionSnap.data() } as ResultSubmission;

    /**
     * Eligibility, in order of authority: an already-official result and a result blocked
     * for League review both stop here, before any planning work.
     *
     * The blocked check has to come first because the submission still *looks* finalizable
     * — it is confirmed, it has a score, nothing about its own status says otherwise. Any
     * later write to it re-fires this trigger, so without this the finalizer would retry a
     * contradictory result on every touch and reopen the same case indefinitely.
     */
    const submissionData = submissionSnap.data() ?? {};
    if (submissionData.finalizationStatus === BLOCKED_RECONCILIATION) {
      return { action: 'skipped', reason: BLOCKED_RECONCILIATION };
    }
    if (submissionData.finalizationStatus === BLOCKED_OVERSIZED) {
      return { action: 'skipped', reason: BLOCKED_OVERSIZED };
    }

    /**
     * Write-amplification preflight, before any planning work.
     *
     * Rules now cap these lists at write time, but a submission stored before those caps
     * existed is still sitting in the collection, and any touch of it re-fires this trigger.
     * Expanding one is how a single document becomes a transaction that exceeds Firestore's
     * operation budget, fails, retries, and fails again — burning cost and log volume while
     * the match stays stuck out of official state, with nothing surfacing to a human.
     *
     * Blocking converts that silent loop into a reviewable case. It is deliberately checked
     * against the raw submission rather than a computed plan: the point is to refuse before
     * doing the work, not to discover the size after building it.
     */
    const oversizeBreaches = submissionLimitBreaches(submissionData as SubmissionShape);

    /**
     * The work-budget check, which previously existed and was never called.
     *
     * `finalizationWriteBudgetExceeded` and `MAX_FINALIZATION_WRITES` were written alongside
     * the size caps and then not wired in, so the comment above promised a protection the
     * code did not apply. That is worse than having no guard: the structure and the prose
     * both read as if oversized finalizations were being caught.
     *
     * Counted from the claim rather than from a constructed event array, because building
     * the array to find out how big it is *is* the failure being prevented.
     */
    const projectedSport = (submissionData.sport === 'basketball' || submissionData.sport === 'rugby')
      ? submissionData.sport
      : 'football';
    const plannedWrites = projectedFinalizationWrites(submissionData as SubmissionShape, projectedSport);
    if (finalizationWriteBudgetExceeded(plannedWrites)) {
      oversizeBreaches.push(
        `finalizing this submission would plan roughly ${plannedWrites} writes, above the safe budget of ${MAX_FINALIZATION_WRITES}.`,
      );
    }

    if (oversizeBreaches.length) {
      const exceptionId = reconciliationExceptionId(matchId, Number(submissionData.resultVersion ?? 1));
      const blockedAt = new Date().toISOString();
      const exceptionRef = db.collection(RECONCILIATION_EXCEPTIONS).doc(exceptionId);
      const existingException = await tx.get(exceptionRef);
      if (!existingException.exists) {
        tx.create(exceptionRef, {
          id: exceptionId,
          exceptionId,
          matchId,
          leagueId: submissionData.leagueId ?? '',
          competitionId: submissionData.seasonId ?? submissionData.leagueId ?? '',
          submissionId: matchId,
          submissionVersion: Number(submissionData.resultVersion ?? 1),
          reasonCode: 'submission_exceeds_finalization_limits',
          // The breaches themselves, so a reviewer sees which limit and by how much rather
          // than a bare refusal.
          issues: oversizeBreaches,
          status: 'open',
          reconciliationStatus: 'not_attempted',
          finalizationStatus: 'blocked',
          reviewStatus: 'league_review_required',
          createdAt: blockedAt,
          updatedAt: blockedAt,
        });
      }
      tx.update(submissionRef, {
        finalizationStatus: BLOCKED_OVERSIZED,
        reviewStatus: 'league_review_required',
        reconciliationExceptionId: exceptionId,
        updatedAt: blockedAt,
      });
      return { action: 'blocked', reason: 'submission_too_large', exceptionId };
    }

    const matchRef = db.collection(MATCHES).doc(submission.matchId);
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) return { action: 'skipped', reason: 'no_match' };

    const match = { id: matchSnap.id, ...matchSnap.data() } as Match;
    const decision = planFinalization({
      submission,
      match,
      processedKeys: [],
      now: new Date().toISOString(),
    });
    if (decision.action === 'noop') {
      return { action: 'skipped', reason: decision.reason };
    }

    const { plan } = decision;
    const finalizedAt = plan.submission.finalizedAt;
    const ledgerRef = db.collection(FINALIZATIONS).doc(plan.finalizationKey);
    const ledgerSnap = await tx.get(ledgerRef);
    if (ledgerSnap.exists) {
      return { action: 'skipped', reason: 'already_finalized' };
    }

    const archivedRef = typeof plan.supersedesVersion === 'number'
      ? submissionRef.collection('versions').doc(String(plan.supersedesVersion))
      : null;
    const archivedSnapshot = archivedRef ? await tx.get(archivedRef) : null;

    const sport = String(match.sport).toLowerCase();
    const fantasySport = (
      sport === 'football' || sport === 'basketball' || sport === 'rugby'
    ) ? sport : undefined;
    const activeSquads = sanitizedActiveSquads(submission, match);
    const statLines = fantasySport
      ? sanitizedStatLines(submission, match, fantasySport)
      : new Map<string, AthleteStatLine>();
    const scorerTotals = new Map<string, { count: number; teamId: string }>();
    for (const scorer of submission.scorers ?? []) {
      const current = scorerTotals.get(scorer.athleteId);
      scorerTotals.set(scorer.athleteId, {
        count: (current?.count ?? 0) + scorer.count,
        teamId: scorer.teamId,
      });
    }
    const eligibilityIssues: AthleteEligibilityIssue[] = [];
    const conflictingSquadAthleteIds = (activeSquads as unknown as { conflictingAthleteIds?: Set<string> })
      .conflictingAthleteIds ?? new Set<string>();
    const officialPerformances: {
      athlete: Athlete;
      count: number;
      teamId: string;
      activeSquadEventId?: string;
      scoringSourceEventId?: string;
      statLine?: AthleteStatLine;
    }[] = [];
    /**
     * The legacy submission, adapted to the source contract the builders now take.
     *
     * Everything below this line is source-agnostic: the same builders, the same emission,
     * the same ledger. What differs between a bilateral submission and a field report is
     * entirely upstream of here, which is what makes the candidate a boundary rather than a
     * second pipeline.
     */
    const eventSource: OfficialEventSource = {
      ...submission,
      sourcePrincipal: userPrincipal(submission.submittedByUserId),
    };

    const activeSquadEvents = fantasySport
      ? officialActiveSquadEvents({
        match,
        submission: eventSource,
        sport: fantasySport,
        finalizedAt,
        resultVersion: plan.resultVersion,
      })
      : [];
    const scorerEvents = fantasySport
      ? officialScorerEvents({
        match,
        submission: eventSource,
        sport: fantasySport,
        finalizedAt,
        resultVersion: plan.resultVersion,
        startSequence: activeSquadEvents.length + 1,
      })
      : [];
    const statLineEvents = fantasySport
      ? officialStatLineEvents({
        match,
        submission: eventSource,
        sport: fantasySport,
        statLines,
        finalizedAt,
        resultVersion: plan.resultVersion,
        startSequence: activeSquadEvents.length + scorerEvents.length + 1,
      })
      : [];
    const activeSquadEventByAthlete = new Map(
      activeSquadEvents
        .filter((event) => Boolean(event.primaryAthleteId))
        .map((event) => [event.primaryAthleteId as string, event.id]),
    );
    // Team-only events carry no athlete, so they are skipped rather than collected under a
    // key that belongs to nobody. This is what the empty-string id used to hide.
    const scoringSourceEventByAthlete = new Map<string, string>();
    for (const event of scorerEvents) {
      if (!event.primaryAthleteId) continue;
      if (!scoringSourceEventByAthlete.has(event.primaryAthleteId)) {
        scoringSourceEventByAthlete.set(event.primaryAthleteId, event.id);
      }
    }
    const statSourceEventsByAthlete = new Map<string, Record<string, string>>();
    for (const event of statLineEvents) {
      const statKey = String(event.payload.statKey ?? '');
      if (!statKey || !event.primaryAthleteId) continue;
      const current = statSourceEventsByAthlete.get(event.primaryAthleteId) ?? {};
      if (!current[statKey]) current[statKey] = event.id;
      statSourceEventsByAthlete.set(event.primaryAthleteId, current);
    }
    if (fantasySport) {
      const athleteIds = new Set([
        ...activeSquads.keys(),
        ...scorerTotals.keys(),
        ...statLines.keys(),
        // Conflicting athletes are removed from the squad map but must still be
        // reported; dropping them silently is the behaviour being fixed.
        ...conflictingSquadAthleteIds,
      ]);
      for (const athleteId of athleteIds) {
        const athleteSnapshot = await tx.get(db.collection('athletes').doc(athleteId));
        const scorer = scorerTotals.get(athleteId);
        const active = activeSquads.get(athleteId);
        const statLine = statLines.get(athleteId);
        // No home-team fallback: an athlete who cannot be attributed to a side is a data
        // problem, not a home player.
        const claimedTeamId = active?.teamId ?? scorer?.teamId ?? statLine?.teamId ?? null;
        const athleteData = athleteSnapshot.exists ? athleteSnapshot.data() ?? {} : null;
        const registeredTeamId = typeof athleteData?.teamId === 'string' ? athleteData.teamId : null;

        const issue = !athleteSnapshot.exists
          ? {
            athleteId,
            claimedTeamId,
            registeredTeamId,
            reason: 'athlete_not_found' as const,
          }
          : assessAthleteEligibility({
            athleteId,
            claimedTeamId,
            registeredTeamId,
            match,
            conflicting: conflictingSquadAthleteIds.has(athleteId),
          });

        if (issue) {
          eligibilityIssues.push(issue);
          continue;
        }

        officialPerformances.push({
          athlete: { id: athleteSnapshot.id, ...athleteData } as Athlete,
          count: scorer?.count ?? 0,
          teamId: claimedTeamId as string,
          activeSquadEventId: activeSquadEventByAthlete.get(athleteId),
          scoringSourceEventId: scoringSourceEventByAthlete.get(athleteId),
          statLine,
        });
      }
    }

    /**
     * The integrity gate. Everything above this line computes; nothing above it writes.
     *
     * Reconciliation runs here — after the complete candidate event set exists, and before
     * the first official write is staged — because the two directions of disagreement are
     * not the same kind of problem:
     *
     *   events total LESS than the official score is an attribution gap. The missing
     *   points are recorded as an explicit `unattributed_team_score` event, the record
     *   stays internally consistent, and finalization proceeds.
     *
     *   events total MORE than the official score is a contradiction. There is no honest
     *   repair: deleting athlete events to force a fit would destroy submitted evidence,
     *   and raising the official score would invent a result nobody claimed. It stops.
     *
     * Previously a surplus was recorded on the reconciliation document and finalization
     * continued anyway, so an official result could be published whose own events said it
     * was wrong.
     */
    /**
     * Official events are filtered to eligible athletes before anything reads them.
     *
     * Eligibility already excluded these athletes from `officialAthleteMatchStats`, but the
     * candidate event arrays were still written to `officialSportEvents` unfiltered. That
     * produced a split-brain official record: the event stream credited a try to an athlete
     * the same finalization had ruled ineligible, while the athlete's own official stats
     * showed nothing. For a platform whose product is sports truth, one official record
     * cannot contradict another.
     *
     * Removing an ineligible scorer's events makes the remaining events total LESS than the
     * submitted score, so reconciliation records the difference as an explicit
     * `unattributed_team_score`. That is the honest outcome: the points were scored, and
     * this platform cannot say by whom.
     */
    const ineligibleAthleteIds = new Set(eligibilityIssues.map((issue) => issue.athleteId));
    const eligibleOfficialEvents = [...activeSquadEvents, ...scorerEvents, ...statLineEvents]
      .filter((event) => !event.primaryAthleteId || !ineligibleAthleteIds.has(event.primaryAthleteId));

    const surplusGate = fantasySport
      ? reconcileOfficialScore({
        sport: fantasySport,
        events: eligibleOfficialEvents,
        match,
        submission: eventSource,
        score: plan.match.score,
        resultVersion: plan.resultVersion,
        finalizedAt,
      })
      : undefined;

    if (surplusGate && (surplusGate.surplus.home > 0 || surplusGate.surplus.away > 0)) {
      const exceptionId = reconciliationExceptionId(match.id, submission.resultVersion);
      const exceptionRef = db.collection(RECONCILIATION_EXCEPTIONS).doc(exceptionId);
      const existing = await tx.get(exceptionRef);

      // Deterministic id plus create-once semantics: a redelivered event finds the same
      // case and refreshes only its observation timestamp, so three deliveries are one
      // case with no duplicated audit trail.
      if (!existing.exists) {
        tx.create(exceptionRef, {
          exceptionId,
          matchId: match.id,
          leagueId: match.leagueId,
          competitionId: match.seasonId ?? match.leagueId,
          submissionId: submission.id,
          submissionVersion: submission.resultVersion,
          sport: fantasySport,
          officialHomeScore: plan.match.score.home,
          officialAwayScore: plan.match.score.away,
          reconstructedHomeScore: surplusGate.trace.home,
          reconstructedAwayScore: surplusGate.trace.away,
          homeDifference: surplusGate.trace.home - plan.match.score.home,
          awayDifference: surplusGate.trace.away - plan.match.score.away,
          // The submitted events are preserved by reference, never rewritten. This is the
          // evidence a League needs to decide which side is wrong.
          eventIds: eligibleOfficialEvents.map((event) => event.id),
          evidenceRefs: submission.evidenceRefs ?? [],
          reasonCode: 'scoring_events_exceed_submitted_result',
          status: 'open',
          reconciliationStatus: 'surplus',
          finalizationStatus: 'blocked',
          reviewStatus: 'league_review_required',
          finalizationAttemptId: plan.finalizationKey,
          createdAt: finalizedAt,
          updatedAt: finalizedAt,
        });

        /**
         * Transactional outbox.
         *
         * Written in the SAME transaction as the case, so the event and the record it
         * describes cannot disagree: either both exist or neither does. A consumer that
         * later sends a League notice, opens a Platform queue item or emits analytics reads
         * from here.
         *
         * The finalizer deliberately knows none of those consumers. Teaching the trusted
         * sports finalizer to send email would put a delivery failure on the path that
         * publishes official records.
         *
         * The id is deterministic and this sits inside the create-once branch, so a
         * redelivered trigger neither reopens the case nor re-emits the event.
         */
        tx.create(db.collection(OUTBOX).doc(reconciliationOutboxId(exceptionId)), {
          id: reconciliationOutboxId(exceptionId),
          type: RECONCILIATION_EXCEPTION_CREATED,
          exceptionId,
          matchId: match.id,
          leagueId: match.leagueId,
          competitionId: match.seasonId ?? match.leagueId,
          submissionId: submission.id,
          submissionVersion: submission.resultVersion,
          // Enough for a consumer to route and summarise without re-reading the case.
          officialScore: { home: plan.match.score.home, away: plan.match.score.away },
          reconstructedScore: { home: surplusGate.trace.home, away: surplusGate.trace.away },
          reviewStatus: 'league_review_required',
          status: 'pending',
          createdAt: finalizedAt,
        });
      } else {
        tx.set(exceptionRef, { updatedAt: finalizedAt }, { merge: true });
      }

      // Marks the workflow so a later write to this submission does not re-enter
      // finalization. The submission's own `status` is left alone: it is a claim-lifecycle
      // field with its own state machine, and overloading it is what made `status:
      // 'verified'` ambiguous elsewhere in this codebase.
      tx.update(submissionRef, {
        finalizationStatus: BLOCKED_RECONCILIATION,
        reviewStatus: 'league_review_required',
        reconciliationExceptionId: exceptionId,
        updatedAt: finalizedAt,
      });

      if (!existing.exists) {
        tx.create(submissionRef.collection('events').doc(), {
          submissionId: submission.id,
          from: submission.status,
          to: submission.status,
          actor: 'system',
          actorUserId: 'system:finalizer',
          note: `Finalization blocked: recorded events exceed the submitted score `
            + `(events ${surplusGate.trace.home}-${surplusGate.trace.away}, `
            + `submitted ${plan.match.score.home}-${plan.match.score.away}). `
            + `League review required.`,
          reconciliationExceptionId: exceptionId,
          createdAt: finalizedAt,
        });
      }

      return { action: 'blocked', reason: 'reconciliation_surplus', exceptionId };
    }

    if (archivedRef && archivedSnapshot && !archivedSnapshot.exists) {
      tx.create(archivedRef, {
        ...submissionSnap.data(),
        status: 'superseded',
        supersededBySubmissionId: submission.id,
        supersededAt: plan.submission.finalizedAt,
      });
    }

    tx.update(matchRef, {
      status: plan.match.status,
      verificationStatus: plan.match.verificationStatus,
      score: plan.match.score,
      teamAScore: plan.match.score.home,
      teamBScore: plan.match.score.away,
      officialResultVersion: plan.resultVersion,
      verifiedBy: 'system:finalizer',
      updatedAt: plan.submission.finalizedAt,
    });

    tx.update(submissionRef, {
      status: plan.submission.status,
      finalizationSource: plan.submission.finalizationSource,
      finalizationKey: plan.finalizationKey,
      finalizedAt: plan.submission.finalizedAt,
    });

    tx.create(submissionRef.collection('events').doc(), {
      submissionId: submission.id,
      from: submission.status,
      to: plan.submission.status,
      actor: 'system',
      actorUserId: 'system:finalizer',
      note: `Finalized via ${plan.submission.finalizationSource}`,
      createdAt: plan.submission.finalizedAt,
    });

    /**
     * The idempotency ledger is the one record that exists exactly once per finalized
     * result version, so it is where the provenance quad belongs: it answers "how did this
     * become official?" without depending on anyone's memory, and it cannot drift, because
     * the entry is written once and never updated.
     *
     * Provenance is recorded separately from status. `legacy_team_submission` here is a
     * statement about what kind of record produced this version, not about how much it
     * should be trusted; the quality tier that reads it is computed at finalization in a
     * later phase and is never settable by hand.
     */
    tx.create(ledgerRef, {
      matchId: submission.matchId,
      submissionId: submission.id,
      resultVersion: submission.resultVersion,
      ...provenanceQuad({
        sourceType: 'legacy_team_submission',
        sourceRecordId: submission.id,
        principal: userPrincipal(submission.submittedByUserId),
      }),
      finalizedAt,
    });

    if (fantasySport) {
      const officialEvents = [...eligibleOfficialEvents];

      // Already computed by the integrity gate above, which is the only place this may be
      // decided. Recomputing here would risk the gate and the published record disagreeing.
      const reconciliation = surplusGate!;
      officialEvents.push(...reconciliation.adjustmentEvents);

      /**
       * Shape check before anything is written, against the schema version each event
       * declares.
       *
       * Every event here is constructed in this file and is already typechecked, so in A0
       * this is defence in depth. It earns its place at the moment field capture starts
       * supplying events from outside this module: a malformed official record is not
       * recoverable by a later correction, because corrections version a record that has to
       * have been readable in the first place.
       *
       * It throws rather than opening a reconciliation exception because it can only fire on
       * a code defect, not on bad match data, and an exception queue is for decisions a human
       * can make. A human cannot adjudicate a missing required field.
       */
      for (const event of officialEvents) {
        const verdict = validateOfficialEventShape(event);
        if (verdict.status === 'blocked') {
          throw new Error(
            `Refusing to write a malformed official event ${event.id}: ${verdict.issues.join(' ')}`,
          );
        }
      }

      for (const event of officialEvents) {
        tx.create(db.collection(OFFICIAL_SPORT_EVENTS).doc(event.id), event);
      }

      /**
       * Provenance is split in two, because it has two audiences.
       *
       * A fan looking at a result is owed the fact that it was reconciled, against which
       * formula version, and whether it balanced. That is what makes a verified result
       * meaningful rather than an assertion, and it is safe for anyone to read.
       *
       * What they are NOT owed is the operational detail of how it failed: athlete ids,
       * their claimed versus registered teams, and reasons like
       * `not_registered_to_claimed_team`. That is an internal data-quality record about
       * named individuals, and it used to sit in a collection any anonymous reader could
       * fetch. Publishing an incomplete record honestly does not require publishing which
       * child was excluded and why.
       */
      const reconciliationId = `${match.id}_v${plan.resultVersion}`;

      tx.set(db.collection('publicResultProvenance').doc(reconciliationId), {
        id: reconciliationId,
        matchId: match.id,
        officialResultVersion: plan.resultVersion,
        sport: fantasySport,
        formulaVersion: reconciliation.trace.formulaVersion,
        status: reconciliation.trace.status,
        officialScore: plan.match.score,
        // Counts only: enough to say the record is incomplete, without naming anyone.
        unattributedTotal: reconciliation.unattributed,
        eligibilityIssueCount: eligibilityIssues.length,
        finalizedAt,
      });

      tx.set(db.collection('officialMatchReconciliation').doc(reconciliationId), {
        id: reconciliationId,
        matchId: match.id,
        leagueId: match.leagueId,
        officialResultVersion: plan.resultVersion,
        sport: fantasySport,
        formulaVersion: reconciliation.trace.formulaVersion,
        status: reconciliation.trace.status,
        eventScore: { home: reconciliation.trace.home, away: reconciliation.trace.away },
        officialScore: plan.match.score,
        unattributed: reconciliation.unattributed,
        issues: reconciliation.trace.issues,
        // Athletes excluded from official records, with the reason. Restricted to the
        // League that governs the fixture and to Platform.
        eligibilityIssues,
        finalizedAt,
      });

      const statKey = fantasySport === 'football'
        ? 'goal'
        : fantasySport === 'rugby'
          ? 'try'
          : 'points_scored';
      const kernelEvents = officialEvents as unknown as OfficialSportEvent[];

      /**
       * The athlete projection derives its scoring from the canonical events, not from a
       * second reading of the submission.
       *
       * `officialAthleteMatchStats` is what fantasy scores from and what the Career Passport
       * displays, and it used to be computed independently of `officialSportEvents` — same
       * inputs, two code paths, both stamped official. Nothing forced them to agree. Fix the
       * kernel's interpretation of participation and rebuild the events correctly, and the
       * bespoke projection would carry on with the old assumptions: the public profile saying
       * one thing, fantasy another, both internally plausible.
       *
       * Summing `payload.value` handles both shapes the finalizer emits — one event per goal
       * or try carrying 1, and a single basketball event carrying the point total.
       */
      const scoredFromEvents = new Map<string, number>();
      const scoringEventType = scorerEventType(fantasySport);
      for (const event of officialEvents) {
        if (event.eventType !== scoringEventType || !event.primaryAthleteId) continue;
        const value = Number((event.payload as { value?: unknown })?.value ?? 0);
        if (!Number.isFinite(value)) continue;
        scoredFromEvents.set(
          event.primaryAthleteId,
          (scoredFromEvents.get(event.primaryAthleteId) ?? 0) + value,
        );
      }

      for (const { athlete, count, teamId, activeSquadEventId, scoringSourceEventId, statLine } of officialPerformances) {
        // Derived from the events that were actually written. `count` is retained only to
        // detect the two paths disagreeing, which is the defect this guards against.
        const scoredFromCanonicalEvents = scoredFromEvents.get(athlete.id) ?? 0;
        if (scoredFromCanonicalEvents !== count) {
          // console rather than a logger: this module is shared by App Hosting and the
          // Cloud Functions runtime, which have different logging surfaces.
          console.warn(
            `[finalizer] athlete projection disagreed with canonical events for `
            + `${athlete.id} in ${match.id}: events=${scoredFromCanonicalEvents}, submission=${count}`,
          );
        }
        const positionGroup = officialPositionGroup(fantasySport, athleteRegisteredPosition(athlete));
        const teamWon =
          (teamId === match.homeTeamId && plan.match.score.home > plan.match.score.away)
          || (teamId === match.awayTeamId && plan.match.score.away > plan.match.score.home);
        const performanceId = `${match.id}_v${plan.resultVersion}_${athlete.id}`;
        const participationSourceEventId = activeSquadEventId ?? scoringSourceEventId ?? `${submission.id}:v${plan.resultVersion}:${athlete.id}:participation`;
        const statSources = statSourceEventsByAthlete.get(athlete.id) ?? {};
        const lineStats = statLine?.stats ?? {};
        // Participation is derived from the official events, never assumed from squad
        // selection. An unused substitute must not receive an appearance.
        const participation = resolveAthleteParticipation({
          athleteId: athlete.id,
          teamId,
          sportId: fantasySport,
          events: kernelEvents,
        });
        const minutesPlayed = participation.minutesPlayed
          || statLine?.minutesPlayed
          || lineStats.minutes_played
          || 0;
        const playerOfMatch = Boolean(statLine?.playerOfMatch || match.topPerformerId === athlete.id);
        const richStats = {
          ...lineStats,
          ...(minutesPlayed > 0 ? { minutes_played: minutesPlayed } : {}),
          player_of_match: playerOfMatch ? 1 : 0,
        };
        tx.set(db.collection('officialAthleteMatchStats').doc(performanceId), {
          id: performanceId,
          matchId: match.id,
          athleteId: athlete.id,
          realTeamId: teamId,
          sport: fantasySport,
          /**
           * Stays `position`, and stays denormalized.
           *
           * ADR-001 renamed the field on the live athlete record, not here. This is a
           * verified, versioned historical record: an athlete registered as a forward in
           * 2026 who moves to midfield in 2027 must not retroactively change what their 2026
           * match record says. Invariant 08 and invariant 04 meet at this line and 04 wins.
           */
          position: athleteRegisteredPosition(athlete),
          positionGroup,
          officialResultVersion: plan.resultVersion,
          verificationStatus: 'verified',
          dataLevel: statLineDataLevel(statLine),
          dataCoverage: statLine ? 'verified_stat_line' : activeSquadEventId ? 'match_squad_basic' : 'scorer_only',
          activeSquad: Boolean(activeSquadEventId) || count > 0 || Boolean(statLine),
          participationLevel: participation.level,
          didPlay: participation.didPlay,
          minutesPlayed,
          teamWon,
          playerOfMatch,
          stats: {
            active_squad: activeSquadEventId || count > 0 || statLine ? 1 : 0,
            // Appearance and win participation follow evidence of playing. Awarding
            // them from selection manufactured career records and fantasy points for
            // athletes who may never have left the bench.
            appearance: participation.didPlay ? 1 : 0,
            [statKey]: scoredFromCanonicalEvents,
            win_participation: teamWon && participation.didPlay ? 1 : 0,
            ...richStats,
          },
          sourceEventIds: {
            active_squad: participationSourceEventId,
            ...(participation.didPlay
              ? {
                appearance: participation.sourceEventIds[0] ?? participationSourceEventId,
                ...(teamWon ? { win_participation: participation.sourceEventIds[0] ?? participationSourceEventId } : {}),
              }
              : {}),
            [statKey]: scoringSourceEventId ?? `${submission.id}:v${plan.resultVersion}:${athlete.id}:${statKey}`,
            ...statSources,
          },
          finalizedAt: plan.submission.finalizedAt,
        });
      }
    }

    return { action: 'finalized', finalizationKey: plan.finalizationKey };
  });
}
