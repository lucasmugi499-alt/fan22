import { describe, expect, it } from 'vitest';
import {
  buildSchedulePreview,
  decideReschedule,
  parseFixtureImport,
  matchDates,
  publicationNotice,
  roundRobinPairings,
  validateFixture,
  type MatchDay,
} from './schedule';

const TEN = Array.from({ length: 10 }, (_, index) => `team_${index + 1}`);

describe('round robin pairings', () => {
  it('pairs every club with every other exactly once', () => {
    const pairings = roundRobinPairings(TEN);
    const seen = pairings.map((p) => [p.homeTeamId, p.awayTeamId].sort().join('-')).sort();
    expect(seen).toHaveLength(45);
    expect(new Set(seen).size).toBe(45);
  });

  it('plays nine rounds of five fixtures for ten clubs', () => {
    const pairings = roundRobinPairings(TEN);
    const rounds = new Set(pairings.map((p) => p.round));
    expect(rounds.size).toBe(9);
    for (const round of rounds) {
      const inRound = pairings.filter((p) => p.round === round);
      expect(inRound).toHaveLength(5);
      // Every club appears exactly once per round.
      const played = inRound.flatMap((p) => [p.homeTeamId, p.awayTeamId]);
      expect(new Set(played).size).toBe(10);
    }
  });

  it('doubles into a reverse leg with the sides swapped', () => {
    const single = roundRobinPairings(TEN);
    const double = roundRobinPairings(TEN, 'double_round_robin');
    expect(double).toHaveLength(single.length * 2);

    const firstLeg = double.slice(0, single.length);
    const secondLeg = double.slice(single.length);
    for (let index = 0; index < firstLeg.length; index += 1) {
      expect(secondLeg[index].homeTeamId).toBe(firstLeg[index].awayTeamId);
      expect(secondLeg[index].awayTeamId).toBe(firstLeg[index].homeTeamId);
    }
    expect(new Set(double.map((p) => p.round)).size).toBe(18);
  });

  it('gives an odd membership a bye rather than an unbalanced round', () => {
    const pairings = roundRobinPairings(['a', 'b', 'c', 'd', 'e']);
    expect(new Set(pairings.map((p) => p.round)).size).toBe(5);
    for (const pairing of pairings) {
      expect(pairing.homeTeamId).not.toBe('__bye__');
      expect(pairing.awayTeamId).not.toBe('__bye__');
    }
    // Ten meetings among five clubs, each round resting one.
    expect(pairings).toHaveLength(10);
  });

  it('never pairs a club with itself, even with duplicate input', () => {
    const pairings = roundRobinPairings(['a', 'a', 'b']);
    expect(pairings.every((p) => p.homeTeamId !== p.awayTeamId)).toBe(true);
  });

  it('has nothing to schedule below two clubs', () => {
    expect(roundRobinPairings([])).toEqual([]);
    expect(roundRobinPairings(['a'])).toEqual([]);
  });
});

describe('match dates', () => {
  const window = {
    startDate: '2026-09-05',
    endDate: '2026-09-27',
    matchDays: [6, 0] as MatchDay[],
    kickoffTime: '15:00',
  };

  it('lists only the chosen days, in order, at the chosen kickoff', () => {
    const dates = matchDates(window);
    expect(dates[0]).toBe('2026-09-05T15:00:00.000Z');
    for (const date of dates) {
      expect([0, 6]).toContain(new Date(date).getUTCDay());
      expect(date.endsWith('T15:00:00.000Z')).toBe(true);
    }
    expect([...dates].sort()).toEqual(dates);
  });

  it('returns nothing when the inputs cannot produce a date', () => {
    expect(matchDates({ ...window, matchDays: [] })).toEqual([]);
    expect(matchDates({ ...window, startDate: 'not a date' })).toEqual([]);
    expect(matchDates({ ...window, kickoffTime: 'noon' })).toEqual([]);
  });
});

describe('schedule preview', () => {
  const teams = TEN.map((id, index) => ({
    id,
    name: `Club ${index + 1}`,
    homeVenue: index === 0 ? 'Nakivubo Stadium' : undefined,
  }));
  const window = {
    startDate: '2026-09-05',
    endDate: '2026-12-20',
    matchDays: [6] as MatchDay[],
    kickoffTime: '15:00',
  };
  /*
   * Passed to every case rather than left to the clock. The preview now refuses a window that
   * has already ended, so a test that relied on "2026-09-05 is in the future" would pass today
   * and fail in December for a reason that has nothing to do with what it is testing.
   */
  const now = '2026-08-30T12:00:00.000Z';

  it('proposes a full season with one date per round', () => {
    const preview = buildSchedulePreview({
      teams, format: 'single_round_robin', window, defaultVenue: 'League Ground', now,
    });
    expect(preview.blockers).toEqual([]);
    expect(preview.rounds).toBe(9);
    expect(preview.fixtures).toHaveLength(45);

    const byRound = new Map<number, Set<string>>();
    for (const fixture of preview.fixtures) {
      byRound.set(fixture.round, (byRound.get(fixture.round) ?? new Set()).add(fixture.scheduledAt));
    }
    for (const dates of byRound.values()) expect(dates.size).toBe(1);
  });

  it('uses the home club venue where it has one, and the default otherwise', () => {
    const preview = buildSchedulePreview({
      teams, format: 'single_round_robin', window, defaultVenue: 'League Ground', now,
    });
    const atHome = preview.fixtures.find((fixture) => fixture.homeTeamId === 'team_1');
    expect(atHome?.venue).toBe('Nakivubo Stadium');
    const elsewhere = preview.fixtures.find((fixture) => fixture.homeTeamId === 'team_2');
    expect(elsewhere?.venue).toBe('League Ground');
  });

  it('refuses rather than truncating when the window cannot hold every round', () => {
    const preview = buildSchedulePreview({
      teams,
      format: 'double_round_robin',
      window: { ...window, endDate: '2026-10-03' },
      defaultVenue: 'League Ground',
      now,
    });
    expect(preview.fixtures).toEqual([]);
    expect(preview.blockers[0]).toContain('needs 18 match days');
    expect(preview.blockers[0]).toContain('Widen the dates');
  });

  it('says an odd club count means somebody rests', () => {
    const preview = buildSchedulePreview({
      teams: teams.slice(0, 5), format: 'single_round_robin', window, defaultVenue: 'League Ground', now,
    });
    expect(preview.warnings).toContain('An odd number of clubs means one club rests each round.');
  });

  /*
   * The three cases below are one production incident.
   *
   * A League Admin opened the builder against a season that ran February to June, in August.
   * The dates pre-fill from the season, the Publish button worked, and 55 fixtures were
   * created — correctly, into the past, duplicating a schedule the season already had. Nothing
   * refused, nothing warned, and every screen that lists what is coming up showed nothing,
   * because none of it was coming up.
   */
  it('refuses a date window that has already passed', () => {
    const preview = buildSchedulePreview({
      teams,
      format: 'double_round_robin',
      window: { ...window, startDate: '2026-02-07', endDate: '2026-06-13' },
      defaultVenue: 'League Ground',
      now,
    });
    expect(preview.fixtures).toEqual([]);
    expect(preview.blockers.join(' ')).toContain('already passed');
  });

  it('refuses to generate pairings the season already holds', () => {
    const preview = buildSchedulePreview({
      teams,
      format: 'single_round_robin',
      window,
      defaultVenue: 'League Ground',
      now,
      existing: [{ homeTeamId: 'team_1', homeTeamName: '', awayTeamId: 'team_2' } as never],
    });
    expect(preview.fixtures).toEqual([]);
    expect(preview.blockers.join(' ')).toContain('already exist in this season');
  });

  it('says how many fixtures are overdue when a window starts in the past', () => {
    // A league adopting the platform mid-season backfills, so this is allowed. It is said
    // rather than refused, with the count, because "some" and "eleven" are different facts.
    const preview = buildSchedulePreview({
      teams,
      format: 'single_round_robin',
      window: { ...window, startDate: '2026-08-01' },
      defaultVenue: 'League Ground',
      now,
    });
    expect(preview.fixtures.length).toBeGreaterThan(0);
    expect(preview.warnings.join(' ')).toMatch(/\d+ of these \d+ fixtures are dated before today/);
  });

  it('says nothing about overdue fixtures when the whole window is ahead', () => {
    const preview = buildSchedulePreview({
      teams, format: 'single_round_robin', window, defaultVenue: 'League Ground', now,
    });
    expect(preview.warnings.join(' ')).not.toContain('overdue');
  });

  it('blocks on the inputs a schedule cannot be built from', () => {
    expect(buildSchedulePreview({
      teams: teams.slice(0, 1), format: 'single_round_robin', window, defaultVenue: 'X', now,
    }).blockers[0]).toContain('at least two clubs');

    expect(buildSchedulePreview({
      teams, format: 'single_round_robin',
      window: { ...window, startDate: '2026-12-01', endDate: '2026-09-01' },
      defaultVenue: 'X',
      now,
    }).blockers).toContain('The season ends before it starts.');

    expect(buildSchedulePreview({
      teams, format: 'knockout', window, defaultVenue: 'X', now,
    }).blockers[0]).toContain('Knockout scheduling is not available yet');
  });
});

describe('fixture validation', () => {
  const base = {
    homeTeamId: 'team_1',
    awayTeamId: 'team_2',
    scheduledAt: '2026-09-12T15:00:00.000Z',
    venue: 'Nakivubo Stadium',
  };

  it('accepts a clean fixture', () => {
    expect(validateFixture({ draft: base, existing: [] })).toEqual([]);
  });

  it('refuses a club playing itself', () => {
    expect(validateFixture({ draft: { ...base, awayTeamId: 'team_1' }, existing: [] }))
      .toContain('A club cannot play itself.');
  });

  it('refuses a club that is not in the competition', () => {
    expect(validateFixture({
      draft: base, existing: [], competitionTeamIds: ['team_1', 'team_9'],
    })).toContain('Away club is not part of this competition.');
  });

  it('catches the same pairing twice on one day', () => {
    expect(validateFixture({
      draft: base,
      existing: [{ ...base, scheduledAt: '2026-09-12T18:00:00.000Z' }],
    })).toContain('These clubs are already scheduled against each other that day.');
  });

  it('catches a club double-booked that day against anybody', () => {
    expect(validateFixture({
      draft: base,
      existing: [{
        homeTeamId: 'team_5', awayTeamId: 'team_2',
        scheduledAt: '2026-09-12T18:00:00.000Z', venue: 'Other Ground',
      }],
    })).toContain('One of these clubs already has a fixture that day.');
  });

  it('catches a venue booked within two hours', () => {
    expect(validateFixture({
      draft: base,
      existing: [{
        homeTeamId: 'team_7', awayTeamId: 'team_8',
        scheduledAt: '2026-09-12T16:00:00.000Z', venue: 'Nakivubo Stadium',
      }],
    })).toContain('Nakivubo Stadium is already booked within two hours of this kickoff.');
  });

  it('allows the same venue later the same day', () => {
    expect(validateFixture({
      draft: base,
      existing: [{
        homeTeamId: 'team_7', awayTeamId: 'team_8',
        scheduledAt: '2026-09-12T21:00:00.000Z', venue: 'Nakivubo Stadium',
      }],
    })).toEqual([]);
  });

  it('keeps a fixture inside its season', () => {
    expect(validateFixture({
      draft: base, existing: [], seasonStart: '2026-10-01T00:00:00.000Z',
    })).toContain('This kickoff is before the season starts.');
    expect(validateFixture({
      draft: base, existing: [], seasonEnd: '2026-09-01T00:00:00.000Z',
    })).toContain('This kickoff is after the season ends.');
  });

  it('reports each problem once', () => {
    const errors = validateFixture({
      draft: base,
      existing: [
        { ...base, scheduledAt: '2026-09-12T16:00:00.000Z' },
        { ...base, scheduledAt: '2026-09-12T17:00:00.000Z' },
      ],
    });
    expect(new Set(errors).size).toBe(errors.length);
  });
});

describe('publication notice', () => {
  it('states what the capture policy will mean, without printing the enum', () => {
    for (const policy of ['FIELD_REQUIRED', 'FIELD_PREFERRED', 'POST_MATCH_ALLOWED'] as const) {
      const notice = publicationNotice(policy, 45);
      expect(notice).toContain('45 fixtures');
      expect(notice).not.toContain('_');
    }
    expect(publicationNotice('FIELD_REQUIRED', 1)).toContain('1 fixture will');
    expect(publicationNotice('POST_MATCH_ALLOWED', 3)).toContain('lower data-quality tier');
  });
});

describe('rescheduling', () => {
  const NOW = '2026-09-01T00:00:00.000Z';
  const base = {
    status: 'scheduled',
    currentScheduledAt: '2026-09-12T15:00:00.000Z',
    currentVenue: 'Nakivubo Stadium',
    nextScheduledAt: '2026-09-19T16:00:00.000Z',
    reason: 'Venue unavailable',
    now: NOW,
  };

  it('moves a scheduled fixture and reports the shift', () => {
    const decision = decideReschedule(base);
    expect(decision.ok).toBe(true);
    if (!decision.ok) throw new Error('expected a plan');
    expect(decision.fromScheduledAt).toBe('2026-09-12T15:00:00.000Z');
    expect(decision.toScheduledAt).toBe('2026-09-19T16:00:00.000Z');
    expect(decision.movedByHours).toBe(169);
    // The venue carries forward when the caller does not change it.
    expect(decision.toVenue).toBe('Nakivubo Stadium');
  });

  it('refuses a match that is under way or already played', () => {
    for (const status of ['live', 'completed', 'cancelled']) {
      const decision = decideReschedule({ ...base, status });
      expect(decision.ok).toBe(false);
    }
    const live = decideReschedule({ ...base, status: 'live' });
    if (live.ok) throw new Error('expected refusal');
    expect(live.reason).toContain('under way');
  });

  it('requires a reason, because clubs are told why their fixture moved', () => {
    const decision = decideReschedule({ ...base, reason: '  ' });
    if (decision.ok) throw new Error('expected refusal');
    expect(decision.reason).toContain('Give a reason');
  });

  it('refuses a move that changes nothing', () => {
    const decision = decideReschedule({ ...base, nextScheduledAt: base.currentScheduledAt });
    if (decision.ok) throw new Error('expected refusal');
    expect(decision.reason).toContain('Nothing changed');
  });

  it('accepts a venue-only move at the same kickoff', () => {
    const decision = decideReschedule({
      ...base,
      nextScheduledAt: base.currentScheduledAt,
      nextVenue: 'Mengo Community Stadium',
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) throw new Error('expected a plan');
    expect(decision.movedByHours).toBe(0);
    expect(decision.toVenue).toBe('Mengo Community Stadium');
  });

  it('refuses a kickoff in the past or outside the season', () => {
    expect(decideReschedule({ ...base, nextScheduledAt: '2026-08-01T15:00:00.000Z' }).ok).toBe(false);
    const early = decideReschedule({ ...base, seasonStart: '2026-10-01T00:00:00.000Z' });
    if (early.ok) throw new Error('expected refusal');
    expect(early.reason).toContain('before the season starts');
    const late = decideReschedule({ ...base, seasonEnd: '2026-09-15T00:00:00.000Z' });
    if (late.ok) throw new Error('expected refusal');
    expect(late.reason).toContain('after the season ends');
  });

  it('refuses an unparseable kickoff rather than writing one', () => {
    const decision = decideReschedule({ ...base, nextScheduledAt: 'next Saturday' });
    if (decision.ok) throw new Error('expected refusal');
    expect(decision.reason).toContain('valid new kickoff');
  });
});

describe('fixture import', () => {
  const teams = [
    { id: 'team_1', name: 'Kampala United', location: 'Nakivubo Stadium' },
    { id: 'team_2', name: 'City Stars' },
    { id: 'team_3', name: 'Villa SC' },
  ];

  it('reads a spreadsheet as a league actually writes one', () => {
    const result = parseFixtureImport({
      rows: [
        { home: 'Kampala United', away: 'City Stars', date: '2026-09-12', time: '15:00' },
        { home: 'Villa SC', away: 'Kampala United', date: '2026-09-19', time: '16:00', venue: 'Mengo Ground' },
      ],
      teams,
    });
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ homeTeamId: 'team_1', awayTeamId: 'team_2' });
    // Falls back to the home club's own venue when the file does not give one.
    expect(result.rows[0].venue).toBe('Nakivubo Stadium');
    expect(result.rows[1].venue).toBe('Mengo Ground');
  });

  it('matches club names as written, not exactly', () => {
    const result = parseFixtureImport({
      rows: [{ home: 'kampala utd', away: 'CITY STARS', date: '2026-09-12' }],
      teams,
    });
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ homeTeamId: 'team_1', awayTeamId: 'team_2' });
  });

  it('rejects a club it cannot find rather than guessing', () => {
    const result = parseFixtureImport({
      rows: [{ home: 'Kampala United', away: 'Nakawa Lions', date: '2026-09-12' }],
      teams,
    });
    expect(result.rows).toEqual([]);
    expect(result.errors[0]).toContain('no club in this league matches "Nakawa Lions"');
  });

  it('names the line for every problem', () => {
    const result = parseFixtureImport({
      rows: [
        { home: 'Kampala United', away: 'City Stars', date: '2026-09-12' },
        { home: 'Kampala United', away: 'Kampala United', date: '2026-09-13' },
        { home: '', away: 'City Stars', date: '2026-09-14' },
        { home: 'Villa SC', away: 'City Stars', date: 'sometime in September' },
      ],
      teams,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toContain('Line 2: a club cannot play itself.');
    expect(result.errors).toContain('Line 3: both clubs are required.');
    expect(result.errors.some((error) => error.startsWith('Line 4:') && error.includes('not a date'))).toBe(true);
  });

  it('catches a fixture the file lists twice, and says which line it duplicates', () => {
    const result = parseFixtureImport({
      rows: [
        { home: 'Kampala United', away: 'City Stars', date: '2026-09-12', time: '15:00' },
        { home: 'Kampala United', away: 'City Stars', date: '2026-09-12', time: '18:00' },
      ],
      teams,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toContain('Line 2: duplicates the fixture already on line 1.');
  });

  it('keeps imported fixtures inside the season', () => {
    const result = parseFixtureImport({
      rows: [{ home: 'Kampala United', away: 'City Stars', date: '2026-08-01' }],
      teams,
      seasonStart: '2026-09-01T00:00:00.000Z',
    });
    expect(result.rows).toEqual([]);
    expect(result.errors[0]).toContain('before the season starts');
  });

  it('never defaults an unreadable date to now', () => {
    const result = parseFixtureImport({
      rows: [{ home: 'Kampala United', away: 'City Stars', date: '' }],
      teams,
    });
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });
});
