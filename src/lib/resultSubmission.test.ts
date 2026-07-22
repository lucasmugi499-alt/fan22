import { describe, expect, it } from 'vitest';
import { ResultSubmission, ResultSubmissionActor, ResultSubmissionStatus } from '@/types';
import {
  actorsAllowedTo,
  canAcceptNewSubmission,
  canSubmitResultFor,
  canTransition,
  checkCorrectionRequest,
  checkTransition,
  confirmationDeadlineFrom,
  dueReminders,
  finalizationKeyFor,
  finalizationSourceFor,
  finalScore,
  isConfirmationOverdue,
  isTerminal,
  matchVerificationFor,
  planFinalization,
  resolveActor,
} from './resultSubmission';

const ALL_STATUSES: ResultSubmissionStatus[] = [
  'pending_confirmation',
  'confirmation_overdue',
  'confirmed',
  'disputed',
  'official',
  'rejected',
  'withdrawn',
  'superseded',
];

const ALL_ACTORS: ResultSubmissionActor[] = [
  'submitting_team',
  'opponent_team',
  'league_admin',
  'system',
];

function submission(overrides: Partial<ResultSubmission> = {}): ResultSubmission {
  return {
    id: 'match_001',
    matchId: 'match_001',
    leagueId: 'league_001',
    seasonId: 'season_001',
    submittedByTeamId: 'team_a',
    opponentTeamId: 'team_b',
    submittedByUserId: 'user_a',
    homeScore: 2,
    awayScore: 1,
    scorers: [],
    evidenceRefs: [],
    status: 'pending_confirmation',
    revision: 1,
    submittedAsFinal: true,
    confirmationDeadline: '2026-03-04T00:00:00.000Z',
    resultVersion: 1,
    submittedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * The transition matrix is asserted exhaustively rather than by example. Every
 * (from, to, actor) triple is either explicitly permitted below or must be refused — an
 * unspecified combination is a hole in the trust model, not a detail.
 */
const PERMITTED: Record<string, ResultSubmissionActor[]> = {
  'pending_confirmation->confirmed': ['opponent_team', 'league_admin'],
  'pending_confirmation->disputed': ['opponent_team', 'league_admin'],
  'pending_confirmation->withdrawn': ['submitting_team'],
  'pending_confirmation->confirmation_overdue': ['system'],
  'confirmation_overdue->confirmed': ['opponent_team', 'league_admin'],
  'confirmation_overdue->disputed': ['opponent_team', 'league_admin'],
  'confirmation_overdue->pending_confirmation': ['league_admin'],
  'confirmation_overdue->rejected': ['league_admin'],
  'confirmed->official': ['system'],
  'confirmed->disputed': ['league_admin'],
  'disputed->confirmed': ['league_admin'],
  'disputed->rejected': ['league_admin'],
  'official->superseded': ['system'],
};

describe('transition matrix is exhaustive', () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      for (const actor of ALL_ACTORS) {
        const expected = (PERMITTED[`${from}->${to}`] ?? []).includes(actor);
        it(`${from} -> ${to} by ${actor}: ${expected ? 'allowed' : 'refused'}`, () => {
          expect(canTransition(from, to, actor)).toBe(expected);
        });
      }
    }
  }
});

describe('only the system can make a result official', () => {
  it('lists system as the sole actor for confirmed -> official', () => {
    expect(actorsAllowedTo('confirmed', 'official')).toEqual(['system']);
  });

  it('refuses every human actor', () => {
    for (const actor of ['submitting_team', 'opponent_team', 'league_admin'] as const) {
      const result = checkTransition({ submission: submission({ status: 'confirmed' }), to: 'official', actor });
      expect(result.ok).toBe(false);
    }
  });

  it('offers no path to official from anywhere but confirmed', () => {
    for (const from of ALL_STATUSES.filter((s) => s !== 'confirmed')) {
      expect(actorsAllowedTo(from, 'official')).toEqual([]);
    }
  });
});

describe('a team cannot confirm its own result', () => {
  it('refuses the submitting team even though the transition itself is legal', () => {
    const result = checkTransition({
      submission: submission(),
      to: 'confirmed',
      actor: 'submitting_team',
    });
    expect(result).toMatchObject({ ok: false, reason: 'actor_not_permitted' });
  });

  it('treats an admin who runs the submitting team as the submitting team', () => {
    // Someone who is both league admin and team admin must not confirm their own claim by
    // switching hats.
    const actor = resolveActor(submission(), {
      teamIdsAdministered: ['team_a'],
      isLeagueAdminForLeague: true,
    });
    expect(actor).toBe('submitting_team');
  });

  it('gives no standing to an unrelated user', () => {
    expect(
      resolveActor(submission(), { teamIdsAdministered: ['team_z'], isLeagueAdminForLeague: false })
    ).toBeNull();
  });

  it('recognises the opponent', () => {
    expect(
      resolveActor(submission(), { teamIdsAdministered: ['team_b'], isLeagueAdminForLeague: false })
    ).toBe('opponent_team');
  });
});

describe('terminal states', () => {
  it.each(['rejected', 'withdrawn', 'superseded'] as const)('%s cannot change', (status) => {
    for (const to of ALL_STATUSES) {
      for (const actor of ALL_ACTORS) {
        expect(checkTransition({ submission: submission({ status }), to, actor })).toMatchObject({
          ok: false,
        });
      }
    }
    expect(isTerminal(status)).toBe(true);
  });
});

describe('concurrent submissions', () => {
  it('refuses a second submission while one is live', () => {
    for (const status of ['pending_confirmation', 'confirmation_overdue', 'confirmed', 'disputed', 'official'] as const) {
      expect(canAcceptNewSubmission(submission({ status }))).toBe(false);
    }
  });

  it('allows a replacement only after rejection or withdrawal', () => {
    expect(canAcceptNewSubmission(submission({ status: 'rejected' }))).toBe(true);
    expect(canAcceptNewSubmission(submission({ status: 'withdrawn' }))).toBe(true);
  });

  it('allows the first submission for a match', () => {
    expect(canAcceptNewSubmission(undefined)).toBe(true);
  });
});

describe('league adjudication', () => {
  it('requires a score when the resolution corrects one', () => {
    expect(
      checkTransition({
        submission: submission({ status: 'disputed' }),
        to: 'confirmed',
        actor: 'league_admin',
        resolution: 'league_corrected',
      })
    ).toMatchObject({ ok: false, reason: 'correction_requires_score' });
  });

  it('accepts a correction carrying its score', () => {
    expect(
      checkTransition({
        submission: submission({ status: 'disputed' }),
        to: 'confirmed',
        actor: 'league_admin',
        resolution: 'league_corrected',
        correctedScore: { home: 1, away: 1 },
      })
    ).toEqual({ ok: true });
  });

  it('sends the adjudicated score to the official record, not the claimed one', () => {
    const corrected = submission({ correctedHomeScore: 1, correctedAwayScore: 1 });
    expect(finalScore(corrected)).toEqual({ home: 1, away: 1 });
    expect(finalScore(submission())).toEqual({ home: 2, away: 1 });
  });
});

describe('eligibility to submit', () => {
  it('requires a match that has been played', () => {
    expect(canSubmitResultFor({ status: 'completed', verificationStatus: 'pending' })).toBe(true);
    expect(canSubmitResultFor({ status: 'live', verificationStatus: 'pending' })).toBe(true);
    expect(canSubmitResultFor({ status: 'scheduled', verificationStatus: 'pending' })).toBe(false);
    expect(canSubmitResultFor({ status: 'cancelled', verificationStatus: 'pending' })).toBe(false);
  });

  it('refuses a match whose result is already official', () => {
    expect(canSubmitResultFor({ status: 'completed', verificationStatus: 'verified' })).toBe(false);
  });
});

describe('match verification mirrors the submission', () => {
  it('only marks the match verified once the submission is official', () => {
    expect(matchVerificationFor('official')).toBe('verified');
    expect(matchVerificationFor('confirmed')).toBe('pending');
    expect(matchVerificationFor('pending_confirmation')).toBe('pending');
    expect(matchVerificationFor('disputed')).toBe('disputed');
    expect(matchVerificationFor('rejected')).toBe('rejected');
  });
});

describe('72h confirmation window (decision 1: silence is never consent)', () => {
  const submittedAt = '2026-03-01T00:00:00.000Z';

  it('sets the deadline 72 hours after submission', () => {
    expect(confirmationDeadlineFrom(submittedAt)).toBe('2026-03-04T00:00:00.000Z');
  });

  it('reminds at 24h and 48h, not before', () => {
    expect(dueReminders(submittedAt, '2026-03-01T12:00:00.000Z')).toEqual([]);
    expect(dueReminders(submittedAt, '2026-03-02T00:00:00.000Z')).toEqual([24]);
    expect(dueReminders(submittedAt, '2026-03-03T00:00:00.000Z')).toEqual([24, 48]);
  });

  it('escalates at the deadline instead of confirming', () => {
    const s = submission({ confirmationDeadline: '2026-03-04T00:00:00.000Z' });
    expect(isConfirmationOverdue(s, '2026-03-03T23:59:00.000Z')).toBe(false);
    expect(isConfirmationOverdue(s, '2026-03-04T00:00:00.000Z')).toBe(true);

    // The only transition the deadline unlocks is escalation. Nothing auto-confirms.
    expect(actorsAllowedTo('pending_confirmation', 'confirmation_overdue')).toEqual(['system']);
    expect(actorsAllowedTo('confirmation_overdue', 'official')).toEqual([]);
  });

  it('leaves the league four options once overdue, none of them automatic', () => {
    const from: ResultSubmissionStatus = 'confirmation_overdue';
    const leagueCan = ALL_STATUSES.filter((to) => canTransition(from, to, 'league_admin'));
    expect(leagueCan.sort()).toEqual(['confirmed', 'disputed', 'pending_confirmation', 'rejected']);
  });

  it('still lets a late opponent respond, and keeps mutual provenance when they do', () => {
    expect(canTransition('confirmation_overdue', 'confirmed', 'opponent_team')).toBe(true);
    expect(
      finalizationSourceFor({ previousStatus: 'confirmation_overdue', actor: 'opponent_team' })
    ).toBe('mutual_confirmation');
  });

  it('records league confirmation after silence as weaker provenance', () => {
    expect(
      finalizationSourceFor({ previousStatus: 'confirmation_overdue', actor: 'league_admin' })
    ).toBe('league_admin_nonresponse_confirmation');
    expect(
      finalizationSourceFor({ previousStatus: 'disputed', actor: 'league_admin' })
    ).toBe('league_admin_dispute_resolution');
  });
});

describe('finalization is idempotent (decision 2)', () => {
  const match = {
    id: 'match_001',
    leagueId: 'league_001',
    seasonId: 'season_001',
    homeTeamId: 'team_a',
    awayTeamId: 'team_b',
  };
  const now = '2026-03-05T00:00:00.000Z';

  it('produces a stable key per match, submission and version', () => {
    expect(finalizationKeyFor(submission())).toBe('match_001:match_001:1');
    expect(finalizationKeyFor(submission({ resultVersion: 2 }))).toBe('match_001:match_001:2');
  });

  it('finalizes a confirmed submission once', () => {
    const decision = planFinalization({
      submission: submission({ status: 'confirmed' }),
      match,
      processedKeys: [],
      now,
    });
    expect(decision.action).toBe('finalize');
    if (decision.action !== 'finalize') throw new Error('expected finalize');
    expect(decision.plan.match).toMatchObject({
      status: 'completed',
      verificationStatus: 'verified',
      score: { home: 2, away: 1 },
    });
  });

  it('no-ops when the key was already processed (retry or sweep)', () => {
    expect(
      planFinalization({
        submission: submission({ status: 'confirmed' }),
        match,
        processedKeys: ['match_001:match_001:1'],
        now,
      })
    ).toEqual({ action: 'noop', reason: 'already_finalized' });
  });

  it('no-ops when finalizedAt is already set', () => {
    expect(
      planFinalization({
        submission: submission({ status: 'confirmed', finalizedAt: now }),
        match,
        processedKeys: [],
        now,
      })
    ).toEqual({ action: 'noop', reason: 'already_finalized' });
  });

  it('refuses to finalize onto a match from another league or season', () => {
    for (const bad of [{ leagueId: 'league_999' }, { seasonId: 'season_999' }, { id: 'match_999' }]) {
      expect(
        planFinalization({
          submission: submission({ status: 'confirmed' }),
          match: { ...match, ...bad },
          processedKeys: [],
          now,
        })
      ).toEqual({ action: 'noop', reason: 'mismatched_parents' });
    }
  });

  it('never finalizes anything that is not confirmed', () => {
    for (const status of ALL_STATUSES.filter((s) => s !== 'confirmed')) {
      expect(
        planFinalization({ submission: submission({ status }), match, processedKeys: [], now })
      ).toEqual({ action: 'noop', reason: 'not_finalizable' });
    }
  });

  it('writes the adjudicated score, not the claimed one', () => {
    const decision = planFinalization({
      submission: submission({ status: 'confirmed', correctedHomeScore: 0, correctedAwayScore: 3 }),
      match,
      processedKeys: [],
      now,
    });
    if (decision.action !== 'finalize') throw new Error('expected finalize');
    expect(decision.plan.match.score).toEqual({ home: 0, away: 3 });
  });
});

describe('versioned corrections (decision 3)', () => {
  const finalizedAt = '2026-03-05T00:00:00.000Z';

  it('does not treat an official result as permanently terminal', () => {
    expect(isTerminal('official')).toBe(false);
    expect(canTransition('official', 'superseded', 'system')).toBe(true);
  });

  it('still refuses to let anyone edit an official result in place', () => {
    for (const actor of ['submitting_team', 'opponent_team', 'league_admin'] as const) {
      expect(
        checkTransition({ submission: submission({ status: 'official' }), to: 'confirmed', actor })
      ).toMatchObject({ ok: false, reason: 'official_requires_correction' });
    }
  });

  it('requires a stated reason', () => {
    expect(
      checkCorrectionRequest({
        submission: { status: 'official', finalizedAt },
        approvedByPlatformAdmin: false,
        now: finalizedAt,
      })
    ).toMatchObject({ ok: false, reason: 'correction_requires_reason' });
  });

  it('allows a league admin to correct inside the 72h grace window', () => {
    expect(
      checkCorrectionRequest({
        submission: { status: 'official', finalizedAt },
        reason: 'Referee report corrected the second try.',
        approvedByPlatformAdmin: false,
        now: '2026-03-07T00:00:00.000Z',
      })
    ).toEqual({ ok: true });
  });

  it('escalates to platform approval after the grace window', () => {
    const late = '2026-03-10T00:00:00.000Z';
    expect(
      checkCorrectionRequest({
        submission: { status: 'official', finalizedAt },
        reason: 'Eligibility ruling.',
        approvedByPlatformAdmin: false,
        now: late,
      })
    ).toMatchObject({ ok: false, reason: 'actor_not_permitted' });

    expect(
      checkCorrectionRequest({
        submission: { status: 'official', finalizedAt },
        reason: 'Eligibility ruling.',
        approvedByPlatformAdmin: true,
        now: late,
      })
    ).toEqual({ ok: true });
  });
});

describe('submitting from a live match (decision 4)', () => {
  it('accepts live or completed, and nothing else', () => {
    expect(canSubmitResultFor({ status: 'live', verificationStatus: 'pending' })).toBe(true);
    expect(canSubmitResultFor({ status: 'completed', verificationStatus: 'pending' })).toBe(true);
    expect(canSubmitResultFor({ status: 'scheduled', verificationStatus: 'pending' })).toBe(false);
  });

  it('advances the match lifecycle on finalization rather than relying on a manual flip', () => {
    const decision = planFinalization({
      submission: submission({ status: 'confirmed' }),
      match: {
        id: 'match_001',
        leagueId: 'league_001',
        seasonId: 'season_001',
        homeTeamId: 'team_a',
        awayTeamId: 'team_b',
      },
      processedKeys: [],
      now: '2026-03-05T00:00:00.000Z',
    });
    if (decision.action !== 'finalize') throw new Error('expected finalize');
    expect(decision.plan.match.status).toBe('completed');
  });
});

describe('stale finalization cannot overwrite a newer official result', () => {
  const baseMatch = {
    id: 'match_001',
    leagueId: 'league_001',
    seasonId: 'season_001',
    homeTeamId: 'team_a',
    awayTeamId: 'team_b',
  };
  const now = '2026-03-05T00:00:00.000Z';

  it('refuses a version older than the live one', () => {
    // Firestore delivers events at least once with no ordering guarantee, so a v1 event can
    // arrive after a v2 correction is already live. The ledger cannot catch this: v1 and v2
    // have different finalization keys.
    expect(
      planFinalization({
        submission: submission({ status: 'confirmed', resultVersion: 1 }),
        match: { ...baseMatch, officialResultVersion: 2 },
        processedKeys: [],
        now,
      })
    ).toEqual({ action: 'noop', reason: 'stale_version' });
  });

  it('refuses re-finalizing the version already live', () => {
    expect(
      planFinalization({
        submission: submission({ status: 'confirmed', resultVersion: 2 }),
        match: { ...baseMatch, officialResultVersion: 2 },
        processedKeys: [],
        now,
      })
    ).toEqual({ action: 'noop', reason: 'stale_version' });
  });

  it('accepts a correction that is genuinely newer, and archives the version it replaces', () => {
    const decision = planFinalization({
      submission: submission({ status: 'confirmed', resultVersion: 2 }),
      match: { ...baseMatch, officialResultVersion: 1 },
      processedKeys: [],
      now,
    });
    if (decision.action !== 'finalize') throw new Error('expected finalize');
    expect(decision.plan.resultVersion).toBe(2);
    expect(decision.plan.supersedesVersion).toBe(1);
  });

  it('has no version to supersede for a first result', () => {
    const decision = planFinalization({
      submission: submission({ status: 'confirmed' }),
      match: baseMatch,
      processedKeys: [],
      now,
    });
    if (decision.action !== 'finalize') throw new Error('expected finalize');
    expect(decision.plan.supersedesVersion).toBeUndefined();
  });

  it('gives a correction its own ledger key, distinct from the original', () => {
    expect(finalizationKeyFor(submission({ resultVersion: 1 }))).not.toBe(
      finalizationKeyFor(submission({ resultVersion: 2 }))
    );
  });
});

describe('trigger and sweep converge on the same outcome', () => {
  const match = {
    id: 'match_001',
    leagueId: 'league_001',
    seasonId: 'season_001',
    homeTeamId: 'team_a',
    awayTeamId: 'team_b',
  };
  const now = '2026-03-05T00:00:00.000Z';

  it('sweep no-ops after the trigger has finalized', () => {
    const finalized = submission({ status: 'official', finalizedAt: now });
    expect(planFinalization({ submission: finalized, match, processedKeys: [], now })).toEqual({
      action: 'noop',
      reason: 'not_finalizable',
    });
  });

  it('trigger no-ops after the sweep has finalized', () => {
    // The sweep wrote the ledger entry; a late trigger sees it and stops.
    expect(
      planFinalization({
        submission: submission({ status: 'confirmed' }),
        match,
        processedKeys: ['match_001:match_001:1'],
        now,
      })
    ).toEqual({ action: 'noop', reason: 'already_finalized' });
  });
});
