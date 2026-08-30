import type { ProvenanceQuad } from '../../kernel/principal';
import {
  candidateFinalizationKey,
  type FinalizationCandidate,
  type ScorerEntry,
} from '../finalization/candidate';
import { candidateIdFor } from '../../lib/matchOps/digest';

/**
 * One adjudication of one official result, whatever produced it.
 *
 * ## Why there is one of these rather than one per provenance
 *
 * Corrections were bolted to the legacy path: `/api/result-submissions/{matchId}/correction`
 * loaded `resultSubmissions/{matchId}` and worked on it. A result that became official through
 * V2 field capture has no such document, so a wrong verified result from the platform's own
 * primary intake path could not be corrected through the product at all — it needed somebody
 * with database access.
 *
 * The fix is not a second correction system for field reports. It is one case that references
 * whichever evidence produced the result, because the question "was this result right" does not
 * change shape depending on how the result arrived.
 *
 * ## The chain, and why it is a chain
 *
 *   official result version -> result case -> ruling -> new official result version
 *
 * Every link is a record, and none of them is a mutation of the one before. The challenged
 * version stays exactly as it was; the case names it; the ruling names the case; the new
 * version names the ruling. Nothing in this file writes a score.
 *
 * ## What a ruling actually does
 *
 * It builds a `FinalizationCandidate` with `sourceType: 'result_case'` and hands it to the same
 * `finalizeCandidate` that field capture, league entry and legacy submissions use. So version
 * supersession, the idempotency ledger, the standings recomputation and the notifications are
 * the ones that already exist and are already tested. A correction is a new SOURCE, not a new
 * path, and that distinction is the whole design: a second writer of official scores is the
 * thing most likely to make two surfaces disagree about what happened in a match.
 */

/** Statuses a case can still move from. */
export const ACTIVE_STATUSES = ['open', 'under_review', 'proposed', 'escalated'] as const;

/** Statuses that are the end of a case. A ruling, once made, is a record and not a draft. */
export const TERMINAL_STATUSES = [
  'resolved_upheld',
  'resolved_corrected',
  'withdrawn',
  'superseded',
] as const;

export type ResultCaseStatus =
  | (typeof ACTIVE_STATUSES)[number]
  | (typeof TERMINAL_STATUSES)[number];

export function isTerminal(status: ResultCaseStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/**
 * A pointer to evidence, never a copy of it.
 *
 * The point of provenance is that it survives; a case that copied a field report would hold a
 * second version of it that could drift from the first. `collection` and `documentId` locate
 * the original, which stays immutable and stays authoritative.
 */
export type EvidenceRef = {
  collection:
    | 'matchReports'
    | 'resultSubmissions'
    | 'liveMatchEvents'
    | 'mediaRecords'
    | 'athleteStatIssues'
    | 'teamMatchReports'
    | 'matchOperationalExceptions';
  documentId: string;
  note?: string;
  addedByUserId: string;
  addedAt: string;
};

export type ResultCaseRuling = {
  decidedByUserId: string;
  decidedAt: string;
  outcome: 'upheld' | 'corrected';
  rationale: string;
  /** Present only for `corrected`. What the official result should have said. */
  correctedScore?: { home: number; away: number };
  correctedScorers?: ScorerEntry[];
  /** Recorded when a conflicted adjudicator prepared the reasoning somebody else ratified. */
  proposedByUserId?: string;
};

export type ResultCase = {
  id: string;
  matchId: string;
  leagueId: string;
  seasonId: string;
  sport: string;
  /**
   * The official result version this case challenges. Immutable, and the reason a stale case
   * cannot overwrite a newer result: by the time it is ruled on, the match may have moved past
   * the version the case was ever about.
   */
  subjectVersion: number;
  /** Copied from the challenged version, so the chain survives the source becoming unreadable. */
  subjectProvenance: ProvenanceQuad | null;
  status: ResultCaseStatus;
  openedByUserId: string;
  openedByScope: { scopeType: 'league' | 'team' | 'athlete' | 'platform'; scopeId: string };
  reason: string;
  openedAt: string;
  evidence: EvidenceRef[];
  ruling?: ResultCaseRuling;
  /** The official version a `corrected` ruling produced, once the finalizer has written it. */
  resultingVersion?: number;
  updatedAt: string;
};

/**
 * `{matchId}__case{n}`, so a match can be adjudicated more than once over its life.
 *
 * Sequenced rather than random because a correction that is itself wrong needs a SECOND case,
 * and reading a match's history in order is how anybody reconstructs what happened. A
 * deterministic id also means retrying an open is idempotent.
 */
export function resultCaseId(matchId: string, sequence: number): string {
  return `${matchId}__case${sequence}`;
}

export type OpenRefusal = { ok: false; reason: string };
export type OpenDecision = OpenRefusal | { ok: true; caseId: string; sequence: number };

/**
 * Whether a new case may be opened, given what the match and its existing cases say.
 *
 * One active case per match at a time. Two people adjudicating the same result concurrently is
 * how a match ends up with two rulings that disagree, and the second person's evidence belongs
 * on the first person's case rather than beside it.
 */
export function decideOpenCase(input: {
  matchId: string;
  officialResultVersion: number | undefined;
  subjectVersion: number;
  existingCases: Array<Pick<ResultCase, 'id' | 'status' | 'subjectVersion'>>;
}): OpenDecision {
  if (!input.officialResultVersion) {
    return {
      ok: false,
      reason: 'This match has no official result to correct. A result that is not yet official '
        + 'is changed through the workflow that is producing it.',
    };
  }
  if (input.subjectVersion !== input.officialResultVersion) {
    return {
      ok: false,
      reason: `This match is on official version ${input.officialResultVersion}, not `
        + `${input.subjectVersion}. Reload and open the case against the current result.`,
    };
  }

  const active = input.existingCases.find((entry) => !isTerminal(entry.status));
  if (active) {
    return {
      ok: false,
      reason: `Case ${active.id} is already open on this match. Add your evidence to it rather `
        + 'than opening a second adjudication of the same result.',
    };
  }

  const sequence = input.existingCases.length + 1;
  return { ok: true, caseId: resultCaseId(input.matchId, sequence), sequence };
}

export type CaseAction = 'claim' | 'propose' | 'escalate' | 'rule' | 'withdraw' | 'evidence';

export type ActionRefusal = { ok: false; reason: string; status: 403 | 409 };
export type ActionDecision = ActionRefusal | { ok: true; nextStatus: ResultCaseStatus };

/**
 * Whether an actor may take an action on a case, and what it leaves the case as.
 *
 * ## Conflict
 *
 * A League Admin affiliated with one of the clubs may `propose` and `escalate` and may not
 * `rule`. That split already exists for operational exceptions and exists for the same reason:
 * escalation must not leave the person who knows the competition sitting idle while Platform
 * reconstructs context they do not have. Whoever is closest writes the reasoning; somebody
 * unconflicted takes responsibility for it.
 *
 * ## Terminal means terminal
 *
 * A resolved ruling is a record. Correcting a correction opens a new case against the version
 * the first one produced, which is what keeps the history readable: three cases in sequence
 * rather than one document that changed its mind twice.
 */
export function decideCaseAction(input: {
  action: CaseAction;
  status: ResultCaseStatus;
  actorUserId: string;
  openedByUserId: string;
  /** True when the actor holds `league.result.resolve` on this case's league, or a platform grant. */
  adjudicates: boolean;
  /** True when the actor is affiliated with a club in this fixture. */
  conflicted: boolean;
  /** For `rule` only. */
  outcome?: 'upheld' | 'corrected';
}): ActionDecision {
  if (isTerminal(input.status)) {
    return {
      ok: false,
      status: 409,
      reason: 'This case is closed. A correction to a corrected result opens a new case against '
        + 'the version that correction produced.',
    };
  }

  if (input.action === 'withdraw') {
    // Only the person who raised it, and only while nobody has ruled. A withdrawal by anybody
    // else is a rejection, and a rejection is a ruling that has to be reasoned and recorded.
    if (input.actorUserId !== input.openedByUserId) {
      return { ok: false, status: 403, reason: 'Only the person who raised this case may withdraw it.' };
    }
    return { ok: true, nextStatus: 'withdrawn' };
  }

  if (input.action === 'evidence') {
    // Deliberately open to anybody who can see the case. Evidence is append-only and adds no
    // authority; refusing a club's evidence on their own fixture is how adjudication loses the
    // one party that was there.
    return { ok: true, nextStatus: input.status };
  }

  if (!input.adjudicates) {
    return { ok: false, status: 403, reason: 'You do not adjudicate results in this league.' };
  }

  if (input.action === 'claim') return { ok: true, nextStatus: 'under_review' };
  if (input.action === 'propose') return { ok: true, nextStatus: 'proposed' };
  if (input.action === 'escalate') return { ok: true, nextStatus: 'escalated' };

  // `rule`
  if (input.conflicted) {
    return {
      ok: false,
      status: 403,
      reason: 'You are affiliated with a club in this fixture. Propose a resolution or escalate '
        + 'it, and somebody unconflicted will decide.',
    };
  }
  return {
    ok: true,
    nextStatus: input.outcome === 'corrected' ? 'resolved_corrected' : 'resolved_upheld',
  };
}

/**
 * The candidate a corrected ruling produces.
 *
 * `resultVersion` is the challenged version plus one, so `plan.ts`'s existing stale-version
 * guard does the rest: if the match has moved on since the case was opened, the candidate is
 * a `noop` rather than a rollback of somebody else's newer result. That guard is why this
 * function does not need its own.
 *
 * The finalization key is the canonical three-part one, keyed on the CASE id, so re-running a
 * ruling — a retry, a redelivery, a second click — finds its own ledger entry and does nothing.
 */
export function buildCandidateFromResultCase(input: {
  resultCase: Pick<ResultCase,
    'id' | 'matchId' | 'leagueId' | 'seasonId' | 'sport' | 'subjectVersion' | 'evidence'>;
  ruling: ResultCaseRuling;
}): FinalizationCandidate {
  const { resultCase, ruling } = input;
  if (ruling.outcome !== 'corrected' || !ruling.correctedScore) {
    throw new Error('Only a corrected ruling produces a finalization candidate.');
  }

  const resultVersion = resultCase.subjectVersion + 1;
  const sport = resultCase.sport === 'basketball' || resultCase.sport === 'rugby'
    ? resultCase.sport
    : 'football';

  return {
    candidateId: candidateIdFor({
      sourceType: 'result_case',
      sourceRecordId: resultCase.id,
      sourceVersion: resultVersion,
    }),
    sourceVersion: resultVersion,
    matchId: resultCase.matchId,
    leagueId: resultCase.leagueId,
    seasonId: resultCase.seasonId,
    sport,
    homeScore: ruling.correctedScore.home,
    awayScore: ruling.correctedScore.away,
    scorers: ruling.correctedScorers ?? [],
    // The evidence the ruling was made on, as references. The case is first, so a reader
    // following provenance from the official version lands on the adjudication rather than on
    // one of the documents it weighed.
    evidenceRefs: [
      `resultCases/${resultCase.id}`,
      ...resultCase.evidence.map((entry) => `${entry.collection}/${entry.documentId}`),
    ],
    sourceType: 'result_case',
    sourceRecordId: resultCase.id,
    sourcePrincipal: { principalType: 'user', userId: ruling.decidedByUserId },
    // Already in the union and produced by nothing until now.
    confirmationProvenance: 'correction',
    submittedByUserId: ruling.decidedByUserId,
    submittedAt: ruling.decidedAt,
    resultVersion,
    finalizationKey: candidateFinalizationKey({
      matchId: resultCase.matchId,
      sourceRecordId: resultCase.id,
      resultVersion,
    }),
  };
}
