import type { FinalizationSourceType, Principal } from '../../kernel/principal';
import type { AthleteStatLine, FinalizationSource } from '../../types';
// Relative, and deliberately the shared implementation: a second spelling of this format is a
// second answer to "have we already finalized this", and the ledger can only hold one.
import { finalizationKeyFor } from '../../lib/resultSubmission';

/**
 * The narrow input the truth engine actually needs.
 *
 * Three sources produce official results now: a legacy bilateral submission, a field capture
 * report, and a league entering a result afterwards. They arrive in different shapes, and the
 * compatibility boundary between them is this contract, not the truth engine and not storage.
 *
 * ## Why not write field reports into `resultSubmissions`
 *
 * It looks free: the document id is already the matchId and the finalizer already reads it.
 * But `ResultSubmission` carries `submittedByTeamId`, `opponentTeamId`,
 * `confirmationDeadline`, `respondedByUserId` and a seven-state confirmation machine, none of
 * which mean anything for a match one person watched. Squatting on it produces exactly the
 * defect this codebase has migrated away from twice: two fields describing one truth, free to
 * contradict each other.
 *
 * Relative imports: this module compiles into the Cloud Functions bundle.
 */

export type ScorerEntry = {
  athleteId: string;
  teamId: string;
  count: number;
  minute?: number;
};

export type FinalizationCandidate = {
  /**
   * Identifies this attempt, distinctly from the record it came from.
   *
   * `sourceRecordId` says which document produced it; this says which candidate. They differ
   * whenever one record produces more than one attempt, which is exactly what a correction is.
   */
  candidateId: string;
  matchId: string;
  leagueId: string;
  competitionId?: string;
  seasonId: string;
  sport: 'football' | 'basketball' | 'rugby';

  /** Declared where a human declared one, reconstructed where the events are the only record. */
  homeScore: number;
  awayScore: number;
  scorers: ScorerEntry[];
  athleteStatLines?: AthleteStatLine[];
  /** Who was available. Absent where the source did not record a squad. */
  activeSquads?: Record<string, string[]>;

  evidenceRefs: string[];

  /** The provenance quad, carried from the source rather than inferred at the destination. */
  sourceType: FinalizationSourceType;
  sourceRecordId: string;
  sourcePrincipal: Principal;
  /**
   * How this became final within its own source, where the source has such a notion.
   *
   * Legacy submissions do: confirmed by the opponent reads differently from confirmed after
   * silence, and the quality tier is entitled to know which. Field capture does not, because
   * there is no second party to have agreed.
   */
  confirmationProvenance?: FinalizationSource;
  /** Legacy only. A field report is not submitted by a team. */
  submittedByTeamId?: string;
  submittedByUserId?: string;

  submittedAt: string;
  resultVersion: number;
  /** Unchanged format. The idempotency ledger does not care which source produced this. */
  finalizationKey: string;
};

/**
 * The finalization key, delegated to the canonical implementation rather than restated.
 *
 * An earlier version of this file spelled the format itself, as `${matchId}:v${version}`, and
 * got it wrong: the real key is three-part. The consequence would not have been a broken
 * feature, it would have been a field report and a legacy submission for the same match and
 * version producing different keys, so the idempotency ledger would have seen two distinct
 * finalizations and permitted both.
 *
 * Note what the shared format means when two sources use the matchId as their record id, as
 * both `matchReports` and `resultSubmissions` do: they collide, deliberately. One official
 * result per match per version, whatever produced it, is exactly the property the ledger
 * exists to hold.
 */
export function candidateFinalizationKey(input: {
  matchId: string;
  sourceRecordId: string;
  resultVersion: number;
}) {
  return finalizationKeyFor({
    matchId: input.matchId,
    id: input.sourceRecordId,
    resultVersion: input.resultVersion,
  });
}

type LegacySubmissionShape = {
  id: string;
  matchId: string;
  leagueId: string;
  seasonId: string;
  sport?: string;
  homeScore?: number;
  awayScore?: number;
  submittedByUserId: string;
  submittedByTeamId?: string;
  scorers?: ScorerEntry[];
  athleteStatLines?: AthleteStatLine[];
  activeSquads?: Record<string, string[]>;
  evidenceRefs?: string[];
  resultVersion?: number;
  submittedAt?: string;
  finalizationSource?: FinalizationSource;
};

function normalizeSport(sport: unknown): FinalizationCandidate['sport'] {
  return sport === 'basketball' || sport === 'rugby' ? sport : 'football';
}

/**
 * A legacy bilateral submission.
 *
 * `sourceType` is `legacy_team_submission` and stays that way regardless of how it was
 * confirmed. How much to trust it is a separate question that the quality tier answers from
 * the confirmation provenance, and folding the two into one field is how a result that was
 * confirmed by silence ends up indistinguishable from one an opponent actually agreed to.
 */
export function buildCandidateFromLegacySubmission(submission: LegacySubmissionShape): FinalizationCandidate {
  const resultVersion = submission.resultVersion ?? 1;
  return {
    candidateId: `${submission.matchId}:legacy:${resultVersion}`,
    submittedAt: submission.submittedAt ?? '',
    submittedByTeamId: submission.submittedByTeamId,
    submittedByUserId: submission.submittedByUserId,
    confirmationProvenance: submission.finalizationSource,
    matchId: submission.matchId,
    leagueId: submission.leagueId,
    seasonId: submission.seasonId,
    sport: normalizeSport(submission.sport),
    homeScore: submission.homeScore ?? 0,
    awayScore: submission.awayScore ?? 0,
    scorers: submission.scorers ?? [],
    athleteStatLines: submission.athleteStatLines,
    activeSquads: submission.activeSquads,
    evidenceRefs: submission.evidenceRefs ?? [],
    sourceType: 'legacy_team_submission',
    sourceRecordId: submission.id,
    // The claim's author. Who ran the finalization is a different question, recorded on the
    // ledger entry rather than on the events.
    sourcePrincipal: { principalType: 'user', userId: submission.submittedByUserId },
    resultVersion,
    finalizationKey: candidateFinalizationKey({ matchId: submission.matchId, sourceRecordId: submission.id, resultVersion }),
  };
}

type FieldReportShape = {
  id: string;
  matchId: string;
  leagueId: string;
  seasonId?: string;
  sport?: string;
  declaredHomeScore: number;
  declaredAwayScore: number;
  reconstructedHomeScore: number;
  reconstructedAwayScore: number;
  assignmentId?: string;
  sessionId?: string;
  resultVersion?: number;
  attestedAt?: string;
};

type FieldEventShape = {
  eventType: string;
  teamId: string;
  athleteId: string | null;
  gameClockMs: number;
  status: string;
  payload?: Record<string, unknown>;
};

/**
 * A field capture report.
 *
 * The score comes from the reconstruction rather than the declaration, and that is the whole
 * point of collecting both. The declared score is an independent check that the events are
 * complete; it is not a second opinion about the result. Where they disagree the report never
 * reaches this function, because the mismatch is a blocking exception and a human looks first.
 */
export function buildCandidateFromFieldReport(input: {
  report: FieldReportShape;
  events: FieldEventShape[];
  scoringEventTypes: string[];
}): FinalizationCandidate {
  const resultVersion = input.report.resultVersion ?? 1;
  const active = input.events.filter((event) => event.status === 'active');

  // One scorer entry per athlete per team, counted from the events themselves. A team-only
  // event carries no athlete and contributes nothing here: it is already in the score.
  const tally = new Map<string, ScorerEntry>();
  for (const event of active) {
    if (!input.scoringEventTypes.includes(event.eventType)) continue;
    if (!event.athleteId) continue;
    const key = `${event.teamId}:${event.athleteId}`;
    const existing = tally.get(key);
    const value = typeof event.payload?.value === 'number' ? event.payload.value : 1;
    if (existing) existing.count += value;
    else {
      tally.set(key, {
        athleteId: event.athleteId,
        teamId: event.teamId,
        count: value,
        minute: Math.floor(event.gameClockMs / 60_000),
      });
    }
  }

  return {
    candidateId: `${input.report.matchId}:field:${resultVersion}`,
    submittedAt: input.report.attestedAt ?? '',
    matchId: input.report.matchId,
    leagueId: input.report.leagueId,
    seasonId: input.report.seasonId ?? '',
    sport: normalizeSport(input.report.sport),
    homeScore: input.report.reconstructedHomeScore,
    awayScore: input.report.reconstructedAwayScore,
    scorers: [...tally.values()],
    evidenceRefs: [],
    sourceType: 'field_capture',
    sourceRecordId: input.report.id,
    sourcePrincipal: input.report.sessionId && input.report.assignmentId
      ? {
        principalType: 'match_ops_session',
        matchSessionId: input.report.sessionId,
        fieldManagerAssignmentId: input.report.assignmentId,
      }
      : { principalType: 'system', component: 'field_capture' },
    resultVersion,
    finalizationKey: candidateFinalizationKey({ matchId: input.report.matchId, sourceRecordId: input.report.id, resultVersion }),
  };
}

/**
 * A League Admin typing a result in afterwards.
 *
 * Carries the entering user as the principal, because that is exactly who is accountable for
 * it: nobody observed this match on the platform's behalf, and the provenance should say so
 * rather than borrowing the authority of a capture that did not happen.
 */
export function buildCandidateFromLeagueReport(input: {
  matchId: string;
  leagueId: string;
  seasonId: string;
  sport?: string;
  homeScore: number;
  awayScore: number;
  scorers?: ScorerEntry[];
  evidenceRefs?: string[];
  enteredByUserId: string;
  recordId: string;
  resultVersion?: number;
  submittedAt?: string;
}): FinalizationCandidate {
  const resultVersion = input.resultVersion ?? 1;
  return {
    candidateId: `${input.matchId}:league:${resultVersion}`,
    submittedAt: input.submittedAt ?? '',
    submittedByUserId: input.enteredByUserId,
    matchId: input.matchId,
    leagueId: input.leagueId,
    seasonId: input.seasonId,
    sport: normalizeSport(input.sport),
    homeScore: input.homeScore,
    awayScore: input.awayScore,
    scorers: input.scorers ?? [],
    evidenceRefs: input.evidenceRefs ?? [],
    sourceType: 'league_post_match',
    sourceRecordId: input.recordId,
    sourcePrincipal: { principalType: 'user', userId: input.enteredByUserId },
    resultVersion,
    finalizationKey: candidateFinalizationKey({ matchId: input.matchId, sourceRecordId: input.recordId, resultVersion }),
  };
}
