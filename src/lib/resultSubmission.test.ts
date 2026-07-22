import { describe, expect, it } from 'vitest';
import { ResultSubmission, ResultSubmissionActor, ResultSubmissionStatus } from '@/types';
import {
  actorsAllowedTo,
  canAcceptNewSubmission,
  canSubmitResultFor,
  canTransition,
  checkTransition,
  finalScore,
  isTerminal,
  matchVerificationFor,
  resolveActor,
} from './resultSubmission';

const ALL_STATUSES: ResultSubmissionStatus[] = [
  'pending_confirmation',
  'confirmed',
  'disputed',
  'official',
  'rejected',
  'withdrawn',
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
  'confirmed->official': ['system'],
  'confirmed->disputed': ['league_admin'],
  'disputed->confirmed': ['league_admin'],
  'disputed->rejected': ['league_admin'],
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
  it.each(['official', 'rejected', 'withdrawn'] as const)('%s cannot change', (status) => {
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
    for (const status of ['pending_confirmation', 'confirmed', 'disputed', 'official'] as const) {
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
