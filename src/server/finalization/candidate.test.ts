import { describe, expect, it } from 'vitest';
import {
  candidateFromMatchReport,
  candidateFromPostMatchEntry,
  candidateFromResultSubmission,
  candidateFinalizationKey,
} from './candidate';

describe('three sources, one candidate', () => {
  it('adapts a legacy bilateral submission', () => {
    const candidate = candidateFromResultSubmission({
      id: 'match_1',
      matchId: 'match_1',
      leagueId: 'league_1',
      seasonId: 'season_1',
      sport: 'football',
      homeScore: 2,
      awayScore: 1,
      submittedByUserId: 'user_9',
      scorers: [{ athleteId: 'a1', teamId: 'team_home', count: 2 }],
      resultVersion: 1,
    });

    expect(candidate).toMatchObject({
      sourceType: 'legacy_team_submission',
      sourceRecordId: 'match_1',
      sourcePrincipal: { principalType: 'user', userId: 'user_9' },
      homeScore: 2,
      finalizationKey: 'match_1:match_1:1',
    });
  });

  /**
   * The score comes from the reconstruction, not the declaration. Collecting both is how the
   * events are checked for completeness; it is not two opinions about the result.
   */
  it('adapts a field report using the reconstructed score', () => {
    const candidate = candidateFromMatchReport({
      report: {
        id: 'match_1',
        matchId: 'match_1',
        leagueId: 'league_1',
        seasonId: 'season_1',
        sport: 'football',
        declaredHomeScore: 3,
        declaredAwayScore: 1,
        reconstructedHomeScore: 3,
        reconstructedAwayScore: 1,
        assignmentId: 'fma_1',
        sessionId: 'mos_1',
      },
      events: [
        { eventType: 'football.goal', teamId: 'team_home', athleteId: 'a1', gameClockMs: 480_000, status: 'active' },
        { eventType: 'football.goal', teamId: 'team_home', athleteId: 'a1', gameClockMs: 900_000, status: 'active' },
        { eventType: 'football.goal', teamId: 'team_away', athleteId: 'a2', gameClockMs: 1_500_000, status: 'active' },
      ],
      scoringEventTypes: ['football.goal'],
    });

    expect(candidate.homeScore).toBe(3);
    expect(candidate.sourcePrincipal).toEqual({
      principalType: 'match_ops_session',
      matchSessionId: 'mos_1',
      fieldManagerAssignmentId: 'fma_1',
    });
    expect(candidate.scorers).toEqual([
      { athleteId: 'a1', teamId: 'team_home', count: 2, minute: 8 },
      { athleteId: 'a2', teamId: 'team_away', count: 1, minute: 25 },
    ]);
  });

  it('ignores superseded events when tallying scorers', () => {
    // A corrected goal must not count twice. The original keeps its place in the record and
    // stops contributing to the result, which is the whole point of superseding rather than
    // deleting.
    const candidate = candidateFromMatchReport({
      report: {
        id: 'match_1', matchId: 'match_1', leagueId: 'league_1',
        declaredHomeScore: 1, declaredAwayScore: 0,
        reconstructedHomeScore: 1, reconstructedAwayScore: 0,
      },
      events: [
        { eventType: 'football.goal', teamId: 'team_home', athleteId: 'a1', gameClockMs: 0, status: 'superseded' },
        { eventType: 'football.goal', teamId: 'team_home', athleteId: 'a2', gameClockMs: 0, status: 'active' },
      ],
      scoringEventTypes: ['football.goal'],
    });

    expect(candidate.scorers).toEqual([{ athleteId: 'a2', teamId: 'team_home', count: 1, minute: 0 }]);
  });

  it('reads a variable point value from the payload, for basketball', () => {
    const candidate = candidateFromMatchReport({
      report: {
        id: 'm', matchId: 'm', leagueId: 'l', sport: 'basketball',
        declaredHomeScore: 3, declaredAwayScore: 0,
        reconstructedHomeScore: 3, reconstructedAwayScore: 0,
      },
      events: [
        { eventType: 'basketball.points', teamId: 't', athleteId: 'a1', gameClockMs: 0, status: 'active', payload: { value: 3 } },
      ],
      scoringEventTypes: ['basketball.points'],
    });

    // A three-pointer is one event worth three, never three events worth one.
    expect(candidate.scorers[0].count).toBe(3);
  });

  it('counts a team-only event toward the score but not toward any scorer', () => {
    const candidate = candidateFromMatchReport({
      report: {
        id: 'm', matchId: 'm', leagueId: 'l',
        declaredHomeScore: 1, declaredAwayScore: 0,
        reconstructedHomeScore: 1, reconstructedAwayScore: 0,
      },
      events: [{ eventType: 'football.goal', teamId: 't', athleteId: null, gameClockMs: 0, status: 'active' }],
      scoringEventTypes: ['football.goal'],
    });

    expect(candidate.scorers).toEqual([]);
    expect(candidate.homeScore).toBe(1);
  });

  it('falls back to a system principal when a report carries no session', () => {
    const candidate = candidateFromMatchReport({
      report: {
        id: 'm', matchId: 'm', leagueId: 'l',
        declaredHomeScore: 0, declaredAwayScore: 0,
        reconstructedHomeScore: 0, reconstructedAwayScore: 0,
      },
      events: [],
      scoringEventTypes: [],
    });

    // Never a fabricated user. An unattributable record says so.
    expect(candidate.sourcePrincipal).toEqual({ principalType: 'system', component: 'field_capture' });
  });

  it('attributes a post-match entry to the person who entered it', () => {
    const candidate = candidateFromPostMatchEntry({
      matchId: 'match_1',
      leagueId: 'league_1',
      seasonId: 'season_1',
      homeScore: 2,
      awayScore: 2,
      enteredByUserId: 'league_admin_1',
      recordId: 'entry_1',
    });

    expect(candidate.sourceType).toBe('league_post_match');
    expect(candidate.sourcePrincipal).toEqual({ principalType: 'user', userId: 'league_admin_1' });
  });

  /**
   * The property that stops two sources both finalizing one match. Both matchReports and
   * resultSubmissions key on the matchId, so a field report and a legacy submission for the
   * same version produce the SAME key and the ledger refuses the second.
   */
  it('produces a key that collides across sources for the same match and version', () => {
    const legacy = candidateFromResultSubmission({
      id: 'match_1', matchId: 'match_1', leagueId: 'l', seasonId: 's', submittedByUserId: 'u',
    });
    const field = candidateFromMatchReport({
      report: {
        id: 'match_1', matchId: 'match_1', leagueId: 'l',
        declaredHomeScore: 0, declaredAwayScore: 0,
        reconstructedHomeScore: 0, reconstructedAwayScore: 0,
      },
      events: [],
      scoringEventTypes: [],
    });

    expect(legacy.finalizationKey).toBe(field.finalizationKey);
    // And it is the format the ledger actually uses, not a second spelling of it.
    expect(field.finalizationKey).toBe(candidateFinalizationKey({
      matchId: 'match_1', sourceRecordId: 'match_1', resultVersion: 1,
    }));
  });
});
