import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { clearFirestore, ENABLED, integrationDb, shutdown } from './harness';
import { finalizeLeagueReport, finalizeResultCase } from '@/server/resultFinalizer';
import { resultCaseId } from '@/server/results/resultCase';

let db: Firestore;

beforeEach(async () => {
  db = integrationDb();
  await clearFirestore();
});

afterAll(shutdown);

const MATCH = 'match_case_1';

/**
 * The chain, end to end, against a real Firestore:
 *
 *   official result version -> result case -> ruling -> new official result version
 *
 * The property being proved is not that a correction works. It is that a correction reaches the
 * record through the SAME finalizer every other source uses, so version supersession, the
 * idempotency ledger and the standings rebuild are the ones that already exist. A second path
 * that could write an official score is what this design refuses, and an integration test is
 * the only place that refusal can actually be demonstrated.
 */

async function seedMatch() {
  await db.collection('matches').doc(MATCH).set({
    id: MATCH, sport: 'football', leagueId: 'league_1', seasonId: 'season_1',
    homeTeamId: 'team_home', awayTeamId: 'team_away', venue: 'Kampala Ground',
    scheduledAt: '2026-08-24T15:00:00.000Z', status: 'scheduled',
    verificationStatus: 'pending', score: { home: null, away: null },
  });
  await db.collection('seasons').doc('season_1').set({
    id: 'season_1', leagueId: 'league_1', sport: 'football', status: 'active',
  });
  for (const [id, name] of [['team_home', 'Kisenyi United'], ['team_away', 'Makindye City']]) {
    await db.collection('teams').doc(id).set({ id, name, leagueId: 'league_1', sport: 'football' });
  }
}

/**
 * An official result that lives in `matchReports`, not `resultSubmissions`.
 *
 * That is the whole reason this model exists. The old correction route loaded
 * `resultSubmissions/{matchId}`, and a V2 result — whether league post-match, as here, or field
 * capture — has no such document. Correcting one was impossible through the product.
 */
async function officialV2Result() {
  await db.collection('matchReports').doc(MATCH).set({
    id: MATCH, matchId: MATCH, leagueId: 'league_1', seasonId: 'season_1', sport: 'football',
    source: 'league_post_match', declaredHomeScore: 2, declaredAwayScore: 1,
    scorers: [], exceptions: [], status: 'ready_for_finalization', resultVersion: 1,
    enteredByUserId: 'user_league', attestedAt: '2026-08-24T17:00:00.000Z',
  });
  const outcome = await finalizeLeagueReport(db, MATCH, ENABLED);
  expect(outcome.action).toBe('finalized');
}

async function seedCase(overrides: Record<string, unknown> = {}) {
  const id = resultCaseId(MATCH, 1);
  await db.collection('resultCases').doc(id).set({
    id, matchId: MATCH, leagueId: 'league_1', seasonId: 'season_1', sport: 'football',
    subjectVersion: 1, subjectProvenance: null, status: 'resolved_corrected',
    openedByUserId: 'user_club', openedByScope: { scopeType: 'team', scopeId: 'team_home' },
    reason: 'The second goal was credited to the wrong club.',
    openedAt: '2026-08-30T18:00:00.000Z', updatedAt: '2026-08-30T18:00:00.000Z',
    evidence: [{
      collection: 'matchReports', documentId: MATCH,
      addedByUserId: 'user_club', addedAt: '2026-08-30T18:00:00.000Z',
    }],
    ruling: {
      decidedByUserId: 'user_league', decidedAt: '2026-08-31T09:00:00.000Z',
      outcome: 'corrected', rationale: 'Video shows the second goal belonged to the away club.',
      correctedScore: { home: 1, away: 2 },
    },
    ...overrides,
  });
  return id;
}

describe('a correction reaching the record through the one finalization path', () => {
  it('supersedes the V2 result it challenged', async () => {
    await seedMatch();
    await officialV2Result();
    const caseId = await seedCase();

    const outcome = await finalizeResultCase(db, caseId, ENABLED);

    expect(outcome.action).toBe('finalized');
    const match = (await db.collection('matches').doc(MATCH).get()).data() ?? {};
    expect(match.score).toEqual({ home: 1, away: 2 });
    expect(match.officialResultVersion).toBe(2);
    // Still verified: a corrected result is official, not provisional.
    expect(match.verificationStatus).toBe('verified');
  });

  it('records which version the ruling produced, on the case', async () => {
    await seedMatch();
    await officialV2Result();
    const caseId = await seedCase();

    await finalizeResultCase(db, caseId, ENABLED);

    const record = (await db.collection('resultCases').doc(caseId).get()).data() ?? {};
    // The last link in the chain: the case now names the version it produced, so the whole
    // sequence is readable in both directions.
    expect(record.resultingVersion).toBe(2);
    expect(record.status).toBe('resolved_corrected');
  });

  it('is idempotent, so a retry publishes nothing a second time', async () => {
    await seedMatch();
    await officialV2Result();
    const caseId = await seedCase();

    const first = await finalizeResultCase(db, caseId, ENABLED);
    const second = await finalizeResultCase(db, caseId, ENABLED);

    expect(first.action).toBe('finalized');
    expect(second.action).not.toBe('finalized');
    expect((await db.collection('matches').doc(MATCH).get()).data()?.officialResultVersion).toBe(2);
  });

  it('cannot roll back a newer official version', async () => {
    /*
     * The stale case. Somebody opens a case against version 1, the match moves to version 2 by
     * another route, and the ruling lands afterwards. `plan.ts`'s existing version guard is what
     * refuses it — which is the point of routing corrections through the same planner rather
     * than giving them their own write.
     */
    await seedMatch();
    await officialV2Result();
    await db.collection('matches').doc(MATCH).update({
      officialResultVersion: 5, score: { home: 4, away: 4 },
    });
    const caseId = await seedCase();

    const outcome = await finalizeResultCase(db, caseId, ENABLED);

    expect(outcome.action).not.toBe('finalized');
    const match = (await db.collection('matches').doc(MATCH).get()).data() ?? {};
    expect(match.officialResultVersion).toBe(5);
    expect(match.score).toEqual({ home: 4, away: 4 });
  });

  it('publishes nothing for a case that was not ruled corrected', async () => {
    await seedMatch();
    await officialV2Result();

    for (const status of ['open', 'under_review', 'proposed', 'escalated', 'resolved_upheld']) {
      await db.collection('resultCases').doc(resultCaseId(MATCH, 1)).delete();
      const caseId = await seedCase({ status });
      const outcome = await finalizeResultCase(db, caseId, ENABLED);
      expect(outcome.action, `status ${status}`).not.toBe('finalized');
    }
    expect((await db.collection('matches').doc(MATCH).get()).data()?.officialResultVersion).toBe(1);
  });

  it('publishes nothing for a case that names no corrected score', async () => {
    await seedMatch();
    await officialV2Result();
    const caseId = await seedCase({
      ruling: {
        decidedByUserId: 'user_league', decidedAt: '2026-08-31T09:00:00.000Z',
        outcome: 'corrected', rationale: 'Something changed but nobody said what.',
      },
    });

    const outcome = await finalizeResultCase(db, caseId, ENABLED);
    expect(outcome.action).not.toBe('finalized');
  });

  it('rebuilds the league table from the corrected result', async () => {
    // The reason corrections go through the finalizer rather than writing a score: everything
    // derived from a result has to follow it, and this is the derivation that is most visible.
    await seedMatch();
    await officialV2Result();

    const before = await db.collection('standings').where('seasonId', '==', 'season_1').get();
    const homeBefore = before.docs.find((doc) => doc.data().teamId === 'team_home')?.data();
    expect(homeBefore?.points).toBe(3);

    await finalizeResultCase(db, await seedCase(), ENABLED);

    const after = await db.collection('standings').where('seasonId', '==', 'season_1').get();
    const homeAfter = after.docs.find((doc) => doc.data().teamId === 'team_home')?.data();
    const awayAfter = after.docs.find((doc) => doc.data().teamId === 'team_away')?.data();
    // 2-1 became 1-2, so the three points move across.
    expect(homeAfter?.points).toBe(0);
    expect(awayAfter?.points).toBe(3);
  });
});
