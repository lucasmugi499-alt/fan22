import { describe, expect, it } from 'vitest';
import { finalizeSubmission, reconciliationExceptionId } from './resultFinalizer';

/** Every test that expects work to happen runs with the gate open. */
const ENABLED = { mode: 'enabled' as const, canaryAllowlist: [] };

type RecordData = Record<string, unknown>;

let autoId = 0;

function docRef(path: string) {
  const segments = path.split('/');
  return {
    path,
    id: segments[segments.length - 1],
    collection: (name: string) => ({
      // Firestore mints a fresh id for every `.doc()` with no argument. A fixed id would
      // make two legitimate appends collide and hide the behaviour under test.
      doc: (id?: string) => docRef(`${path}/${name}/${id ?? `${name}_auto_${(autoId += 1)}`}`),
    }),
  };
}

function snapshot(ref: ReturnType<typeof docRef>, data: RecordData | undefined) {
  return { id: ref.id, exists: Boolean(data), data: () => data };
}

function fakeDb(initial: Record<string, RecordData>) {
  const records = new Map(Object.entries(initial));
  const writes: Array<{ op: string; path: string; data: RecordData }> = [];
  const db = {
    collection: (name: string) => ({ doc: (id: string) => docRef(`${name}/${id}`) }),
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
        records.set(ref.path, { ...(records.get(ref.path) ?? {}), ...data });
        writes.push({ op: 'set', path: ref.path, data });
      },
    }),
  };
  return { db, records, writes };
}

function matchFor(sport: string) {
  return {
    id: 'match_1',
    sport,
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
}

function submissionFor({
  homeScore,
  awayScore,
  homeScorerCount = 0,
  awayScorerCount = 0,
}: {
  homeScore: number;
  awayScore: number;
  homeScorerCount?: number;
  awayScorerCount?: number;
}) {
  const scorers = [];
  if (homeScorerCount > 0) scorers.push({ athleteId: 'athlete_1', teamId: 'team_home', count: homeScorerCount, minute: 12 });
  if (awayScorerCount > 0) scorers.push({ athleteId: 'athlete_3', teamId: 'team_away', count: awayScorerCount, minute: 40 });
  return {
    id: 'match_1',
    matchId: 'match_1',
    leagueId: 'league_1',
    seasonId: 'season_1',
    submittedByTeamId: 'team_home',
    opponentTeamId: 'team_away',
    submittedByUserId: 'team_admin_1',
    homeScore,
    awayScore,
    scorers,
    activeSquads: { team_home: ['athlete_1'], team_away: ['athlete_3'] },
    athleteStatLines: [],
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
}

const athletes = {
  'athletes/athlete_1': { id: 'athlete_1', name: 'Home Scorer', position: 'Striker', teamId: 'team_home' },
  'athletes/athlete_3': { id: 'athlete_3', name: 'Away Scorer', position: 'Striker', teamId: 'team_away' },
};

function setup(sport: string, submission: RecordData) {
  return fakeDb({
    'resultSubmissions/match_1': submission,
    'matches/match_1': matchFor(sport),
    ...athletes,
  });
}

/** The assertion that matters most: a blocked result publishes nothing official. */
function expectNoOfficialWrites(records: Map<string, RecordData>) {
  const official = [...records.keys()].filter((path) =>
    path.startsWith('officialSportEvents/')
    || path.startsWith('officialAthleteMatchStats/')
    || path.startsWith('officialMatchReconciliation/')
    || path.startsWith('finalizations/')
    || path.startsWith('standings/')
    || path.startsWith('fantasyPointEvents/'));
  expect(official).toEqual([]);
  // The match must keep its pre-match state: no score, still unverified.
  expect(records.get('matches/match_1')).toMatchObject({
    verificationStatus: 'pending',
    score: { home: null, away: null },
  });
}

describe('surplus reconciliation blocks finalization', () => {
  it('finalizes when events reconcile exactly', async () => {
    // Football: two goals, submitted 2-0.
    const { db, records } = setup('football', submissionFor({ homeScore: 2, awayScore: 0, homeScorerCount: 2 }));

    const outcome = await finalizeSubmission(db as never, 'match_1', ENABLED);

    expect(outcome).toMatchObject({ action: 'finalized' });
    expect(records.has(`reconciliationExceptions/${reconciliationExceptionId('match_1', 1)}`)).toBe(false);
  });

  it('finalizes a deficit, recording the gap as an unattributed score event', async () => {
    // Submitted 3-0 with only two attributable goals: an attribution gap, not a
    // contradiction, so the remainder is published explicitly and the result stands.
    const { db, records } = setup('football', submissionFor({ homeScore: 3, awayScore: 0, homeScorerCount: 2 }));

    const outcome = await finalizeSubmission(db as never, 'match_1', ENABLED);

    expect(outcome).toMatchObject({ action: 'finalized' });
    const unattributed = [...records.entries()].filter(([path, value]) =>
      path.startsWith('officialSportEvents/') && String(value.eventType).endsWith('unattributed_team_score'));
    expect(unattributed).toHaveLength(1);
    expect(unattributed[0][1]).toMatchObject({ payload: { value: 1 } });
  });

  for (const [sport, scorerCount, expectedReconstructed] of [
    ['football', 3, 3],
    ['rugby', 1, 5],
    ['basketball', 3, 3],
  ] as const) {
    it(`blocks a home surplus in ${sport} and writes nothing official`, async () => {
      // Submitted 2, events reconstruct more than 2.
      const { db, records } = setup(sport, submissionFor({ homeScore: 2, awayScore: 0, homeScorerCount: scorerCount }));

      const outcome = await finalizeSubmission(db as never, 'match_1', ENABLED);

      expect(outcome).toMatchObject({ action: 'blocked', reason: 'reconciliation_surplus' });
      expectNoOfficialWrites(records);

      const exception = records.get(`reconciliationExceptions/${reconciliationExceptionId('match_1', 1)}`);
      expect(exception).toMatchObject({
        matchId: 'match_1',
        leagueId: 'league_1',
        submissionId: 'match_1',
        submissionVersion: 1,
        sport,
        officialHomeScore: 2,
        reconstructedHomeScore: expectedReconstructed,
        homeDifference: expectedReconstructed - 2,
        reasonCode: 'scoring_events_exceed_submitted_result',
        status: 'open',
        reconciliationStatus: 'surplus',
        finalizationStatus: 'blocked',
        reviewStatus: 'league_review_required',
      });
      // Submitted evidence and events are preserved by reference, never rewritten.
      expect((exception as RecordData).evidenceRefs).toEqual([
        'matchEvidence/match_1/team_home/team_admin_1/photo.jpg',
      ]);
      expect(((exception as RecordData).eventIds as string[]).length).toBeGreaterThan(0);
    });
  }

  it('blocks an away surplus the same way', async () => {
    const { db, records } = setup('football', submissionFor({ homeScore: 0, awayScore: 1, awayScorerCount: 2 }));

    const outcome = await finalizeSubmission(db as never, 'match_1', ENABLED);

    expect(outcome).toMatchObject({ action: 'blocked' });
    expectNoOfficialWrites(records);
    expect(records.get(`reconciliationExceptions/${reconciliationExceptionId('match_1', 1)}`)).toMatchObject({
      officialAwayScore: 1,
      reconstructedAwayScore: 2,
      awayDifference: 1,
    });
  });

  it('opens ONE case when both sides contradict', async () => {
    const { db, records } = setup('football', submissionFor({
      homeScore: 1, awayScore: 1, homeScorerCount: 3, awayScorerCount: 2,
    }));

    const outcome = await finalizeSubmission(db as never, 'match_1', ENABLED);

    expect(outcome).toMatchObject({ action: 'blocked' });
    const cases = [...records.keys()].filter((p) => p.startsWith('reconciliationExceptions/'));
    expect(cases).toHaveLength(1);
    // One case describing both discrepancies, rather than two unrelated ones.
    expect(records.get(cases[0])).toMatchObject({ homeDifference: 2, awayDifference: 1 });
  });

  it('is idempotent across a redelivered trigger', async () => {
    const { db, records, writes } = setup('football', submissionFor({ homeScore: 2, awayScore: 0, homeScorerCount: 3 }));

    const first = await finalizeSubmission(db as never, 'match_1', ENABLED);
    const second = await finalizeSubmission(db as never, 'match_1', ENABLED);

    expect(first).toMatchObject({ action: 'blocked' });
    // The second delivery is refused by the eligibility check, before any planning.
    expect(second).toMatchObject({ action: 'skipped', reason: 'blocked_reconciliation' });

    expect([...records.keys()].filter((p) => p.startsWith('reconciliationExceptions/'))).toHaveLength(1);
    expectNoOfficialWrites(records);
    // Exactly one audit entry: a redelivery must not append a second identical note.
    const auditWrites = writes.filter((w) => w.path.includes('/events/'));
    expect(auditWrites).toHaveLength(1);
  });

  it('marks the submission so a later write cannot re-enter finalization', async () => {
    const { db, records } = setup('football', submissionFor({ homeScore: 2, awayScore: 0, homeScorerCount: 3 }));

    await finalizeSubmission(db as never, 'match_1', ENABLED);

    expect(records.get('resultSubmissions/match_1')).toMatchObject({
      finalizationStatus: 'blocked_reconciliation',
      reviewStatus: 'league_review_required',
      reconciliationExceptionId: reconciliationExceptionId('match_1', 1),
    });
    // The claim-lifecycle field is left alone; it has its own state machine.
    expect(records.get('resultSubmissions/match_1')).toMatchObject({ status: 'confirmed' });
  });

  it('finalizes once a corrected resubmission reconciles', async () => {
    const { db, records } = setup('football', submissionFor({ homeScore: 2, awayScore: 0, homeScorerCount: 3 }));
    await finalizeSubmission(db as never, 'match_1', ENABLED);

    // League review corrects the claim: a new version that reconciles, with the block
    // cleared. The old case stays on record against version 1.
    records.set('resultSubmissions/match_1', {
      ...submissionFor({ homeScore: 3, awayScore: 0, homeScorerCount: 3 }),
      resultVersion: 2,
      finalizationStatus: null,
      reviewStatus: null,
    });

    const outcome = await finalizeSubmission(db as never, 'match_1', ENABLED);

    expect(outcome).toMatchObject({ action: 'finalized' });
    // Exactly one official result, and the original case is still there as evidence.
    expect([...records.keys()].filter((p) => p.startsWith('finalizations/'))).toHaveLength(1);
    expect(records.has(`reconciliationExceptions/${reconciliationExceptionId('match_1', 1)}`)).toBe(true);
  });
});

/**
 * An official record must not contradict itself.
 *
 * Eligibility already kept ineligible athletes out of `officialAthleteMatchStats`, but the
 * event stream was written unfiltered — so `officialSportEvents` could credit a goal to an
 * athlete the same finalization had ruled ineligible.
 */
describe('official events exclude ineligible athletes', () => {
  function eventsFor(records: Map<string, RecordData>) {
    return [...records.entries()]
      .filter(([path]) => path.startsWith('officialSportEvents/'))
      .map(([, value]) => value);
  }

  it('publishes no event crediting an athlete registered to another club', async () => {
    const { db, records } = fakeDb({
      'resultSubmissions/match_1': submissionFor({ homeScore: 1, awayScore: 0, homeScorerCount: 1 }),
      'matches/match_1': matchFor('football'),
      // The claimed scorer is registered to a club that is not in this fixture.
      'athletes/athlete_1': { id: 'athlete_1', name: 'Ineligible', position: 'Striker', teamId: 'team_elsewhere' },
      'athletes/athlete_3': { id: 'athlete_3', name: 'Away', position: 'Striker', teamId: 'team_away' },
    });

    const outcome = await finalizeSubmission(db as never, 'match_1', ENABLED);
    expect(outcome).toMatchObject({ action: 'finalized' });

    const events = eventsFor(records);
    expect(events.length).toBeGreaterThan(0);
    // The contradiction: no official event may name an athlete excluded from official stats.
    expect(events.filter((event) => event.primaryAthleteId === 'athlete_1')).toEqual([]);
    expect(records.get('officialAthleteMatchStats/match_1_v1_athlete_1')).toBeUndefined();

    // The goal still happened, so the score is preserved and the gap is stated explicitly
    // rather than credited to someone this platform cannot stand behind.
    const unattributed = events.filter((event) => String(event.eventType).endsWith('unattributed_team_score'));
    expect(unattributed).toHaveLength(1);
    expect(unattributed[0]).toMatchObject({ payload: { value: 1 } });
    expect(records.get('matches/match_1')).toMatchObject({ score: { home: 1, away: 0 } });

    const reconciliation = records.get('officialMatchReconciliation/match_1_v1');
    expect((reconciliation as RecordData)?.eligibilityIssues).toMatchObject([
      { athleteId: 'athlete_1', reason: 'not_registered_to_claimed_team' },
    ]);
  });

  it('still publishes events for eligible athletes in the same match', async () => {
    const { db, records } = setup('football', submissionFor({ homeScore: 1, awayScore: 0, homeScorerCount: 1 }));

    await finalizeSubmission(db as never, 'match_1', ENABLED);

    const events = eventsFor(records);
    expect(events.filter((event) => event.primaryAthleteId === 'athlete_1').length).toBeGreaterThan(0);
  });
});

/**
 * The outbox is the contract that lets notification delivery exist later without the
 * finalizer knowing about it.
 */
describe('transactional outbox', () => {
  function outboxFor(records: Map<string, RecordData>) {
    return [...records.entries()].filter(([path]) => path.startsWith('outbox/'));
  }

  it('emits one deterministic event alongside the case', async () => {
    const { db, records } = setup('football', submissionFor({ homeScore: 2, awayScore: 0, homeScorerCount: 3 }));

    await finalizeSubmission(db as never, 'match_1', ENABLED);

    const events = outboxFor(records);
    expect(events).toHaveLength(1);
    const [path, event] = events[0];
    // Derived from the exception id, which is itself deterministic.
    expect(path).toBe('outbox/result_reconciliation_exception_created_reconciliation_match_1_1');
    expect(event).toMatchObject({
      type: 'result.reconciliation_exception.created',
      exceptionId: reconciliationExceptionId('match_1', 1),
      matchId: 'match_1',
      leagueId: 'league_1',
      status: 'pending',
      reviewStatus: 'league_review_required',
      officialScore: { home: 2, away: 0 },
      reconstructedScore: { home: 3, away: 0 },
    });
  });

  it('does not re-emit on a redelivered trigger', async () => {
    const { db, records } = setup('football', submissionFor({ homeScore: 2, awayScore: 0, homeScorerCount: 3 }));

    await finalizeSubmission(db as never, 'match_1', ENABLED);
    await finalizeSubmission(db as never, 'match_1', ENABLED);

    // One case, one event. A duplicate event would become a duplicate notification.
    expect(outboxFor(records)).toHaveLength(1);
    expect([...records.keys()].filter((path) => path.startsWith('reconciliationExceptions/'))).toHaveLength(1);
  });

  it('emits nothing when the result finalizes cleanly', async () => {
    const { db, records } = setup('football', submissionFor({ homeScore: 2, awayScore: 0, homeScorerCount: 2 }));

    await finalizeSubmission(db as never, 'match_1', ENABLED);

    expect(outboxFor(records)).toEqual([]);
  });
});
