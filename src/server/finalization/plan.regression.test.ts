import { describe, expect, it } from 'vitest';
import type { Match } from '@/types';
import { buildCandidateFromFieldReport, buildCandidateFromLegacySubmission, type FinalizationCandidate } from './candidate';
import { planCandidateFinalization } from './plan';

/**
 * The canonical sports regression suite.
 *
 * The stable contract is `candidate -> plan`, and this suite owns it. Source loaders are tested
 * separately, for the narrower question of whether a raw record becomes the right candidate; the
 * emulator suite is tested separately again, for whether a plan commits atomically.
 *
 * Splitting it that way means a change to how field reports are stored cannot break the sports
 * decisions, and a change to the sports decisions is caught here rather than in a Firestore
 * transaction where the failure arrives as a write that did not happen.
 */

const MATCH: Pick<Match, 'id' | 'leagueId' | 'seasonId' | 'homeTeamId' | 'awayTeamId' | 'officialResultVersion'> = {
  id: 'match_1',
  leagueId: 'league_1',
  seasonId: 'season_1',
  homeTeamId: 'team_home',
  awayTeamId: 'team_away',
};

const NOW = '2026-08-25T17:00:00.000Z';

function candidate(overrides: Partial<FinalizationCandidate> = {}): FinalizationCandidate {
  return {
    ...buildCandidateFromLegacySubmission({
      id: 'match_1',
      matchId: 'match_1',
      leagueId: 'league_1',
      seasonId: 'season_1',
      sport: 'football',
      homeScore: 2,
      awayScore: 1,
      submittedByUserId: 'user_9',
      scorers: [
        { athleteId: 'a1', teamId: 'team_home', count: 2 },
        { athleteId: 'a2', teamId: 'team_away', count: 1 },
      ],
      finalizationSource: 'mutual_confirmation',
    }),
    ...overrides,
  };
}

function plan(input: Partial<Parameters<typeof planCandidateFinalization>[0]> = {}) {
  return planCandidateFinalization({
    candidate: candidate(),
    match: MATCH,
    processedKeys: [],
    now: NOW,
    ...input,
  });
}

describe('candidate to plan: the result itself', () => {
  it('plans the official score from the candidate', () => {
    const decision = plan();

    expect(decision.action).toBe('finalize');
    expect(decision.action === 'finalize' && decision.plan.match).toEqual({
      status: 'completed',
      verificationStatus: 'verified',
      score: { home: 2, away: 1 },
    });
  });

  it('advances the match lifecycle rather than waiting for somebody to flip it', () => {
    const decision = plan();

    expect(decision.action === 'finalize' && decision.plan.match.status).toBe('completed');
  });

  it.each([
    ['a draw', 1, 1],
    ['a goalless draw', 0, 0],
    ['a heavy win', 14, 0],
  ])('plans %s', (_label, home, away) => {
    const decision = plan({ candidate: candidate({ homeScore: home, awayScore: away }) });

    expect(decision.action === 'finalize' && decision.plan.match.score).toEqual({ home, away });
  });
});

describe('candidate to plan: refusals', () => {
  it('refuses a candidate whose match parents do not match', () => {
    // A result appearing on somebody else's fixture is the failure this prevents, and it is
    // cheap enough to check that there is no reason not to.
    expect(plan({ candidate: candidate({ leagueId: 'league_other' }) }))
      .toEqual({ action: 'noop', reason: 'mismatched_parents' });
    expect(plan({ candidate: candidate({ matchId: 'match_other' }) }))
      .toEqual({ action: 'noop', reason: 'mismatched_parents' });
    expect(plan({ candidate: candidate({ seasonId: 'season_other' }) }))
      .toEqual({ action: 'noop', reason: 'mismatched_parents' });
  });

  it('refuses a duplicate finalization request', () => {
    const key = candidate().finalizationKey;

    expect(plan({ processedKeys: [key] })).toEqual({ action: 'noop', reason: 'already_finalized' });
  });

  it('refuses a source that already believes it is final', () => {
    expect(plan({ alreadyFinalized: true })).toEqual({ action: 'noop', reason: 'already_finalized' });
  });

  /**
   * Firestore delivers at least once and does not guarantee ordering, so an old delivery can
   * arrive after a correction has already been made live. The ledger cannot catch this, because
   * each version has its own key, so the live version is compared directly.
   */
  it('refuses a stale source version', () => {
    expect(plan({ match: { ...MATCH, officialResultVersion: 3 }, candidate: candidate({ resultVersion: 2 }) }))
      .toEqual({ action: 'noop', reason: 'stale_version' });
  });

  it('refuses a version equal to the one already live', () => {
    // Equal, not merely lower: re-finalizing the live version would republish it with a new
    // ledger entry and a second set of canonical events.
    expect(plan({ match: { ...MATCH, officialResultVersion: 1 }, candidate: candidate({ resultVersion: 1 }) }))
      .toEqual({ action: 'noop', reason: 'stale_version' });
  });

  it('accepts a correction that supersedes the live version', () => {
    const decision = plan({
      match: { ...MATCH, officialResultVersion: 1 },
      candidate: candidate({ resultVersion: 2, finalizationKey: 'match_1:match_1:2' }),
    });

    expect(decision.action).toBe('finalize');
    expect(decision.action === 'finalize' && decision.plan.supersedesVersion).toBe(1);
  });

  it('supersedes nothing on a first result', () => {
    const decision = plan();

    expect(decision.action === 'finalize' && decision.plan.supersedesVersion).toBeUndefined();
  });
});

describe('candidate to plan: provenance is carried, not invented', () => {
  it('describes a bilateral result by how it was confirmed', () => {
    const mutual = plan({ candidate: candidate({ confirmationProvenance: 'mutual_confirmation' }) });
    const silence = plan({ candidate: candidate({ confirmationProvenance: 'league_admin_nonresponse_confirmation' }) });

    // The opponent agreeing and the opponent never replying are different evidence, and the
    // quality tier reads the difference.
    expect(mutual.action === 'finalize' && mutual.plan.sourceLifecycle.finalizationSource)
      .toBe('mutual_confirmation');
    expect(silence.action === 'finalize' && silence.plan.sourceLifecycle.finalizationSource)
      .toBe('league_admin_nonresponse_confirmation');
  });

  it('describes a field capture result as field capture', () => {
    const decision = plan({
      candidate: candidate({ sourceType: 'field_capture', confirmationProvenance: undefined }),
    });

    // No confirmation label is invented for one observer: there was no second party to agree.
    expect(decision.action === 'finalize' && decision.plan.sourceLifecycle.finalizationSource)
      .toBe('live_field_capture');
  });

  it('describes a league entry as a league entry', () => {
    const decision = plan({
      candidate: candidate({ sourceType: 'league_post_match', confirmationProvenance: undefined }),
    });

    expect(decision.action === 'finalize' && decision.plan.sourceLifecycle.finalizationSource)
      .toBe('league_post_match');
  });
});

describe('field capture candidates, per sport', () => {
  function fieldCandidate(sport: string, events: Parameters<typeof buildCandidateFromFieldReport>[0]['events'], scoringTypes: string[], score: { home: number; away: number }) {
    return buildCandidateFromFieldReport({
      report: {
        id: 'match_1', matchId: 'match_1', leagueId: 'league_1', seasonId: 'season_1', sport,
        declaredHomeScore: score.home, declaredAwayScore: score.away,
        reconstructedHomeScore: score.home, reconstructedAwayScore: score.away,
        assignmentId: 'fma_1', sessionId: 'mos_1', reportVersion: 1,
      },
      events,
      scoringEventTypes: scoringTypes,
    });
  }

  function event(overrides: Record<string, unknown> = {}) {
    return {
      eventType: 'football.goal',
      teamId: 'team_home',
      athleteId: 'a1',
      gameClockMs: 600_000,
      status: 'active',
      ...overrides,
    } as Parameters<typeof buildCandidateFromFieldReport>[0]['events'][number];
  }

  it('tallies football scorers from goals and scored penalties', () => {
    const built = fieldCandidate('football', [
      event(),
      event({ eventType: 'football.penalty_scored' }),
      event({ athleteId: 'a2', teamId: 'team_away' }),
    ], ['football.goal', 'football.penalty_scored'], { home: 2, away: 1 });

    expect(built.scorers).toEqual([
      { athleteId: 'a1', teamId: 'team_home', count: 2, minute: 10 },
      { athleteId: 'a2', teamId: 'team_away', count: 1, minute: 10 },
    ]);
  });

  it('tallies basketball from payload values, not event counts', () => {
    const built = fieldCandidate('basketball', [
      event({ eventType: 'basketball.points', payload: { value: 3 } }),
      event({ eventType: 'basketball.points', payload: { value: 2 } }),
    ], ['basketball.points'], { home: 5, away: 0 });

    // One event worth three, never three worth one: three events would put scoring actions in
    // the timeline that never happened.
    expect(built.scorers).toEqual([{ athleteId: 'a1', teamId: 'team_home', count: 5, minute: 10 }]);
  });

  it('tallies rugby across its scoring kinds', () => {
    const built = fieldCandidate('rugby', [
      event({ eventType: 'rugby.try' }),
      event({ eventType: 'rugby.conversion_made' }),
      event({ eventType: 'rugby.conversion_missed' }),
      event({ eventType: 'rugby.penalty_goal_made' }),
    ], ['rugby.try', 'rugby.conversion_made', 'rugby.penalty_goal_made'], { home: 10, away: 0 });

    // The missed conversion is a real event that contributes nothing.
    expect(built.scorers[0].count).toBe(3);
  });

  it('ignores an unsupported event type entirely', () => {
    const built = fieldCandidate('football', [
      event(),
      event({ eventType: 'football.corner_kick' }),
    ], ['football.goal'], { home: 1, away: 0 });

    expect(built.scorers).toEqual([{ athleteId: 'a1', teamId: 'team_home', count: 1, minute: 10 }]);
  });

  it('excludes a superseded event from the tally', () => {
    const built = fieldCandidate('football', [
      event({ status: 'superseded' }),
      event({ athleteId: 'a2' }),
    ], ['football.goal'], { home: 1, away: 0 });

    expect(built.scorers).toEqual([{ athleteId: 'a2', teamId: 'team_home', count: 1, minute: 10 }]);
  });

  it('excludes a quarantined event from the tally', () => {
    // A late sync from a replaced session is kept as evidence and contributes nothing until a
    // human decides it should.
    const built = fieldCandidate('football', [event({ status: 'quarantined' })], ['football.goal'], { home: 0, away: 0 });

    expect(built.scorers).toEqual([]);
  });

  it('counts a team-only event toward the score but attributes it to nobody', () => {
    const built = fieldCandidate('football', [event({ athleteId: null })], ['football.goal'], { home: 1, away: 0 });

    expect(built.scorers).toEqual([]);
    expect(built.homeScore).toBe(1);
  });

  it('plans a field candidate the same way it plans any other', () => {
    // The point of the contract: after the candidate, the planner cannot tell what produced it.
    const built = fieldCandidate('football', [event()], ['football.goal'], { home: 1, away: 0 });
    const decision = planCandidateFinalization({ candidate: built, match: MATCH, processedKeys: [], now: NOW });

    expect(decision.action === 'finalize' && decision.plan.match.score).toEqual({ home: 1, away: 0 });
  });
});

describe('bounded inputs', () => {
  it('plans a score at the top of the plausible range', () => {
    const decision = plan({ candidate: candidate({ homeScore: 200, awayScore: 0 }) });

    expect(decision.action).toBe('finalize');
  });

  it('carries a large scorer list without collapsing it', () => {
    const scorers = Array.from({ length: 40 }, (_, index) => ({
      athleteId: `a${index}`, teamId: 'team_home', count: 1,
    }));
    const decision = plan({ candidate: candidate({ scorers, homeScore: 40, awayScore: 0 }) });

    expect(decision.action === 'finalize' && decision.plan.match.score.home).toBe(40);
  });
});
