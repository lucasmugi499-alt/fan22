import { describe, expect, it } from 'vitest';
import { buildCandidateFromFieldReport, buildCandidateFromLegacySubmission, buildCandidateFromLeagueReport } from './candidate';
import { actorLabelFor, buildResultProvenance, workflowForSource } from './provenance';

const fieldCandidate = buildCandidateFromFieldReport({
  report: {
    id: 'report_381', matchId: 'match_1', leagueId: 'league_1', seasonId: 'season_1',
    declaredHomeScore: 2, declaredAwayScore: 1,
    reconstructedHomeScore: 2, reconstructedAwayScore: 1,
    assignmentId: 'fma_220', sessionId: 'mos_902', reportVersion: 4,
  },
  events: [],
  scoringEventTypes: [],
});

const legacyCandidate = buildCandidateFromLegacySubmission({
  id: 'match_1', matchId: 'match_1', leagueId: 'league_1', seasonId: 'season_1',
  submittedByUserId: 'user_9', submittedByTeamId: 'team_home',
  finalizationSource: 'mutual_confirmation',
});

const leagueCandidate = buildCandidateFromLeagueReport({
  matchId: 'match_1', leagueId: 'league_1', seasonId: 'season_1',
  homeScore: 1, awayScore: 1, enteredByUserId: 'league_admin_1', recordId: 'match_1',
});

describe('workflow, source, principal and quality are four facts', () => {
  it('describes a field capture result', () => {
    const provenance = buildResultProvenance({
      candidate: fieldCandidate,
      sportDefinitionVersion: '1.0.0',
      finalizedAt: '2026-08-25T17:00:00.000Z',
      quality: 'gold',
    });

    expect(provenance.workflow).toBe('result_engine_v2');
    expect(provenance.source).toEqual({ type: 'field_capture', recordId: 'report_381', recordVersion: 4 });
    expect(provenance.principal).toEqual({
      type: 'match_ops_session',
      actor: 'match_ops_session',
      matchSessionId: 'mos_902',
      fieldManagerAssignmentId: 'fma_220',
    });
    expect(provenance.finalization.candidateId).toBe('field_capture:report_381:v4');
    expect(provenance.quality).toBe('gold');
  });

  it('describes a league post-match entry', () => {
    const provenance = buildResultProvenance({
      candidate: leagueCandidate,
      sportDefinitionVersion: '1.0.0',
      finalizedAt: '2026-08-25T17:00:00.000Z',
      quality: 'bronze',
    });

    expect(provenance.workflow).toBe('result_engine_v2');
    expect(provenance.source.type).toBe('league_post_match');
    expect(provenance.principal).toMatchObject({ type: 'user', actor: 'league_admin', userId: 'league_admin_1' });
  });

  /**
   * History keeps its own words. A 2026 result that entered under the bilateral team workflow
   * says so forever: relabelling it into V2 terminology would make the provenance record
   * explain something that did not happen.
   */
  it('describes a legacy submission in its own vocabulary', () => {
    const provenance = buildResultProvenance({
      candidate: legacyCandidate,
      sportDefinitionVersion: '1.0.0',
      finalizedAt: '2026-08-25T17:00:00.000Z',
      quality: 'legacy',
    });

    expect(provenance.workflow).toBe('result_engine_v1');
    expect(provenance.source.type).toBe('legacy_team_submission');
    // `user` is the principal's type; `legacy_team_operator` is what the audit trail needs,
    // because "a user submitted it" loses that they acted for a club under a retired workflow.
    expect(provenance.principal.type).toBe('user');
    expect(provenance.principal.actor).toBe('legacy_team_operator');
  });

  it('derives the workflow from the source so the two cannot disagree', () => {
    expect(workflowForSource('legacy_team_submission')).toBe('result_engine_v1');
    expect(workflowForSource('field_capture')).toBe('result_engine_v2');
    expect(workflowForSource('league_post_match')).toBe('result_engine_v2');
    expect(workflowForSource('platform_exception_resolution')).toBe('result_engine_v2');
  });

  it('labels a system principal as the system whatever the source', () => {
    const systemCandidate = { ...fieldCandidate, sourcePrincipal: { principalType: 'system' as const, component: 'finalizer' } };

    expect(actorLabelFor(systemCandidate)).toBe('system');
  });

  it('records which planner and which sport definition decided the result', () => {
    // A result finalized under one set of sporting rules and one under a later set are not
    // comparable, and without this there is no way to tell them apart afterwards.
    const provenance = buildResultProvenance({
      candidate: fieldCandidate,
      sportDefinitionVersion: '1.0.0',
      finalizedAt: '2026-08-25T17:00:00.000Z',
      quality: 'gold',
    });

    expect(provenance.finalization.plannerVersion).toEqual(expect.any(String));
    expect(provenance.finalization.sportDefinitionVersion).toBe('1.0.0');
  });

  it('keeps the four facts in four places', () => {
    const provenance = buildResultProvenance({
      candidate: fieldCandidate, sportDefinitionVersion: '1.0.0',
      finalizedAt: '2026-08-25T17:00:00.000Z', quality: 'gold',
    });

    // No single field carries workflow, source and trust at once, which is the failure mode
    // this shape exists to prevent.
    expect(Object.keys(provenance).sort()).toEqual(['finalization', 'principal', 'quality', 'source', 'workflow']);
  });
});
