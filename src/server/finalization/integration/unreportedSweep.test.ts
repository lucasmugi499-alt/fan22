import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { sweepUnreportedMatches } from '../unreportedSweep';
import { clearFirestore, integrationDb, shutdown } from './harness';

const NOW = new Date('2026-08-26T18:00:00.000Z');
const MATCH = 'match_unreported_canary';

let db: Firestore;

beforeEach(async () => {
  db = integrationDb();
  await clearFirestore();
  await db.collection('matches').doc(MATCH).set({
    id: MATCH,
    leagueId: 'league_1',
    scheduledAt: '2026-08-16T18:00:00.000Z',
    status: 'scheduled',
    verificationStatus: 'pending',
    effectiveCapturePolicy: 'FIELD_REQUIRED',
    capturePolicyBoundAt: '2026-08-01T00:00:00.000Z',
  });
});

afterAll(shutdown);

describe('unreported match sweep', () => {
  it('reports an eligible fixture without writing in dry-run mode', async () => {
    const result = await sweepUnreportedMatches(db, NOW, { dryRun: true });

    expect(result).toMatchObject({
      scanned: 1,
      eligible: 1,
      alreadyOpen: 0,
      wouldOpen: 1,
      opened: 0,
      candidateMatchIds: [MATCH],
    });
    expect((await db.collection('matchOperationalExceptions').get()).empty).toBe(true);
  });

  it('opens one deterministic case and replay adds no side effects', async () => {
    const first = await sweepUnreportedMatches(db, NOW);
    const second = await sweepUnreportedMatches(db, NOW);

    expect(first).toMatchObject({ eligible: 1, wouldOpen: 1, opened: 1 });
    expect(second).toMatchObject({ eligible: 1, alreadyOpen: 1, wouldOpen: 0, opened: 0 });
    const exceptions = await db.collection('matchOperationalExceptions').get();
    expect(exceptions.docs.map((doc) => doc.id)).toEqual([`${MATCH}_result_never_reported`]);
    expect(exceptions.docs[0].data()).toMatchObject({
      matchId: MATCH,
      code: 'result_never_reported',
      blocking: true,
      status: 'open',
    });

    const unchangedMatch = (await db.collection('matches').doc(MATCH).get()).data();
    expect(unchangedMatch).not.toHaveProperty('score');
    expect(unchangedMatch).not.toHaveProperty('officialResultVersion');
    expect((await db.collection('finalizations').get()).empty).toBe(true);
    expect((await db.collection('officialSportEvents').get()).empty).toBe(true);
    expect((await db.collection('officialAthleteMatchStats').get()).empty).toBe(true);
  });

  it('scans past the first page without flagging legacy or reported fixtures', async () => {
    await db.collection('matches').doc('legacy_old').set({
      id: 'legacy_old',
      leagueId: 'league_1',
      scheduledAt: '2026-08-01T18:00:00.000Z',
      status: 'scheduled',
      verificationStatus: 'pending',
      effectiveCapturePolicy: 'FIELD_REQUIRED',
    });
    await db.collection('matches').doc('reported_old').set({
      id: 'reported_old',
      leagueId: 'league_1',
      scheduledAt: '2026-08-10T18:00:00.000Z',
      status: 'completed',
      verificationStatus: 'pending',
      effectiveCapturePolicy: 'FIELD_REQUIRED',
      capturePolicyBoundAt: '2026-08-01T00:00:00.000Z',
    });
    await db.collection('matchReports').doc('reported_old').set({ status: 'league_review' });

    const result = await sweepUnreportedMatches(db, NOW, { dryRun: true, pageSize: 1 });

    expect(result).toMatchObject({ scanned: 3, eligible: 1, wouldOpen: 1, opened: 0 });
    expect(result.candidateMatchIds).toEqual([MATCH]);
  });
});
