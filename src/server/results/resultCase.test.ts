import { describe, expect, it } from 'vitest';
import {
  buildCandidateFromResultCase,
  decideCaseAction,
  decideOpenCase,
  isTerminal,
  resultCaseId,
  type ResultCase,
  type ResultCaseRuling,
} from './resultCase';

/**
 * Corrections were bolted to the legacy path: the correction route loaded
 * `resultSubmissions/{matchId}` and worked on it. A result that became official through V2
 * field capture has no such document, so a wrong verified result from the platform's own
 * primary intake could not be corrected through the product at all.
 */

const CASE: ResultCase = {
  id: resultCaseId('match_1', 1),
  matchId: 'match_1',
  leagueId: 'league_1',
  seasonId: 'season_1',
  sport: 'football',
  subjectVersion: 1,
  subjectProvenance: null,
  status: 'under_review',
  openedByUserId: 'user_club',
  openedByScope: { scopeType: 'team', scopeId: 'team_home' },
  reason: 'The second goal was credited to the wrong athlete.',
  openedAt: '2026-08-30T18:00:00.000Z',
  evidence: [{
    collection: 'matchReports', documentId: 'match_1',
    addedByUserId: 'user_club', addedAt: '2026-08-30T18:00:00.000Z',
  }],
  updatedAt: '2026-08-30T18:00:00.000Z',
};

const RULING: ResultCaseRuling = {
  decidedByUserId: 'user_league',
  decidedAt: '2026-08-31T09:00:00.000Z',
  outcome: 'corrected',
  rationale: 'Video shows the goal was scored by athlete_9.',
  correctedScore: { home: 2, away: 1 },
};

describe('a case is tied to the exact version it challenges', () => {
  it('opens against the current official version', () => {
    expect(decideOpenCase({
      matchId: 'match_1', officialResultVersion: 1, subjectVersion: 1, existingCases: [],
    })).toEqual({ ok: true, caseId: 'match_1__case1', sequence: 1 });
  });

  it('refuses a case opened against a version the match has moved past', () => {
    // Two people looking at a match, one on a stale page. Without this the stale one opens a
    // case about a result that no longer exists.
    const decision = decideOpenCase({
      matchId: 'match_1', officialResultVersion: 3, subjectVersion: 1, existingCases: [],
    });
    expect(decision.ok).toBe(false);
    expect((decision as { reason: string }).reason).toContain('official version 3');
  });

  it('refuses a case on a match with no official result at all', () => {
    // A result that is not yet official is changed through the workflow producing it.
    expect(decideOpenCase({
      matchId: 'match_1', officialResultVersion: undefined, subjectVersion: 1, existingCases: [],
    }).ok).toBe(false);
  });
});

describe('one adjudication at a time, and a new case for each correction', () => {
  it('refuses a second case while one is active', () => {
    // Two people adjudicating the same result concurrently is how a match ends up with two
    // rulings that disagree.
    const decision = decideOpenCase({
      matchId: 'match_1', officialResultVersion: 1, subjectVersion: 1,
      existingCases: [{ id: 'match_1__case1', status: 'under_review', subjectVersion: 1 }],
    });
    expect(decision.ok).toBe(false);
    expect((decision as { reason: string }).reason).toContain('match_1__case1');
  });

  it('allows a new case once the previous one closed, and sequences it', () => {
    // Correcting a correction is a second case against the version the first one produced.
    expect(decideOpenCase({
      matchId: 'match_1', officialResultVersion: 2, subjectVersion: 2,
      existingCases: [{ id: 'match_1__case1', status: 'resolved_corrected', subjectVersion: 1 }],
    })).toEqual({ ok: true, caseId: 'match_1__case2', sequence: 2 });
  });

  it('treats every ending as an ending', () => {
    for (const status of ['resolved_upheld', 'resolved_corrected', 'withdrawn', 'superseded'] as const) {
      expect(isTerminal(status)).toBe(true);
    }
    for (const status of ['open', 'under_review', 'proposed', 'escalated'] as const) {
      expect(isTerminal(status)).toBe(false);
    }
  });
});

describe('a resolved ruling is a record, not a draft', () => {
  it('refuses every action on a closed case', () => {
    for (const action of ['claim', 'propose', 'escalate', 'rule', 'withdraw', 'evidence'] as const) {
      const decision = decideCaseAction({
        action, status: 'resolved_corrected', actorUserId: 'user_league',
        openedByUserId: 'user_club', adjudicates: true, conflicted: false, outcome: 'upheld',
      });
      expect(decision.ok).toBe(false);
      expect((decision as { status: number }).status).toBe(409);
    }
  });
});

describe('a conflicted adjudicator may prepare a decision but not make it', () => {
  const conflicted = {
    status: 'under_review' as const, actorUserId: 'user_league',
    openedByUserId: 'user_club', adjudicates: true, conflicted: true,
  };

  it('refuses to let them rule', () => {
    const decision = decideCaseAction({ ...conflicted, action: 'rule', outcome: 'corrected' });
    expect(decision.ok).toBe(false);
    expect((decision as { status: number }).status).toBe(403);
    expect((decision as { reason: string }).reason).toContain('affiliated');
  });

  it('lets them propose', () => {
    // Escalation must not leave the person who knows the competition sitting idle while
    // Platform reconstructs context they do not have.
    expect(decideCaseAction({ ...conflicted, action: 'propose' }))
      .toEqual({ ok: true, nextStatus: 'proposed' });
  });

  it('lets them escalate', () => {
    expect(decideCaseAction({ ...conflicted, action: 'escalate' }))
      .toEqual({ ok: true, nextStatus: 'escalated' });
  });

  it('lets somebody unconflicted rule', () => {
    expect(decideCaseAction({ ...conflicted, conflicted: false, action: 'rule', outcome: 'corrected' }))
      .toEqual({ ok: true, nextStatus: 'resolved_corrected' });
    expect(decideCaseAction({ ...conflicted, conflicted: false, action: 'rule', outcome: 'upheld' }))
      .toEqual({ ok: true, nextStatus: 'resolved_upheld' });
  });
});

describe('who may act at all', () => {
  const base = {
    status: 'open' as const, openedByUserId: 'user_club', conflicted: false,
  };

  it('refuses adjudication to somebody without the capability', () => {
    for (const action of ['claim', 'propose', 'escalate', 'rule'] as const) {
      const decision = decideCaseAction({
        ...base, action, actorUserId: 'user_stranger', adjudicates: false,
      });
      expect(decision.ok).toBe(false);
      expect((decision as { status: number }).status).toBe(403);
    }
  });

  it('lets anybody add evidence, including the club that raised it', () => {
    // Refusing a club's evidence on their own fixture is how adjudication loses the one party
    // that was actually there. Evidence is append-only and grants no authority.
    expect(decideCaseAction({
      ...base, action: 'evidence', actorUserId: 'user_club', adjudicates: false,
    })).toEqual({ ok: true, nextStatus: 'open' });
  });

  it('lets only the raiser withdraw', () => {
    expect(decideCaseAction({
      ...base, action: 'withdraw', actorUserId: 'user_club', adjudicates: false,
    })).toEqual({ ok: true, nextStatus: 'withdrawn' });

    // Withdrawal by anybody else is a rejection, and a rejection is a ruling that has to be
    // reasoned and recorded.
    expect(decideCaseAction({
      ...base, action: 'withdraw', actorUserId: 'user_league', adjudicates: true,
    }).ok).toBe(false);
  });
});

describe('the candidate a corrected ruling produces', () => {
  it('supersedes exactly the version the case challenged', () => {
    const candidate = buildCandidateFromResultCase({ resultCase: CASE, ruling: RULING });
    expect(candidate.resultVersion).toBe(CASE.subjectVersion + 1);
  });

  it('enters the finalizer as its own source rather than impersonating another', () => {
    const candidate = buildCandidateFromResultCase({ resultCase: CASE, ruling: RULING });
    expect(candidate.sourceType).toBe('result_case');
    expect(candidate.sourceRecordId).toBe(CASE.id);
    // Already in the union, produced by nothing until now.
    expect(candidate.confirmationProvenance).toBe('correction');
  });

  it('is deterministic, so a retry finds its own ledger entry and does nothing', () => {
    const first = buildCandidateFromResultCase({ resultCase: CASE, ruling: RULING });
    const second = buildCandidateFromResultCase({ resultCase: CASE, ruling: RULING });
    expect(first.finalizationKey).toBe(second.finalizationKey);
    expect(first.candidateId).toBe(second.candidateId);
  });

  it('keys on the case, so two cases on one match do not collide', () => {
    const later = buildCandidateFromResultCase({
      resultCase: { ...CASE, id: resultCaseId('match_1', 2), subjectVersion: 2 },
      ruling: RULING,
    });
    const first = buildCandidateFromResultCase({ resultCase: CASE, ruling: RULING });
    expect(later.finalizationKey).not.toBe(first.finalizationKey);
  });

  it('points provenance at the adjudication first, then at what it weighed', () => {
    const candidate = buildCandidateFromResultCase({ resultCase: CASE, ruling: RULING });
    expect(candidate.evidenceRefs[0]).toBe(`resultCases/${CASE.id}`);
    expect(candidate.evidenceRefs).toContain('matchReports/match_1');
  });

  it('carries the corrected score and nothing invented', () => {
    const candidate = buildCandidateFromResultCase({ resultCase: CASE, ruling: RULING });
    expect(candidate.homeScore).toBe(2);
    expect(candidate.awayScore).toBe(1);
  });

  it('refuses to build one for a ruling that upheld the result', () => {
    // An upheld ruling changes nothing, so producing a candidate for it would write a new
    // official version identical to the old one and bump every downstream projection for it.
    expect(() => buildCandidateFromResultCase({
      resultCase: CASE, ruling: { ...RULING, outcome: 'upheld', correctedScore: undefined },
    })).toThrow(/only a corrected ruling/i);
  });

  it('normalizes an unknown sport rather than inventing one', () => {
    const candidate = buildCandidateFromResultCase({
      resultCase: { ...CASE, sport: 'kabaddi' }, ruling: RULING,
    });
    expect(candidate.sport).toBe('football');
  });
});
