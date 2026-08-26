import type { Principal, PrincipalType } from '../../kernel/principal';
import type { FinalizationCandidate } from './candidate';
import type { QualityTier } from './quality';

/**
 * How an official result came to be official.
 *
 * Four facts, deliberately not one field. They answer different questions, and every time this
 * codebase has folded two of them together the result has been a field that quietly means two
 * things:
 *
 *   workflow  which operating model produced this. V1 or V2.
 *   source    what kind of record it came from, and which version of that record.
 *   principal who acted. A user, a match ops session, or the system.
 *   quality   how much it should be trusted, computed from evidence.
 *
 * A single `source` enum accumulating `mutual_confirmation`, `field_capture` and
 * `league_admin_nonresponse_confirmation` would be mixing all four: two of those are
 * confirmations within one workflow and one is a different workflow entirely.
 *
 * ## History keeps its own words
 *
 * A 2026 result that entered under the bilateral team workflow says so, forever. It is not
 * relabelled into V2 terminology, because the provenance record exists to explain what actually
 * happened and a normalized history explains something that did not.
 */

export type ResultWorkflow = 'result_engine_v1' | 'result_engine_v2';

/**
 * Which operating model produced this result.
 *
 * Derived from the source rather than stored alongside it, so the two cannot disagree. A legacy
 * team submission is V1 by definition: it is the bilateral workflow, whatever else is true.
 */
export function workflowForSource(sourceType: FinalizationCandidate['sourceType']): ResultWorkflow {
  return sourceType === 'legacy_team_submission' ? 'result_engine_v1' : 'result_engine_v2';
}

/**
 * The actor's kind, in the vocabulary an audit trail should use.
 *
 * `legacy_team_operator` rather than `user` for a V1 submission, because "a user submitted it"
 * loses the fact that it was submitted by somebody acting for a club under a workflow that no
 * longer exists. That distinction is the whole reason the historical records are kept.
 */
export type ActorLabel =
  | 'match_ops_session'
  | 'league_admin'
  | 'legacy_team_operator'
  | 'platform_admin'
  | 'system';

export function actorLabelFor(candidate: FinalizationCandidate): ActorLabel {
  if (candidate.sourcePrincipal.principalType === 'match_ops_session') return 'match_ops_session';
  if (candidate.sourcePrincipal.principalType === 'system') return 'system';
  switch (candidate.sourceType) {
    case 'legacy_team_submission':
      return 'legacy_team_operator';
    case 'platform_exception_resolution':
      return 'platform_admin';
    default:
      return 'league_admin';
  }
}

export type ResultProvenance = {
  workflow: ResultWorkflow;
  source: {
    type: FinalizationCandidate['sourceType'];
    recordId: string;
    /** Which version of that record. A re-attested report is a different version. */
    recordVersion: number;
  };
  principal: {
    type: PrincipalType;
    /** The vocabulary an audit trail reads, which is not always the principal's type. */
    actor: ActorLabel;
    userId?: string;
    matchSessionId?: string;
    fieldManagerAssignmentId?: string;
  };
  finalization: {
    candidateId: string;
    /**
     * Which planner decided this.
     *
     * A result finalized under one set of sporting rules and one under a later set are not
     * comparable, and without this recorded there is no way to tell them apart afterwards. It
     * is the same reason rule-pack versions bind to a match.
     */
    plannerVersion: string;
    sportDefinitionVersion: string;
    finalizedAt: string;
  };
  quality: QualityTier;
};

/**
 * The planner's own version.
 *
 * Bumped whenever the decisions this planner makes change, not when the file is edited. A
 * comment change is not a different planner; a change to what counts as a scoring event is.
 */
export const FINALIZATION_PLANNER_VERSION = '2.0.0';

function principalDetail(principal: Principal) {
  switch (principal.principalType) {
    case 'user':
      return { userId: principal.userId };
    case 'match_ops_session':
      return {
        matchSessionId: principal.matchSessionId,
        fieldManagerAssignmentId: principal.fieldManagerAssignmentId,
      };
    case 'system':
      return {};
  }
}

export function buildResultProvenance(input: {
  candidate: FinalizationCandidate;
  sportDefinitionVersion: string;
  finalizedAt: string;
  quality: QualityTier;
}): ResultProvenance {
  const { candidate } = input;
  return {
    workflow: workflowForSource(candidate.sourceType),
    source: {
      type: candidate.sourceType,
      recordId: candidate.sourceRecordId,
      recordVersion: candidate.sourceVersion,
    },
    principal: {
      type: candidate.sourcePrincipal.principalType,
      actor: actorLabelFor(candidate),
      ...principalDetail(candidate.sourcePrincipal),
    },
    finalization: {
      candidateId: candidate.candidateId,
      plannerVersion: FINALIZATION_PLANNER_VERSION,
      sportDefinitionVersion: input.sportDefinitionVersion,
      finalizedAt: input.finalizedAt,
    },
    quality: input.quality,
  };
}
