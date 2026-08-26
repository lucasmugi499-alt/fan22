import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { clearFirestore, ENABLED, integrationDb, shutdown } from './harness';
import { finalizeFieldReport } from '@/server/resultFinalizer';
import { bindReportToEvents } from '@/lib/matchOps/digest';
import { compareSnapshots, verifyBadReport, verifyCanary } from '../../../../scripts/release/field-capture-canary';

let db: Firestore;

beforeEach(async () => {
  db = integrationDb();
  await clearFirestore();
});

afterAll(shutdown);

const MATCH = 'match_canary';

async function seedCanaryMatch(matchId: string, goals: { id: string; team: string; athlete: string; seq: number }[]) {
  await db.collection('matches').doc(matchId).set({
    id: matchId, sport: 'football', leagueId: 'league_1', seasonId: 'season_1',
    homeTeamId: 'team_home', awayTeamId: 'team_away', venue: 'Kampala Ground',
    scheduledAt: '2026-08-25T15:00:00.000Z', status: 'scheduled',
    verificationStatus: 'pending', score: { home: null, away: null },
  });
  await db.collection('athletes').doc('athlete_1').set({
    id: 'athlete_1', legalName: 'Emmanuel Okello', registeredPosition: 'Forward',
    teamId: 'team_home', leagueId: 'league_1', verificationStatus: 'verified',
  });
  await db.collection('athletes').doc('athlete_2').set({
    id: 'athlete_2', legalName: 'Musa Kato', registeredPosition: 'Lock',
    teamId: 'team_away', leagueId: 'league_1', verificationStatus: 'verified',
  });

  for (const goal of goals) {
    await db.collection('liveMatchEvents').doc(`${matchId}_${goal.id}`).set({
      eventId: `${matchId}_${goal.id}`, matchId, leagueId: 'league_1', seasonId: 'season_1',
      sport: 'football', eventType: 'football.goal', period: '1',
      gameClockMs: goal.seq * 60_000, teamId: goal.team, athleteId: goal.athlete, payload: {},
      source: 'field_manager', assignmentId: 'fma_1', sessionId: 'mos_1', sessionGeneration: 1,
      clientEventId: goal.id, clientSequence: goal.seq, deviceTime: '2026-08-25T15:10:00.000Z',
      createdAtServer: '2026-08-25T15:10:00.000Z', status: 'active',
    });
  }
}

async function attest(matchId: string, home: number, away: number, status = 'ready_for_finalization') {
  const snap = await db.collection('liveMatchEvents').where('matchId', '==', matchId).get();
  const binding = bindReportToEvents(snap.docs.map((doc) => doc.data() as never), snap.size);
  await db.collection('matchReports').doc(matchId).set({
    id: matchId, matchId, leagueId: 'league_1', seasonId: 'season_1', sport: 'football',
    source: 'field_capture', declaredHomeScore: home, declaredAwayScore: away,
    reconstructedHomeScore: home, reconstructedAwayScore: away,
    assignmentId: 'fma_1', sessionId: 'mos_1', reportVersion: 1,
    eventDigest: binding.eventDigest, eventCount: binding.eventCount,
    eventStreamVersion: binding.eventStreamVersion,
    exceptions: [], status, resultVersion: 1, attestedAt: '2026-08-25T17:00:00.000Z',
  });
}

/**
 * The canary verifier, proven against a real Firestore before it is ever pointed at demo.
 *
 * A verification tool that has never been shown to fail is not a verification tool. Each case
 * here breaks exactly one thing and asserts the corresponding check catches it, so the passing
 * run at the end means something.
 */
describe('the canary verifier', () => {
  it('passes a genuinely clean field capture', async () => {
    await seedCanaryMatch(MATCH, [
      { id: 'e1', team: 'team_home', athlete: 'athlete_1', seq: 1 },
      { id: 'e2', team: 'team_home', athlete: 'athlete_1', seq: 2 },
      { id: 'e3', team: 'team_away', athlete: 'athlete_2', seq: 3 },
    ]);
    await attest(MATCH, 2, 1);
    await finalizeFieldReport(db, MATCH, ENABLED);

    const report = await verifyCanary(db, MATCH);

    expect(report.checks.filter((check) => !check.passed)).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.candidateId).toBe(`field_capture:${MATCH}:v1`);
    expect(report.officialResultVersion).toBe(1);
    expect(report.officialEventCount).toBeGreaterThan(0);
  });

  it('fails when nothing was finalized at all', async () => {
    await seedCanaryMatch(MATCH, [{ id: 'e1', team: 'team_home', athlete: 'athlete_1', seq: 1 }]);
    await attest(MATCH, 1, 0);

    const report = await verifyCanary(db, MATCH);

    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.name === 'match is verified')?.passed).toBe(false);
    expect(report.checks.find((check) => check.name === 'exactly one finalization ledger entry')?.passed).toBe(false);
  });

  /**
   * The failure the whole verifier exists for. A duplicate finalization looks correct on the
   * surface, because the score is right; only the counts reveal it.
   */
  it('catches a second ledger entry that a surface check would miss', async () => {
    await seedCanaryMatch(MATCH, [{ id: 'e1', team: 'team_home', athlete: 'athlete_1', seq: 1 }]);
    await attest(MATCH, 1, 0);
    await finalizeFieldReport(db, MATCH, ENABLED);

    // A second entry, as a double-finalization would leave behind.
    await db.collection('finalizations').doc('duplicate_probe').set({
      matchId: MATCH, submissionId: MATCH, resultVersion: 1,
    });

    const report = await verifyCanary(db, MATCH);

    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.name === 'exactly one finalization ledger entry')?.passed).toBe(false);
  });

  it('catches an open blocking exception', async () => {
    await seedCanaryMatch(MATCH, [{ id: 'e1', team: 'team_home', athlete: 'athlete_1', seq: 1 }]);
    await attest(MATCH, 1, 0);
    await finalizeFieldReport(db, MATCH, ENABLED);
    await db.collection('matchOperationalExceptions').doc(`${MATCH}_probe`).set({
      matchId: MATCH, leagueId: 'league_1', code: 'declared_score_mismatch',
      blocking: true, status: 'open',
    });

    const report = await verifyCanary(db, MATCH);

    expect(report.checks.find((check) => check.name === 'no open blocking exception')?.passed).toBe(false);
  });

  it('proves a replay changed nothing', async () => {
    await seedCanaryMatch(MATCH, [
      { id: 'e1', team: 'team_home', athlete: 'athlete_1', seq: 1 },
      { id: 'e2', team: 'team_away', athlete: 'athlete_2', seq: 2 },
    ]);
    await attest(MATCH, 1, 1);
    await finalizeFieldReport(db, MATCH, ENABLED);
    const before = await verifyCanary(db, MATCH);

    // The redelivery.
    await finalizeFieldReport(db, MATCH, ENABLED);
    const after = await verifyCanary(db, MATCH);

    // Compared by counting the database, not by trusting what the finalizer returned: a
    // function reporting "skipped" while having written something is the bug worth catching.
    expect(compareSnapshots(before, after).filter((check) => !check.passed)).toEqual([]);
  });

  it('proves a bad report wrote nothing official and opened a case', async () => {
    const BAD = 'match_canary_bad';
    await seedCanaryMatch(BAD, [
      { id: 'e1', team: 'team_home', athlete: 'athlete_1', seq: 1 },
      { id: 'e2', team: 'team_home', athlete: 'athlete_1', seq: 2 },
    ]);
    // Attested 1-0 against events that reconstruct 2-0, and held for review.
    await attest(BAD, 1, 0, 'league_review');
    await db.collection('matchOperationalExceptions').doc(`${BAD}_declared_score_mismatch`).set({
      matchId: BAD, leagueId: 'league_1', code: 'declared_score_mismatch',
      blocking: true, status: 'open',
    });

    await finalizeFieldReport(db, BAD, ENABLED);

    const report = await verifyBadReport(db, BAD);

    expect(report.checks.filter((check) => !check.passed)).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it('fails a bad-report check if something official did get written', async () => {
    // The inverse, so the bad-report verifier is not merely a function that always passes.
    await seedCanaryMatch(MATCH, [{ id: 'e1', team: 'team_home', athlete: 'athlete_1', seq: 1 }]);
    await attest(MATCH, 1, 0);
    await finalizeFieldReport(db, MATCH, ENABLED);

    const report = await verifyBadReport(db, MATCH);

    expect(report.passed).toBe(false);
  });
});
