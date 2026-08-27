import { describe, expect, it } from 'vitest';
import { validateOfficialEventShape } from '@/kernel/validators/officialEventGuard';
import { finalizeSubmission } from './resultFinalizer';

/** Every test that expects work to happen runs with the gate open. */
const ENABLED = { mode: 'enabled' as const, canaryAllowlist: [] };

type RecordData = Record<string, unknown>;

function docRef(path: string) {
  const segments = path.split('/');
  return {
    path,
    id: segments[segments.length - 1],
    collection: (name: string) => ({
      doc: (id = `${name}_generated`) => docRef(`${path}/${name}/${id}`),
    }),
  };
}

function snapshot(ref: ReturnType<typeof docRef>, data: RecordData | undefined) {
  return {
    id: ref.id,
    exists: Boolean(data),
    data: () => data,
  };
}

function fakeDb(initial: Record<string, RecordData>) {
  const records = new Map(Object.entries(initial));
  const writes: Array<{ op: string; path: string; data: RecordData }> = [];
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => docRef(`${name}/${id}`),
    }),
    runTransaction: async (callback: (tx: unknown) => unknown) => callback({
      get: async (ref: ReturnType<typeof docRef>) => snapshot(ref, records.get(ref.path)),
      update: (ref: ReturnType<typeof docRef>, data: RecordData) => {
        records.set(ref.path, { ...(records.get(ref.path) ?? {}), ...data });
        writes.push({ op: 'update', path: ref.path, data });
      },
      create: (ref: ReturnType<typeof docRef>, data: RecordData) => {
        if (records.has(ref.path)) throw new Error(`Document already exists: ${ref.path}`);
        records.set(ref.path, data);
        writes.push({ op: 'create', path: ref.path, data });
      },
      set: (ref: ReturnType<typeof docRef>, data: RecordData) => {
        records.set(ref.path, data);
        writes.push({ op: 'set', path: ref.path, data });
      },
    }),
  };
  return { db, records, writes };
}

const match = {
  id: 'match_1',
  sport: 'rugby',
  leagueId: 'league_1',
  seasonId: 'season_1',
  homeTeamId: 'team_home',
  awayTeamId: 'team_away',
  venue: 'Ground',
  city: 'Kampala',
  scheduledAt: '2026-07-30T10:00:00.000Z',
  status: 'scheduled',
  score: { home: null, away: null },
  verificationStatus: 'pending',
  supportersCount: 0,
  totalSupport: 0,
  events: [],
  createdAt: '2026-07-30T00:00:00.000Z',
};

const submission = {
  id: 'match_1',
  matchId: 'match_1',
  leagueId: 'league_1',
  seasonId: 'season_1',
  submittedByTeamId: 'team_home',
  opponentTeamId: 'team_away',
  submittedByUserId: 'team_admin_1',
  // 2 tries (10) + 1 conversion (2) + 1 penalty goal (3). The events must add up.
  homeScore: 15,
  awayScore: 0,
  scorers: [
    { athleteId: 'athlete_1', teamId: 'team_home', count: 2, minute: 12 },
  ],
  activeSquads: {
    team_home: ['athlete_1', 'athlete_2'],
    team_away: ['athlete_3'],
  },
  athleteStatLines: [
    {
      athleteId: 'athlete_1',
      teamId: 'team_home',
      minutesPlayed: 66,
      stats: {
        conversion: 1,
        penalty_goal: 1,
        yellow_card: 1,
      },
    },
  ],
  evidenceRefs: ['matchEvidence/match_1/team_home/team_admin_1/photo.jpg'],
  status: 'confirmed',
  revision: 1,
  resolution: 'opponent_confirmed',
  submittedAsFinal: true,
  confirmationDeadline: '2026-07-31T00:00:00.000Z',
  resultVersion: 1,
  submittedAt: '2026-07-30T11:00:00.000Z',
  confirmedAt: '2026-07-30T12:00:00.000Z',
};

describe('trusted result finalizer', () => {
  it('emits canonical official sport events from settled scorer claims', async () => {
    const { db, records, writes } = fakeDb({
      'resultSubmissions/match_1': submission,
      'matches/match_1': match,
      'athletes/athlete_1': {
        id: 'athlete_1',
        name: 'Amina Trymaker',
        position: 'Fly-half',
      },
      'athletes/athlete_2': {
        id: 'athlete_2',
        name: 'Noah Non Scorer',
        position: 'Lock',
      },
      'athletes/athlete_3': {
        id: 'athlete_3',
        name: 'Grace Defender',
        position: 'Back Row',
      },
    });

    const outcome = await finalizeSubmission(db as never, 'match_1', ENABLED);

    expect(outcome).toMatchObject({ action: 'finalized' });
    expect(records.get('officialSportEvents/match_1_v1_event_0001')).toMatchObject({
      eventType: 'rugby.active_squad',
      sportId: 'rugby',
      competitionId: 'league_1',
      seasonId: 'season_1',
      matchId: 'match_1',
      sequence: 1,
      teamId: 'team_home',
      primaryAthleteId: 'athlete_1',
      payload: {
        value: 1,
        sourceType: 'legacy_team_submission',
      },
    });
    expect(records.get('officialSportEvents/match_1_v1_event_0002')).toMatchObject({
      eventType: 'rugby.active_squad',
      sequence: 2,
      primaryAthleteId: 'athlete_2',
    });
    expect(records.get('officialSportEvents/match_1_v1_event_0004')).toMatchObject({
      eventType: 'rugby.try',
      sportId: 'rugby',
      competitionId: 'league_1',
      seasonId: 'season_1',
      matchId: 'match_1',
      sequence: 4,
      teamId: 'team_home',
      primaryAthleteId: 'athlete_1',
      sourceClaimId: 'match_1',
      submittedByUserId: 'team_admin_1',
      submittedByTeamId: 'team_home',
      officialResultVersion: 1,
      officialEventVersion: 1,
      verificationStatus: 'official',
      evidenceRefs: ['matchEvidence/match_1/team_home/team_admin_1/photo.jpg'],
      payload: {
        value: 1,
        sourceType: 'legacy_team_submission',
      },
    });
    expect(records.get('officialSportEvents/match_1_v1_event_0005')).toMatchObject({
      eventType: 'rugby.try',
      sequence: 5,
      primaryAthleteId: 'athlete_1',
    });
    expect(records.get('officialSportEvents/match_1_v1_event_0006')).toMatchObject({
      eventType: 'rugby.minutes_played',
      sequence: 6,
      primaryAthleteId: 'athlete_1',
      payload: {
        value: 66,
        statKey: 'minutes_played',
        sourceType: 'legacy_team_submission',
      },
    });
    expect(records.get('officialSportEvents/match_1_v1_event_0007')).toMatchObject({
      eventType: 'rugby.conversion_made',
      sequence: 7,
      primaryAthleteId: 'athlete_1',
    });
    expect(records.get('officialSportEvents/match_1_v1_event_0008')).toMatchObject({
      eventType: 'rugby.penalty_goal_made',
      sequence: 8,
      primaryAthleteId: 'athlete_1',
    });
    expect(records.get('officialSportEvents/match_1_v1_event_0009')).toMatchObject({
      eventType: 'rugby.yellow_card',
      sequence: 9,
      primaryAthleteId: 'athlete_1',
    });
    expect(writes).toContainEqual(expect.objectContaining({
      op: 'set',
      path: 'officialAthleteMatchStats/match_1_v1_athlete_1',
      data: expect.objectContaining({
        dataLevel: 'standard',
        dataCoverage: 'verified_stat_line',
        minutesPlayed: 66,
        stats: expect.objectContaining({
          active_squad: 1,
          appearance: 1,
          try: 2,
          conversion: 1,
          penalty_goal: 1,
          yellow_card: 1,
          minutes_played: 66,
        }),
        sourceEventIds: expect.objectContaining({
          minutes_played: 'match_1_v1_event_0006',
          conversion: 'match_1_v1_event_0007',
          penalty_goal: 'match_1_v1_event_0008',
          yellow_card: 'match_1_v1_event_0009',
        }),
      }),
    }));
    // athlete_2 was named in the squad and did nothing else. Selection is not playing:
    // no appearance, no win participation, no fantasy-scoring participation.
    expect(writes).toContainEqual(expect.objectContaining({
      op: 'set',
      path: 'officialAthleteMatchStats/match_1_v1_athlete_2',
      data: expect.objectContaining({
        dataCoverage: 'match_squad_basic',
        activeSquad: true,
        participationLevel: 'selected_in_squad',
        didPlay: false,
        stats: expect.objectContaining({ active_squad: 1, appearance: 0, try: 0, win_participation: 0 }),
      }),
    }));

    // athlete_1 scored and has verified minutes, so participation is proven.
    expect(writes).toContainEqual(expect.objectContaining({
      op: 'set',
      path: 'officialAthleteMatchStats/match_1_v1_athlete_1',
      data: expect.objectContaining({
        participationLevel: 'minutes_confirmed',
        didPlay: true,
      }),
    }));

    // The events reconcile to the official score, so nothing is left unattributed.
    expect(writes).toContainEqual(expect.objectContaining({
      op: 'set',
      path: 'officialMatchReconciliation/match_1_v1',
      data: expect.objectContaining({
        status: 'valid',
        eventScore: { home: 15, away: 0 },
        unattributed: { home: 0, away: 0 },
      }),
    }));
  });

  /**
   * Four of the five event builders in this file hardcoded `eventSchemaVersion: '1.0.0'`
   * rather than reading the constant, so the A0 version bump initially took effect on one of
   * them and the rest kept stamping a version they no longer matched. Nothing failed: the
   * shape guard passes a 1.0.0 event, and every assertion in this suite was written with
   * `toMatchObject`, which ignores fields it is not asked about.
   *
   * This asserts across every emitted event rather than a named one, because the defect was
   * that one builder disagreed with the others.
   */
  it('stamps every emitted event with the current schema version and a real author', async () => {
    const { db, records, writes } = fakeDb({
      'resultSubmissions/match_1': submission,
      'matches/match_1': match,
      'athletes/athlete_1': { id: 'athlete_1', name: 'Amina Trymaker', position: 'Fly-half' },
      'athletes/athlete_2': { id: 'athlete_2', name: 'Noah Non Scorer', position: 'Lock' },
      'athletes/athlete_3': { id: 'athlete_3', name: 'Grace Defender', position: 'Back Row' },
    });

    await finalizeSubmission(db as never, 'match_1', ENABLED);

    const events = writes
      .filter((write) => write.path.startsWith('officialSportEvents/'))
      .map((write) => records.get(write.path) as Record<string, unknown>);

    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.eventSchemaVersion).toBe('2.0.0');
      // The sport definition's version, which is a different question and must not be
      // answered with the event schema constant.
      expect(event.sportDefinitionVersion).toBe('1.0.0');
      expect(event.sourcePrincipal).toEqual({ principalType: 'user', userId: 'team_admin_1' });
      expect(validateOfficialEventShape(event)).toEqual({ status: 'valid', issues: [] });
    }
  });

  it('records an unattributed score event when the events fall short of the official result', async () => {
    // The audit's rugby case: a result carrying only tries, where conversions and
    // penalties went unrecorded. 2 tries account for 10 of a claimed 27.
    const { db, records, writes } = fakeDb({
      'resultSubmissions/match_1': {
        ...submission,
        homeScore: 27,
        athleteStatLines: [],
      },
      'matches/match_1': match,
      'athletes/athlete_1': { id: 'athlete_1', name: 'Amina Trymaker', position: 'Fly-half' },
      'athletes/athlete_2': { id: 'athlete_2', name: 'Noah Non Scorer', position: 'Lock' },
      'athletes/athlete_3': { id: 'athlete_3', name: 'Grace Defender', position: 'Back Row' },
    });

    await finalizeSubmission(db as never, 'match_1', ENABLED);

    const reconciliation = writes.find((write) => write.path === 'officialMatchReconciliation/match_1_v1');
    expect(reconciliation?.data).toMatchObject({
      status: 'inconsistent',
      eventScore: { home: 10, away: 0 },
      unattributed: { home: 17, away: 0 },
    });

    // The gap becomes an explicit official record rather than a silent hole, and it is
    // attributed to the team with no athlete credited.
    const unattributed = [...records.entries()]
      .map(([, value]) => value as Record<string, unknown>)
      .find((value) => value.eventType === 'rugby.unattributed_team_score');
    expect(unattributed).toMatchObject({
      teamId: 'team_home',
      // null, not '': a team-only event has no athlete, and an empty string is an athlete id
      // that happens to be empty — it groups and joins like a real one downstream.
      primaryAthleteId: null,
      payload: expect.objectContaining({
        value: 17,
        sourceType: 'legacy_team_submission',
        derivation: 'score_reconciliation',
      }),
    });
  });

  it('does not award appearances when only a squad was recorded', async () => {
    const { db, writes } = fakeDb({
      'resultSubmissions/match_1': {
        ...submission,
        homeScore: 0,
        awayScore: 0,
        scorers: [],
        athleteStatLines: [],
      },
      'matches/match_1': match,
      'athletes/athlete_1': { id: 'athlete_1', name: 'Amina Trymaker', position: 'Fly-half' },
      'athletes/athlete_2': { id: 'athlete_2', name: 'Noah Non Scorer', position: 'Lock' },
      'athletes/athlete_3': { id: 'athlete_3', name: 'Grace Defender', position: 'Back Row' },
    });

    await finalizeSubmission(db as never, 'match_1', ENABLED);

    const performances = writes.filter((write) => write.path.startsWith('officialAthleteMatchStats/'));
    expect(performances.length).toBeGreaterThan(0);
    for (const performance of performances) {
      const data = performance.data as { didPlay: boolean; stats: Record<string, number> };
      expect(data.didPlay).toBe(false);
      expect(data.stats.appearance).toBe(0);
    }
  });

  it('excludes an athlete registered to a club that is not playing', async () => {
    const { db, writes } = fakeDb({
      'resultSubmissions/match_1': { ...submission, homeScore: 15 },
      'matches/match_1': match,
      'athletes/athlete_1': { id: 'athlete_1', name: 'Amina Trymaker', position: 'Fly-half', teamId: 'team_home' },
      // Registered to an unrelated club, yet claimed in this fixture's squad.
      'athletes/athlete_2': { id: 'athlete_2', name: 'Noah Non Scorer', position: 'Lock', teamId: 'team_elsewhere' },
      'athletes/athlete_3': { id: 'athlete_3', name: 'Grace Defender', position: 'Back Row', teamId: 'team_away' },
    });

    await finalizeSubmission(db as never, 'match_1', ENABLED);

    const performances = writes
      .filter((write) => write.path.startsWith('officialAthleteMatchStats/'))
      .map((write) => write.path);
    expect(performances).not.toContain('officialAthleteMatchStats/match_1_v1_athlete_2');

    const reconciliation = writes.find((write) => write.path === 'officialMatchReconciliation/match_1_v1');
    expect(reconciliation?.data).toMatchObject({
      eligibilityIssues: expect.arrayContaining([
        expect.objectContaining({
          athleteId: 'athlete_2',
          reason: 'not_registered_to_claimed_team',
          registeredTeamId: 'team_elsewhere',
        }),
      ]),
    });
  });

  it('excludes an athlete claimed by both teams rather than picking one', async () => {
    const { db, writes } = fakeDb({
      'resultSubmissions/match_1': {
        ...submission,
        homeScore: 15,
        activeSquads: {
          team_home: ['athlete_1', 'athlete_2'],
          // athlete_2 cannot have played for both sides.
          team_away: ['athlete_2', 'athlete_3'],
        },
      },
      'matches/match_1': match,
      'athletes/athlete_1': { id: 'athlete_1', name: 'Amina Trymaker', position: 'Fly-half' },
      'athletes/athlete_2': { id: 'athlete_2', name: 'Noah Non Scorer', position: 'Lock' },
      'athletes/athlete_3': { id: 'athlete_3', name: 'Grace Defender', position: 'Back Row' },
    });

    await finalizeSubmission(db as never, 'match_1', ENABLED);

    const performances = writes
      .filter((write) => write.path.startsWith('officialAthleteMatchStats/'))
      .map((write) => write.path);
    expect(performances).not.toContain('officialAthleteMatchStats/match_1_v1_athlete_2');

    const reconciliation = writes.find((write) => write.path === 'officialMatchReconciliation/match_1_v1');
    expect(reconciliation?.data).toMatchObject({
      eligibilityIssues: expect.arrayContaining([
        expect.objectContaining({ athleteId: 'athlete_2', reason: 'conflicting_team_attribution' }),
      ]),
    });
  });

  it('still accepts an athlete whose roster link has not been recorded yet', async () => {
    const { db, writes } = fakeDb({
      'resultSubmissions/match_1': { ...submission, homeScore: 15 },
      'matches/match_1': match,
      // No teamId: common for grassroots athletes created mid-season. Tolerated, because
      // a missing registration is not the same as a contradictory one.
      'athletes/athlete_1': { id: 'athlete_1', name: 'Amina Trymaker', position: 'Fly-half' },
      'athletes/athlete_2': { id: 'athlete_2', name: 'Noah Non Scorer', position: 'Lock' },
      'athletes/athlete_3': { id: 'athlete_3', name: 'Grace Defender', position: 'Back Row' },
    });

    await finalizeSubmission(db as never, 'match_1', ENABLED);

    const performances = writes
      .filter((write) => write.path.startsWith('officialAthleteMatchStats/'))
      .map((write) => write.path);
    expect(performances).toContain('officialAthleteMatchStats/match_1_v1_athlete_1');
  });
});

describe('one sports truth: the athlete projection follows the canonical events', () => {
  /**
   * H5. `officialAthleteMatchStats` is what fantasy scores from and what the Career Passport
   * shows, and it used to be computed independently of `officialSportEvents` — same inputs,
   * two code paths, both stamped official, nothing forcing them to agree.
   *
   * The failure that matters is not a wrong number today; it is a future fix to how the
   * kernel interprets participation rebuilding the events correctly while the bespoke
   * projection carries on with the old assumptions. The public profile says one thing,
   * fantasy says another, and both look internally plausible.
   */
  it('takes the scoring stat from the events that were written, and publishes both', async () => {
    const { db, writes } = fakeDb({
      'resultSubmissions/match_1': submission,
      'matches/match_1': match,
      'athletes/athlete_1': { id: 'athlete_1', name: 'Amina Trymaker', position: 'Fly-half' },
      'athletes/athlete_2': { id: 'athlete_2', name: 'Noah Non Scorer', position: 'Lock' },
      'athletes/athlete_3': { id: 'athlete_3', name: 'Grace Defender', position: 'Back Row' },
    });

    await finalizeSubmission(db as never, 'match_1', ENABLED);

    const performance = writes.find((write) =>
      write.path.startsWith('officialAthleteMatchStats/') && String(write.path).includes('athlete_1'));
    expect(performance).toBeDefined();

    // The canonical scoring events for this athlete, summed the way the projection does.
    const scoringEvents = writes
      .filter((write) => write.path.startsWith('officialSportEvents/'))
      .map((write) => write.data as Record<string, unknown>)
      .filter((event) => event.eventType === 'rugby.try' && event.primaryAthleteId === 'athlete_1');
    const fromEvents = scoringEvents.reduce(
      (total, event) => total + Number((event.payload as { value?: number })?.value ?? 0),
      0,
    );

    const stats = (performance?.data as { stats?: Record<string, number> })?.stats ?? {};
    expect(fromEvents).toBeGreaterThan(0);
    expect(stats.try).toBe(fromEvents);
  });

  it('publishes provenance without the eligibility detail', async () => {
    // H4, from the finalizer's side: both records are written, and only one carries names.
    const { db, writes } = fakeDb({
      'resultSubmissions/match_1': submission,
      'matches/match_1': match,
      'athletes/athlete_1': { id: 'athlete_1', name: 'Amina Trymaker', position: 'Fly-half' },
      'athletes/athlete_2': { id: 'athlete_2', name: 'Noah Non Scorer', position: 'Lock' },
      'athletes/athlete_3': { id: 'athlete_3', name: 'Grace Defender', position: 'Back Row' },
    });

    await finalizeSubmission(db as never, 'match_1', ENABLED);

    const publicRecord = writes.find((write) => write.path === 'publicResultProvenance/match_1_v1');
    const internalRecord = writes.find((write) => write.path === 'officialMatchReconciliation/match_1_v1');

    expect(publicRecord).toBeDefined();
    expect(internalRecord).toBeDefined();
    expect(publicRecord?.data).not.toHaveProperty('eligibilityIssues');
    expect(publicRecord?.data).toHaveProperty('eligibilityIssueCount');
    expect(internalRecord?.data).toHaveProperty('eligibilityIssues');
  });
});

describe('the finalizer refuses to expand an amplification payload', () => {
  /**
   * B1. `scorers.size() <= 60` counts entries, not what is inside them. One well-formed
   * scorer claiming 100,000,000 passed every length check, and the finalizer would then
   * construct a hundred million event objects — before reconciliation, before the
   * transaction, before any guard that could refuse it. The surplus check would eventually
   * have rejected the contradiction, but only after the explosion it was meant to prevent.
   */
  it('blocks a single scorer entry claiming an enormous count', async () => {
    const { db, writes } = fakeDb({
      'resultSubmissions/match_1': {
        ...submission,
        scorers: [{ athleteId: 'athlete_1', teamId: 'team_home', count: 100_000_000 }],
      },
      'matches/match_1': match,
      'athletes/athlete_1': { id: 'athlete_1', name: 'Amina Trymaker', position: 'Fly-half' },
    });

    const outcome = await finalizeSubmission(db as never, 'match_1', ENABLED);

    expect(outcome).toMatchObject({ action: 'blocked', reason: 'submission_too_large' });
    // Nothing was expanded: no official events were written at all.
    expect(writes.filter((write) => write.path.startsWith('officialSportEvents/'))).toEqual([]);
    // And it became a reviewable case rather than a retrying function.
    const exception = writes.find((write) => write.path.startsWith('reconciliationExceptions/'));
    expect(exception?.data).toMatchObject({ reasonCode: 'submission_exceeds_finalization_limits' });
    expect(String((exception?.data as { issues?: string[] })?.issues?.join(' '))).toContain('scorer count');
  });

  it('blocks a claim whose total expansion exceeds the write budget', async () => {
    // Each entry is individually legal; together they plan more writes than one transaction
    // can carry. This is the check that existed as dead code until 2026-08-24.
    const { db, writes } = fakeDb({
      'resultSubmissions/match_1': {
        ...submission,
        scorers: Array.from({ length: 20 }, () => ({
          athleteId: 'athlete_1', teamId: 'team_home', count: 90,
        })),
      },
      'matches/match_1': match,
      'athletes/athlete_1': { id: 'athlete_1', name: 'Amina Trymaker', position: 'Fly-half' },
    });

    const outcome = await finalizeSubmission(db as never, 'match_1', ENABLED);

    expect(outcome).toMatchObject({ action: 'blocked', reason: 'submission_too_large' });
    const exception = writes.find((write) => write.path.startsWith('reconciliationExceptions/'));
    expect(String((exception?.data as { issues?: string[] })?.issues?.join(' '))).toContain('safe budget');
  });

  it('still finalizes a realistic result', async () => {
    // The bound must not refuse real matches.
    const { db } = fakeDb({
      'resultSubmissions/match_1': submission,
      'matches/match_1': match,
      'athletes/athlete_1': { id: 'athlete_1', name: 'Amina Trymaker', position: 'Fly-half' },
      'athletes/athlete_2': { id: 'athlete_2', name: 'Noah Non Scorer', position: 'Lock' },
      'athletes/athlete_3': { id: 'athlete_3', name: 'Grace Defender', position: 'Back Row' },
    });

    const outcome = await finalizeSubmission(db as never, 'match_1', ENABLED);
    expect(outcome).toMatchObject({ action: 'finalized' });
  });
});
