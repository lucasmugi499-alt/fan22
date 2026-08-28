import { describe, expect, it } from 'vitest';
import {
  concessionMinutes,
  deriveDefensiveStats,
  derivedDefensiveStatKeys,
  observedFullTimeMinute,
  onPitchWindow,
} from './derivation';
import type { OfficialSportEvent } from '@/kernel/types';

const HOME = 'team_home';
const AWAY = 'team_away';

let sequence = 0;

function event(
  eventType: string,
  options: { minute?: number; teamId?: string; athleteId?: string } = {},
): OfficialSportEvent {
  sequence += 1;
  return {
    id: `event_${sequence}`,
    eventType,
    eventSchemaVersion: '1.0.0',
    sportDefinitionVersion: '1.0.0',
    sportId: 'football',
    competitionId: 'competition_1',
    seasonId: 'season_1',
    matchId: 'match_1',
    sequence,
    ...(options.minute === undefined ? {} : { gameClock: { minute: options.minute } }),
    ...(options.teamId ? { teamId: options.teamId } : {}),
    ...(options.athleteId ? { primaryAthleteId: options.athleteId } : {}),
    payload: {},
  };
}

describe('concession minutes', () => {
  it('counts an opponent goal against the conceding team', () => {
    const events = [event('football.goal', { minute: 20, teamId: AWAY, athleteId: 'a_1' })];
    expect(concessionMinutes({ events, teamId: HOME, fullTimeMinute: 90 })).toEqual([20]);
    expect(concessionMinutes({ events, teamId: AWAY, fullTimeMinute: 90 })).toEqual([]);
  });

  it('counts an own goal against the team that scored it, not the team credited', () => {
    const events = [event('football.own_goal', { minute: 55, teamId: HOME, athleteId: 'a_2' })];
    expect(concessionMinutes({ events, teamId: HOME, fullTimeMinute: 90 })).toEqual([55]);
    expect(concessionMinutes({ events, teamId: AWAY, fullTimeMinute: 90 })).toEqual([]);
  });

  it('counts a scored penalty like any other goal', () => {
    const events = [event('football.penalty_scored', { minute: 70, teamId: AWAY, athleteId: 'a_3' })];
    expect(concessionMinutes({ events, teamId: HOME, fullTimeMinute: 90 })).toEqual([70]);
  });

  it('ignores non-scoring events entirely', () => {
    const events = [
      event('football.penalty_missed', { minute: 30, teamId: AWAY, athleteId: 'a_4' }),
      event('football.yellow_card', { minute: 31, teamId: AWAY, athleteId: 'a_4' }),
    ];
    expect(concessionMinutes({ events, teamId: HOME, fullTimeMinute: 90 })).toEqual([]);
  });
});

describe('on-pitch window', () => {
  it('is absent for an athlete with no events at all', () => {
    expect(onPitchWindow({ athleteId: 'nobody', events: [], fullTimeMinute: 90 })).toBeNull();
  });

  it('is absent for an unused substitute, who was selected but never played', () => {
    const events = [event('football.active_squad', { teamId: HOME, athleteId: 'bench_1' })];
    expect(onPitchWindow({ athleteId: 'bench_1', events, fullTimeMinute: 90 })).toBeNull();
  });

  it('runs kickoff to full time for a starter who was never withdrawn', () => {
    const events = [event('football.starter', { teamId: HOME, athleteId: 'a_1' })];
    expect(onPitchWindow({ athleteId: 'a_1', events, fullTimeMinute: 90 }))
      .toEqual({ fromMinute: 0, toMinute: 90 });
  });

  it('closes at the substitution and opens at it for the replacement', () => {
    const events = [
      event('football.starter', { teamId: HOME, athleteId: 'a_1' }),
      event('football.substitution_off', { minute: 60, teamId: HOME, athleteId: 'a_1' }),
      event('football.substitution_on', { minute: 60, teamId: HOME, athleteId: 'a_2' }),
    ];
    expect(onPitchWindow({ athleteId: 'a_1', events, fullTimeMinute: 90 }))
      .toEqual({ fromMinute: 0, toMinute: 60 });
    expect(onPitchWindow({ athleteId: 'a_2', events, fullTimeMinute: 90 }))
      .toEqual({ fromMinute: 60, toMinute: 90 });
  });

  it('ends the window at a red card, with or without a replacement', () => {
    const events = [
      event('football.starter', { teamId: HOME, athleteId: 'a_1' }),
      event('football.red_card', { minute: 40, teamId: HOME, athleteId: 'a_1' }),
    ];
    expect(onPitchWindow({ athleteId: 'a_1', events, fullTimeMinute: 90 }))
      .toEqual({ fromMinute: 0, toMinute: 40 });
  });

  it('opens at kickoff for an athlete known only through an act on the field', () => {
    const events = [event('football.goal', { minute: 12, teamId: HOME, athleteId: 'a_9' })];
    expect(onPitchWindow({ athleteId: 'a_9', events, fullTimeMinute: 90 }))
      .toEqual({ fromMinute: 0, toMinute: 90 });
  });
});

describe('derived defensive stats', () => {
  it('gives a full-match goalkeeper the clean sheet their team earned', () => {
    const events = [
      event('football.starter', { teamId: HOME, athleteId: 'keeper' }),
      event('football.goal', { minute: 30, teamId: HOME, athleteId: 'striker' }),
    ];
    expect(deriveDefensiveStats({ athleteId: 'keeper', teamId: HOME, events, fullTimeMinute: 90 }))
      .toEqual({ goalsConceded: 0, cleanSheet: true, derivable: true });
  });

  it('counts only the goals conceded while the athlete was on the field', () => {
    const events = [
      event('football.starter', { teamId: HOME, athleteId: 'defender' }),
      event('football.goal', { minute: 20, teamId: AWAY, athleteId: 'away_1' }),
      event('football.substitution_off', { minute: 60, teamId: HOME, athleteId: 'defender' }),
      event('football.goal', { minute: 75, teamId: AWAY, athleteId: 'away_2' }),
    ];
    expect(deriveDefensiveStats({ athleteId: 'defender', teamId: HOME, events, fullTimeMinute: 90 }))
      .toEqual({ goalsConceded: 1, cleanSheet: false, derivable: true });
  });

  it('keeps a clean sheet for a substitute who came on after the goals', () => {
    const events = [
      event('football.goal', { minute: 20, teamId: AWAY, athleteId: 'away_1' }),
      event('football.goal', { minute: 35, teamId: AWAY, athleteId: 'away_2' }),
      event('football.substitution_on', { minute: 70, teamId: HOME, athleteId: 'late_sub' }),
    ];
    expect(deriveDefensiveStats({ athleteId: 'late_sub', teamId: HOME, events, fullTimeMinute: 90 }))
      .toEqual({ goalsConceded: 0, cleanSheet: true, derivable: true });
  });

  it('charges an own goal to the athlete who was on the field for it', () => {
    const events = [
      event('football.starter', { teamId: HOME, athleteId: 'defender' }),
      event('football.own_goal', { minute: 50, teamId: HOME, athleteId: 'defender' }),
    ];
    expect(deriveDefensiveStats({ athleteId: 'defender', teamId: HOME, events, fullTimeMinute: 90 }))
      .toMatchObject({ goalsConceded: 1, cleanSheet: false });
  });

  it('withholds an answer for an unused substitute rather than inventing a clean sheet', () => {
    const events = [
      event('football.active_squad', { teamId: HOME, athleteId: 'bench_1' }),
      event('football.goal', { minute: 30, teamId: HOME, athleteId: 'striker' }),
    ];
    const derived = deriveDefensiveStats({ athleteId: 'bench_1', teamId: HOME, events, fullTimeMinute: 90 });
    expect(derived).toEqual({ goalsConceded: 0, cleanSheet: false, derivable: false });
    // And it contributes no stat keys at all, so nothing reads as a recorded zero.
    expect(derivedDefensiveStatKeys(derived)).toEqual({});
  });

  it('publishes both keys once the athlete was demonstrably on the field', () => {
    const events = [
      event('football.starter', { teamId: HOME, athleteId: 'keeper' }),
      event('football.goal', { minute: 10, teamId: AWAY, athleteId: 'away_1' }),
    ];
    const derived = deriveDefensiveStats({ athleteId: 'keeper', teamId: HOME, events, fullTimeMinute: 90 });
    expect(derivedDefensiveStatKeys(derived)).toEqual({ goals_conceded: 1, clean_sheet: 0 });
  });
});

describe('observed full time', () => {
  it('uses the last recorded minute rather than a nominal ninety', () => {
    expect(observedFullTimeMinute([
      event('football.goal', { minute: 12, teamId: HOME }),
      event('football.goal', { minute: 78, teamId: HOME }),
    ])).toBe(78);
  });

  it('is zero when nothing carries a clock', () => {
    expect(observedFullTimeMinute([event('football.active_squad', { teamId: HOME })])).toBe(0);
  });
});
