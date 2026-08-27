import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { clearFirestore, ENABLED, integrationDb, shutdown } from './harness';
import { finalizeFieldReport, finalizeLeagueReport, finalizeSubmission } from '@/server/resultFinalizer';
import { bindReportToEvents } from '@/lib/matchOps/digest';

let db: Firestore;

beforeEach(async () => {
  db = integrationDb();
  await clearFirestore();
});

afterAll(shutdown);

const MATCH = 'match_int_1';

async function seedMatch(overrides: Record<string, unknown> = {}) {
  await db.collection('matches').doc(MATCH).set({
    id: MATCH,
    sport: 'football',
    leagueId: 'league_1',
    seasonId: 'season_1',
    homeTeamId: 'team_home',
    awayTeamId: 'team_away',
    venue: 'Kampala Ground',
    scheduledAt: '2026-08-24T15:00:00.000Z',
    status: 'scheduled',
    verificationStatus: 'pending',
    score: { home: null, away: null },
    ...overrides,
  });
}

async function seedAthletes() {
  await db.collection('athletes').doc('athlete_1').set({
    id: 'athlete_1', legalName: 'Emmanuel Okello', registeredPosition: 'Forward',
    teamId: 'team_home', leagueId: 'league_1', verificationStatus: 'verified',
  });
  await db.collection('athletes').doc('athlete_2').set({
    id: 'athlete_2', legalName: 'Musa Kato', registeredPosition: 'Lock',
    teamId: 'team_away', leagueId: 'league_1', verificationStatus: 'verified',
  });
}

async function seedEvents(rows: { id: string; team: string; athlete: string | null; seq: number; status?: string }[]) {
  for (const row of rows) {
    await db.collection('liveMatchEvents').doc(`${MATCH}_${row.id}`).set({
      eventId: `${MATCH}_${row.id}`,
      matchId: MATCH,
      leagueId: 'league_1',
      seasonId: 'season_1',
      sport: 'football',
      eventType: 'football.goal',
      period: '1',
      gameClockMs: row.seq * 60_000,
      teamId: row.team,
      athleteId: row.athlete,
      payload: {},
      source: 'field_manager',
      assignmentId: 'fma_1',
      sessionId: 'mos_1',
      sessionGeneration: 1,
      clientEventId: row.id,
      clientSequence: row.seq,
      deviceTime: '2026-08-24T15:10:00.000Z',
      createdAtServer: '2026-08-24T15:10:00.000Z',
      status: row.status ?? 'active',
    });
  }
}

/**
 * Seeds a report bound to whatever events currently exist, which is what attestation does.
 *
 * Computed here rather than hardcoded, so a test that changes the event set gets a report that
 * genuinely attested to that set. A fixed digest would make every case pass or fail for the
 * wrong reason.
 */
async function currentBinding() {
  const snap = await db.collection('liveMatchEvents').where('matchId', '==', MATCH).get();
  const events = snap.docs.map((doc) => doc.data() as never);
  return bindReportToEvents(events, events.length);
}

async function seedReport(overrides: Record<string, unknown> = {}) {
  const binding = await currentBinding();
  await db.collection('matchReports').doc(MATCH).set({
    reportVersion: 1,
    eventDigest: binding.eventDigest,
    eventCount: binding.eventCount,
    eventStreamVersion: binding.eventStreamVersion,
    id: MATCH,
    matchId: MATCH,
    leagueId: 'league_1',
    seasonId: 'season_1',
    sport: 'football',
    source: 'field_capture',
    declaredHomeScore: 2,
    declaredAwayScore: 1,
    reconstructedHomeScore: 2,
    reconstructedAwayScore: 1,
    assignmentId: 'fma_1',
    sessionId: 'mos_1',
    eventCount: 3,
    exceptions: [],
    status: 'ready_for_finalization',
    resultVersion: 1,
    attestedAt: '2026-08-24T17:00:00.000Z',
    ...overrides,
  });
}

async function cleanFieldCapture() {
  await seedMatch();
  await seedAthletes();
  await seedEvents([
    { id: 'e1', team: 'team_home', athlete: 'athlete_1', seq: 1 },
    { id: 'e2', team: 'team_home', athlete: 'athlete_1', seq: 2 },
    { id: 'e3', team: 'team_away', athlete: 'athlete_2', seq: 3 },
  ]);
  await seedReport();
}

describe('a clean field report becomes official with no human action', () => {
  it('writes the official result, the canonical events and the provenance', async () => {
    await cleanFieldCapture();

    const outcome = await finalizeFieldReport(db, MATCH, ENABLED);

    expect(outcome).toMatchObject({ action: 'finalized' });

    // The match carries the official result.
    const match = (await db.collection('matches').doc(MATCH).get()).data()!;
    expect(match.verificationStatus).toBe('verified');
    expect(match.score).toEqual({ home: 2, away: 1 });
    expect(match.officialResultVersion).toBe(1);

    // Canonical events exist, and they name a match ops session rather than a user.
    const events = await db.collection('officialSportEvents').where('matchId', '==', MATCH).get();
    expect(events.size).toBeGreaterThan(0);
    const scorer = events.docs.map((doc) => doc.data()).find((event) => event.eventType === 'football.goal');
    expect(scorer?.eventSchemaVersion).toBe('2.0.0');
    expect(scorer?.sourcePrincipal).toEqual({
      principalType: 'match_ops_session',
      matchSessionId: 'mos_1',
      fieldManagerAssignmentId: 'fma_1',
    });
    expect(scorer?.payload).toMatchObject({ value: 1, sourceType: 'field_capture' });
    expect(scorer?.payload).not.toHaveProperty('source');
    // A field capture event has no submitting user at all, which is the whole reason the
    // schema was versioned.
    expect(scorer?.submittedByUserId).toBeUndefined();

    // The ledger records how this became official, and what it is worth.
    const ledger = await db.collection('finalizations').get();
    expect(ledger.size).toBe(1);
    const entry = ledger.docs[0].data();
    expect(entry).toMatchObject({
      sourceType: 'field_capture',
      sourcePrincipalType: 'match_ops_session',
    });

    /**
     * Four separate facts, which is what makes an official number explainable later.
     *
     * A reader asking "how did this become official" gets: the V2 operating model, report 381
     * at version 1, a named match ops session, a planner version, and a computed tier. One
     * enum carrying all of that would answer none of it.
     */
    expect(entry.provenance).toMatchObject({
      workflow: 'result_engine_v2',
      source: { type: 'field_capture', recordId: MATCH, recordVersion: 1 },
      principal: { type: 'match_ops_session', actor: 'match_ops_session', matchSessionId: 'mos_1' },
      quality: expect.any(String),
    });
    expect(entry.provenance.finalization.candidateId).toBe(`field_capture:${MATCH}:v1`);
    expect(entry.dataQuality.tier).toEqual(expect.any(String));

    // And the report says official only now, not at attestation.
    const report = (await db.collection('matchReports').doc(MATCH).get()).data()!;
    expect(report.status).toBe('official');
    expect(report.officialResultVersion).toBe(1);
  });

  it('produces one official result when the trigger is delivered twice', async () => {
    await cleanFieldCapture();

    const first = await finalizeFieldReport(db, MATCH, ENABLED);
    const second = await finalizeFieldReport(db, MATCH, ENABLED);

    expect(first).toMatchObject({ action: 'finalized' });
    // Firestore delivers at least once. The second delivery must find the work already done.
    expect(second).toMatchObject({ action: 'skipped' });

    expect((await db.collection('finalizations').get()).size).toBe(1);
    const events = await db.collection('officialSportEvents').where('matchId', '==', MATCH).get();
    const ids = events.docs.map((doc) => doc.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect((await db.collection('matches').doc(MATCH).get()).data()?.officialResultVersion).toBe(1);
  });
});

describe('a report the engine should refuse writes nothing official', () => {
  it('refuses when the events have moved since attestation', async () => {
    await cleanFieldCapture();
    // A late sync from a quarantined session lands a fourth goal after the Field Manager
    // attested to 2-1.
    await seedEvents([{ id: 'e4', team: 'team_home', athlete: 'athlete_1', seq: 4 }]);

    const outcome = await finalizeFieldReport(db, MATCH, ENABLED);

    expect(outcome).toMatchObject({ action: 'skipped' });
    expect((await db.collection('finalizations').get()).size).toBe(0);
    expect((await db.collection('officialSportEvents').where('matchId', '==', MATCH).get()).size).toBe(0);
    expect((await db.collection('matches').doc(MATCH).get()).data()?.verificationStatus).toBe('pending');
  });

  it('refuses a report that has not passed the gate', async () => {
    await cleanFieldCapture();
    await db.collection('matchReports').doc(MATCH).update({ status: 'league_review' });

    expect(await finalizeFieldReport(db, MATCH, ENABLED)).toMatchObject({ action: 'skipped' });
    expect((await db.collection('finalizations').get()).size).toBe(0);
  });

  it('refuses a candidate whose match does not exist', async () => {
    await seedAthletes();
    await seedEvents([{ id: 'e1', team: 'team_home', athlete: 'athlete_1', seq: 1 }]);
    await seedReport({ reconstructedHomeScore: 1, reconstructedAwayScore: 0, declaredHomeScore: 1, declaredAwayScore: 0 });

    expect(await finalizeFieldReport(db, MATCH, ENABLED)).toEqual({ action: 'skipped', reason: 'no_match' });
    expect((await db.collection('officialSportEvents').get()).size).toBe(0);
  });

  it('leaves the report alone when it refuses, rather than half-marking it', async () => {
    await cleanFieldCapture();
    await db.collection('matches').doc(MATCH).update({ officialResultVersion: 5 });

    // A stale delivery arriving after a correction already made version 5 live.
    expect(await finalizeFieldReport(db, MATCH, ENABLED)).toEqual({ action: 'skipped', reason: 'stale_version' });
    expect((await db.collection('matchReports').doc(MATCH).get()).data()?.status).toBe('ready_for_finalization');
  });
});

describe('the bilateral workflow still behaves exactly as before', () => {
  /**
   * The compatibility proof. The refactor moved the legacy path behind a loader and an adapter,
   * and this asserts that a confirmed submission still produces the same official record it
   * always did, against a real transaction rather than a fake database.
   */
  it('finalizes a confirmed submission and advances its own lifecycle', async () => {
    await seedMatch();
    await seedAthletes();
    await db.collection('resultSubmissions').doc(MATCH).set({
      id: MATCH,
      matchId: MATCH,
      leagueId: 'league_1',
      seasonId: 'season_1',
      sport: 'football',
      submittedByTeamId: 'team_home',
      opponentTeamId: 'team_away',
      submittedByUserId: 'user_9',
      status: 'confirmed',
      resolution: 'opponent_confirmed',
      homeScore: 2,
      awayScore: 1,
      resultVersion: 1,
      scorers: [
        { athleteId: 'athlete_1', teamId: 'team_home', count: 2 },
        { athleteId: 'athlete_2', teamId: 'team_away', count: 1 },
      ],
      evidenceRefs: [],
      createdAt: '2026-08-24T17:00:00.000Z',
    });

    const outcome = await finalizeSubmission(db, MATCH, ENABLED);

    expect(outcome).toMatchObject({ action: 'finalized' });

    const submission = (await db.collection('resultSubmissions').doc(MATCH).get()).data()!;
    expect(submission.status).toBe('official');
    expect(submission.finalizationSource).toBe('mutual_confirmation');
    expect(submission.finalizedAt).toEqual(expect.any(String));

    // Its own audit trail still gets its entry, which the adapter now owns.
    const events = await db.collection('resultSubmissions').doc(MATCH).collection('events').get();
    expect(events.size).toBe(1);
    expect(events.docs[0].data()).toMatchObject({ actor: 'system', to: 'official' });

    // And the provenance says what produced it, not what produces everything.
    const ledger = await db.collection('finalizations').get();
    const entry = ledger.docs[0].data();
    expect(entry).toMatchObject({
      sourceType: 'legacy_team_submission',
      sourcePrincipalType: 'user',
      sourcePrincipalId: 'user_9',
    });

    // History keeps its own words: V1 workflow, legacy team operator, not relabelled into V2
    // terminology by a migration that happened years later.
    expect(entry.provenance).toMatchObject({
      workflow: 'result_engine_v1',
      source: { type: 'legacy_team_submission' },
      principal: { type: 'user', actor: 'legacy_team_operator', userId: 'user_9' },
    });
  });

  it('refuses an unconfirmed submission', async () => {
    await seedMatch();
    await db.collection('resultSubmissions').doc(MATCH).set({
      id: MATCH, matchId: MATCH, leagueId: 'league_1', seasonId: 'season_1',
      status: 'pending_confirmation', homeScore: 2, awayScore: 1, resultVersion: 1,
      submittedByUserId: 'user_9', scorers: [],
    });

    expect(await finalizeSubmission(db, MATCH, ENABLED)).toEqual({ action: 'skipped', reason: 'not_finalizable' });
    expect((await db.collection('finalizations').get()).size).toBe(0);
  });
});

describe('an athlete who should not be in the record is kept out of it', () => {
  /**
   * A goal attributed to somebody registered to a club that is not playing.
   *
   * The engine does not refuse the whole match over it, and that is deliberate: the other
   * goals were observed correctly and a league that loses a whole result over one bad
   * attribution learns to stop reporting. The athlete is excluded from the official record and
   * the exclusion is written down where the league can see it.
   */
  it('excludes the athlete and records why, without discarding the match', async () => {
    await seedMatch();
    await seedAthletes();
    await db.collection('athletes').doc('athlete_stranger').set({
      id: 'athlete_stranger',
      legalName: 'Wrong Club',
      registeredPosition: 'Forward',
      teamId: 'team_elsewhere',
      leagueId: 'league_1',
      verificationStatus: 'verified',
    });
    await seedEvents([
      { id: 'e1', team: 'team_home', athlete: 'athlete_1', seq: 1 },
      { id: 'e2', team: 'team_home', athlete: 'athlete_stranger', seq: 2 },
      { id: 'e3', team: 'team_away', athlete: 'athlete_2', seq: 3 },
    ]);
    await seedReport();

    const outcome = await finalizeFieldReport(db, MATCH, ENABLED);

    expect(outcome).toMatchObject({ action: 'finalized' });

    // No official statistic for the athlete who was not in this fixture.
    const stats = await db.collection('officialAthleteMatchStats').where('matchId', '==', MATCH).get();
    const athleteIds = stats.docs.map((doc) => doc.data().athleteId);
    expect(athleteIds).not.toContain('athlete_stranger');

    // And the exclusion is recorded for the league, with the reason.
    const reconciliation = await db.collection('officialMatchReconciliation').get();
    const issues = reconciliation.docs[0]?.data().eligibilityIssues ?? [];
    expect(issues.map((issue: { athleteId: string }) => issue.athleteId)).toContain('athlete_stranger');
  });
});

describe('a correction produces a new version rather than an edit', () => {
  it('supersedes the live version and leaves the first one readable', async () => {
    await cleanFieldCapture();
    await finalizeFieldReport(db, MATCH, ENABLED);

    // The Field Manager missed a goal. The league corrects the record: a second version, with
    // its own events and its own ledger entry.
    await seedEvents([{ id: 'e4', team: 'team_home', athlete: 'athlete_1', seq: 4 }]);
    // Re-attested over the new set, which is what a correction is: a new report version bound
    // to a new digest, never an amendment of the one already finalized.
    const rebound = await currentBinding();
    await db.collection('matchReports').doc(MATCH).set({
      id: MATCH,
      matchId: MATCH,
      leagueId: 'league_1',
      seasonId: 'season_1',
      sport: 'football',
      source: 'field_capture',
      declaredHomeScore: 3,
      declaredAwayScore: 1,
      reconstructedHomeScore: 3,
      reconstructedAwayScore: 1,
      assignmentId: 'fma_1',
      sessionId: 'mos_1',
      exceptions: [],
      status: 'ready_for_finalization',
      resultVersion: 2,
      reportVersion: 2,
      eventDigest: rebound.eventDigest,
      eventCount: rebound.eventCount,
      eventStreamVersion: rebound.eventStreamVersion,
      attestedAt: '2026-08-24T18:00:00.000Z',
    });

    const outcome = await finalizeFieldReport(db, MATCH, ENABLED);

    expect(outcome).toMatchObject({ action: 'finalized' });

    const match = (await db.collection('matches').doc(MATCH).get()).data()!;
    expect(match.officialResultVersion).toBe(2);
    expect(match.score).toEqual({ home: 3, away: 1 });

    // Two ledger entries, because two versions were finalized. History is not overwritten.
    expect((await db.collection('finalizations').get()).size).toBe(2);

    // Both versions' events remain readable: the first is evidence of what was official then.
    const events = await db.collection('officialSportEvents').where('matchId', '==', MATCH).get();
    const versions = new Set(events.docs.map((doc) => doc.data().officialResultVersion));
    expect(versions).toEqual(new Set([1, 2]));
  });
});

describe('the surplus gate still refuses through the adapter', () => {
  /**
   * The bilateral workflow's own integrity check, proven end to end after the refactor moved
   * its writes behind the lifecycle adapter. Scorers that add up to more than the agreed score
   * cannot be repaired by attribution, so nothing official is written.
   */
  it('writes no official record when the scorers exceed the agreed score', async () => {
    await seedMatch();
    await seedAthletes();
    await db.collection('resultSubmissions').doc(MATCH).set({
      id: MATCH,
      matchId: MATCH,
      leagueId: 'league_1',
      seasonId: 'season_1',
      sport: 'football',
      submittedByTeamId: 'team_home',
      opponentTeamId: 'team_away',
      submittedByUserId: 'user_9',
      status: 'confirmed',
      resolution: 'opponent_confirmed',
      homeScore: 1,
      awayScore: 0,
      resultVersion: 1,
      // Three goals claimed against a 1-0 result.
      scorers: [{ athleteId: 'athlete_1', teamId: 'team_home', count: 3 }],
      evidenceRefs: [],
      createdAt: '2026-08-24T17:00:00.000Z',
    });

    const outcome = await finalizeSubmission(db, MATCH, ENABLED);

    expect(outcome).toMatchObject({ action: 'blocked', reason: 'reconciliation_surplus' });
    expect((await db.collection('finalizations').get()).size).toBe(0);
    expect((await db.collection('officialSportEvents').where('matchId', '==', MATCH).get()).size).toBe(0);
    expect((await db.collection('matches').doc(MATCH).get()).data()?.verificationStatus).toBe('pending');

    // The submission is marked so a later write does not re-enter finalization, and its own
    // audit trail carries one entry explaining the refusal.
    const submission = (await db.collection('resultSubmissions').doc(MATCH).get()).data()!;
    expect(submission.finalizationStatus).toBe('blocked_reconciliation');
    expect(submission.status).toBe('confirmed');
    const events = await db.collection('resultSubmissions').doc(MATCH).collection('events').get();
    expect(events.size).toBe(1);
    expect(events.docs[0].data().note).toContain('exceed the submitted score');
  });

  it('does not append a second audit entry when the trigger is redelivered', async () => {
    await seedMatch();
    await seedAthletes();
    await db.collection('resultSubmissions').doc(MATCH).set({
      id: MATCH, matchId: MATCH, leagueId: 'league_1', seasonId: 'season_1', sport: 'football',
      submittedByTeamId: 'team_home', opponentTeamId: 'team_away', submittedByUserId: 'user_9',
      status: 'confirmed', resolution: 'opponent_confirmed', homeScore: 1, awayScore: 0,
      resultVersion: 1, scorers: [{ athleteId: 'athlete_1', teamId: 'team_home', count: 3 }],
      evidenceRefs: [], createdAt: '2026-08-24T17:00:00.000Z',
    });

    await finalizeSubmission(db, MATCH, ENABLED);
    // The second delivery finds the submission already blocked and stops before the gate.
    const second = await finalizeSubmission(db, MATCH, ENABLED);

    expect(second).toEqual({ action: 'skipped', reason: 'blocked_reconciliation' });
    const events = await db.collection('resultSubmissions').doc(MATCH).collection('events').get();
    expect(events.size).toBe(1);
  });
});

describe('an attested report means one exact set of events', () => {
  /**
   * The failure the score comparison could not see.
   *
   * A goal reattributed from one athlete to another between attestation and finalization leaves
   * the total identical and changes whose career record it lands on. Before the binding this
   * finalized cleanly, crediting the wrong player from an official record nobody attested to.
   */
  it('refuses a reattributed goal even though the score is unchanged', async () => {
    await cleanFieldCapture();

    // Same match, same score, different scorer.
    await db.collection('liveMatchEvents').doc(`${MATCH}_e1`).update({ athleteId: 'athlete_2' });

    const outcome = await finalizeFieldReport(db, MATCH, ENABLED);

    expect(outcome).toEqual({ action: 'skipped', reason: 'events_changed_since_attestation' });
    expect((await db.collection('finalizations').get()).size).toBe(0);
    expect((await db.collection('officialSportEvents').where('matchId', '==', MATCH).get()).size).toBe(0);
  });

  it('refuses when an event is superseded after attestation', async () => {
    await cleanFieldCapture();

    // A correction that removes a goal from the active set. The ids are unchanged; the record
    // is not.
    await db.collection('liveMatchEvents').doc(`${MATCH}_e3`).update({ status: 'superseded' });

    expect(await finalizeFieldReport(db, MATCH, ENABLED))
      .toEqual({ action: 'skipped', reason: 'events_changed_since_attestation' });
  });

  /**
   * A report written before the binding existed cannot be finalized on trust, because there is
   * no way to tell whether its events are the ones it attested to. Refusing is the safe answer:
   * the league re-attests, which is one screen, rather than the platform publishing a result it
   * cannot vouch for.
   */
  it('refuses a report carrying no binding at all', async () => {
    await cleanFieldCapture();
    await db.collection('matchReports').doc(MATCH).update({ eventDigest: '' });

    expect(await finalizeFieldReport(db, MATCH, ENABLED))
      .toEqual({ action: 'skipped', reason: 'report_has_no_event_binding' });
  });

  it('finalizes once the report is re-attested over the new set', async () => {
    await cleanFieldCapture();
    await seedEvents([{ id: 'e4', team: 'team_home', athlete: 'athlete_1', seq: 4 }]);

    // Stale binding: refused.
    expect((await finalizeFieldReport(db, MATCH, ENABLED)).action).toBe('skipped');

    // Re-attested over what is actually there, as a new report version.
    const rebound = await currentBinding();
    await db.collection('matchReports').doc(MATCH).update({
      reportVersion: 2,
      eventDigest: rebound.eventDigest,
      eventCount: rebound.eventCount,
      eventStreamVersion: rebound.eventStreamVersion,
      declaredHomeScore: 3,
      reconstructedHomeScore: 3,
      status: 'ready_for_finalization',
    });

    const outcome = await finalizeFieldReport(db, MATCH, ENABLED);

    expect(outcome).toMatchObject({ action: 'finalized' });
    expect((await db.collection('matches').doc(MATCH).get()).data()?.score).toEqual({ home: 3, away: 1 });
  });
});

describe('the third source: a league entering a result afterwards', () => {
  async function seedLeagueReport(overrides: Record<string, unknown> = {}) {
    await db.collection('matchReports').doc(MATCH).set({
      id: MATCH,
      matchId: MATCH,
      leagueId: 'league_1',
      seasonId: 'season_1',
      sport: 'football',
      source: 'league_post_match',
      declaredHomeScore: 2,
      declaredAwayScore: 1,
      reconstructedHomeScore: 2,
      reconstructedAwayScore: 1,
      eventCount: 0,
      enteredByUserId: 'league_admin_1',
      scorers: [
        { athleteId: 'athlete_1', teamId: 'team_home', count: 2 },
        { athleteId: 'athlete_2', teamId: 'team_away', count: 1 },
      ],
      exceptions: [],
      status: 'ready_for_finalization',
      resultVersion: 1,
      attestedAt: '2026-08-25T17:00:00.000Z',
      ...overrides,
    });
  }

  it('finalizes through the same engine and says what it was', async () => {
    await seedMatch();
    await seedAthletes();
    await seedLeagueReport();

    const outcome = await finalizeLeagueReport(db, MATCH, ENABLED);

    expect(outcome).toMatchObject({ action: 'finalized' });
    expect((await db.collection('matches').doc(MATCH).get()).data()?.score).toEqual({ home: 2, away: 1 });

    const entry = (await db.collection('finalizations').get()).docs[0].data();
    expect(entry.provenance).toMatchObject({
      workflow: 'result_engine_v2',
      source: { type: 'league_post_match' },
      principal: { type: 'user', actor: 'league_admin', userId: 'league_admin_1' },
    });
    // Bronze however careful the operator was: the evidence for a typed score is somebody's
    // memory, and no amount of care changes that.
    expect(entry.dataQuality.tier).toBe('bronze');
  });

  it('needs no event binding, because there are no events to be bound to', async () => {
    // The digest check is meaningless here. A typed score is exactly what somebody typed, and
    // reconciling it against itself would manufacture a comparison that proves nothing.
    await seedMatch();
    await seedAthletes();
    // No eventDigest field at all, which is what a league report actually looks like.
    await seedLeagueReport();

    expect((await finalizeLeagueReport(db, MATCH, ENABLED)).action).toBe('finalized');
  });

  it('refuses to run a league report through the field loader, and the reverse', async () => {
    await seedMatch();
    await seedAthletes();
    await seedLeagueReport();

    // The loaders are not interchangeable, and a mix-up would attribute a typed score to a
    // Field Manager who was never there.
    expect(await finalizeFieldReport(db, MATCH, ENABLED)).toEqual({ action: 'skipped', reason: 'not_field_capture' });
  });
});
