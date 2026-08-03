import { describe, expect, it } from 'vitest';
import { participationCoverage, resolveAthleteParticipation } from './participation';
import type { OfficialSportEvent } from '@/kernel/types';

function event(overrides: Partial<OfficialSportEvent> & { eventType: string; id: string }): OfficialSportEvent {
  return {
    eventSchemaVersion: '1.0.0',
    sportDefinitionVersion: '1.0.0',
    sportId: 'football',
    competitionId: 'league_1',
    seasonId: 'season_1',
    matchId: 'match_1',
    sequence: 1,
    teamId: 'team_a',
    primaryAthleteId: 'athlete_1',
    payload: { value: 1 },
    sourceClaimId: 'submission_1',
    submittedByUserId: 'user_1',
    submittedByTeamId: 'team_a',
    evidenceRefs: [],
    officialResultVersion: 1,
    officialEventVersion: 1,
    verificationStatus: 'official',
    idempotencyKey: overrides.id,
    createdAt: '2026-03-01T00:00:00.000Z',
    finalizedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  } as OfficialSportEvent;
}

const base = { athleteId: 'athlete_1', teamId: 'team_a' };

describe('resolveAthleteParticipation', () => {
  it('treats squad selection alone as NOT playing', () => {
    const result = resolveAthleteParticipation({
      ...base,
      events: [event({ id: 'e1', eventType: 'football.active_squad' })],
    });

    // The defect this exists to prevent: an unused substitute earning a career
    // appearance, win participation and fantasy points.
    expect(result.level).toBe('selected_in_squad');
    expect(result.didPlay).toBe(false);
    expect(result.minutesPlayed).toBe(0);
  });

  it('treats being named in a line-up as selection, not participation', () => {
    const result = resolveAthleteParticipation({
      ...base,
      events: [event({ id: 'e1', eventType: 'football.lineup_named' })],
    });

    expect(result.didPlay).toBe(false);
  });

  it('credits a starter as having played', () => {
    const result = resolveAthleteParticipation({
      ...base,
      events: [
        event({ id: 'e1', eventType: 'football.active_squad' }),
        event({ id: 'e2', eventType: 'football.starter' }),
      ],
    });

    expect(result.level).toBe('started');
    expect(result.didPlay).toBe(true);
  });

  it('credits a substitute who came on', () => {
    const result = resolveAthleteParticipation({
      ...base,
      events: [event({ id: 'e1', eventType: 'football.substitution_on' })],
    });

    expect(result.level).toBe('entered_as_substitute');
    expect(result.didPlay).toBe(true);
  });

  it('infers participation from an act only possible on the field', () => {
    const result = resolveAthleteParticipation({
      ...base,
      events: [
        event({ id: 'e1', eventType: 'football.active_squad' }),
        event({ id: 'e2', eventType: 'football.goal' }),
      ],
    });

    // You cannot score from the bench.
    expect(result.didPlay).toBe(true);
    expect(result.sourceEventIds).toContain('e2');
  });

  it('records verified minutes at the strongest level', () => {
    const result = resolveAthleteParticipation({
      ...base,
      events: [
        event({ id: 'e1', eventType: 'football.starter' }),
        event({ id: 'e2', eventType: 'football.minutes_played', payload: { value: 78 } }),
      ],
    });

    expect(result.level).toBe('minutes_confirmed');
    expect(result.minutesPlayed).toBe(78);
  });

  it('treats an explicit zero-minutes record as evidence of not playing', () => {
    const result = resolveAthleteParticipation({
      ...base,
      events: [
        event({ id: 'e1', eventType: 'football.active_squad' }),
        event({ id: 'e2', eventType: 'football.minutes_played', payload: { value: 0 } }),
      ],
    });

    expect(result.didPlay).toBe(false);
    expect(result.minutesPlayed).toBe(0);
  });

  it('ignores events belonging to a different athlete', () => {
    const result = resolveAthleteParticipation({
      ...base,
      events: [
        event({ id: 'e1', eventType: 'football.active_squad' }),
        event({ id: 'e2', eventType: 'football.goal', primaryAthleteId: 'athlete_2' }),
      ],
    });

    expect(result.didPlay).toBe(false);
  });

  it('works the same way for rugby and basketball event namespaces', () => {
    const rugby = resolveAthleteParticipation({
      ...base,
      events: [event({ id: 'e1', eventType: 'rugby.active_squad', sportId: 'rugby' })],
    });
    const basketball = resolveAthleteParticipation({
      ...base,
      events: [event({ id: 'e1', eventType: 'basketball.points', sportId: 'basketball', payload: { value: 12 } })],
    });

    expect(rugby.didPlay).toBe(false);
    expect(basketball.didPlay).toBe(true);
  });
});

describe('participationCoverage', () => {
  it('reports how much of the squad has real participation evidence', () => {
    const coverage = participationCoverage([
      { athleteId: 'a', teamId: 't', level: 'minutes_confirmed', didPlay: true, minutesPlayed: 90, sourceEventIds: [] },
      { athleteId: 'b', teamId: 't', level: 'played', didPlay: true, minutesPlayed: 0, sourceEventIds: [] },
      { athleteId: 'c', teamId: 't', level: 'selected_in_squad', didPlay: false, minutesPlayed: 0, sourceEventIds: [] },
      { athleteId: 'd', teamId: 't', level: 'selected_in_squad', didPlay: false, minutesPlayed: 0, sourceEventIds: [] },
    ]);

    expect(coverage.squadSize).toBe(4);
    expect(coverage.playedCount).toBe(2);
    expect(coverage.participationCoveragePercent).toBe(50);
    expect(coverage.minutesCoveragePercent).toBe(25);
    expect(coverage.appearanceScoringSupported).toBe(true);
  });

  it('reports appearance scoring as unsupported when nothing but selection was recorded', () => {
    const coverage = participationCoverage([
      { athleteId: 'a', teamId: 't', level: 'selected_in_squad', didPlay: false, minutesPlayed: 0, sourceEventIds: [] },
    ]);

    // A competition that only records squads cannot honestly award appearance points.
    expect(coverage.appearanceScoringSupported).toBe(false);
  });
});
