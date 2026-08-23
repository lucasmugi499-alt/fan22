/**
 * Adversarial cloud canary for B1.
 *
 * Writes one deliberately oversized result submission into the live demo database, lets the
 * deployed finalizer Function react, and reports what it did. The point is to prove the
 * DEPLOYED executable rejects the claim before constructing events — the repository being
 * correct proves nothing about the running bundle.
 *
 * Cleans up after itself.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n'),
  }),
}, `canary-${Date.now()}`);
const db = getFirestore(app, process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID!);

const MATCH_ID = 'match_canary_b1';
const now = new Date().toISOString();

async function cleanup() {
  await db.collection('resultSubmissions').doc(MATCH_ID).delete().catch(() => undefined);
  await db.collection('matches').doc(MATCH_ID).delete().catch(() => undefined);
  const exceptions = await db.collection('reconciliationExceptions').where('matchId', '==', MATCH_ID).get();
  for (const doc of exceptions.docs) await doc.ref.delete().catch(() => undefined);
  const events = await db.collection('officialSportEvents').where('matchId', '==', MATCH_ID).get();
  for (const doc of events.docs) await doc.ref.delete().catch(() => undefined);
}

async function main() {
  await cleanup();

  await db.collection('matches').doc(MATCH_ID).set({
    id: MATCH_ID, leagueId: 'league_canary', seasonId: 'season_canary',
    homeTeamId: 'team_canary_home', awayTeamId: 'team_canary_away',
    status: 'completed', verificationStatus: 'pending',
    score: { home: 2, away: 1 }, scheduledAt: now,
  });

  // One scorer entry, one hundred million points. Passes every list-length cap.
  await db.collection('resultSubmissions').doc(MATCH_ID).set({
    id: MATCH_ID, matchId: MATCH_ID, leagueId: 'league_canary', seasonId: 'season_canary',
    submittedByTeamId: 'team_canary_home', opponentTeamId: 'team_canary_away',
    submittedByUserId: 'canary', respondedByUserId: 'canary',
    homeScore: 2, awayScore: 1,
    scorers: [{ athleteId: 'athlete_canary', teamId: 'team_canary_home', count: 100_000_000 }],
    evidenceRefs: [], status: 'confirmed', revision: 1, resultVersion: 1,
    submittedAsFinal: true, confirmationDeadline: now, submittedAt: now,
  });

  console.log('submission written; waiting for the deployed finalizer...');
  const deadline = Date.now() + 120_000;
  let submission: FirebaseFirestore.DocumentData | undefined;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    submission = (await db.collection('resultSubmissions').doc(MATCH_ID).get()).data();
    if (submission?.finalizationStatus) break;
  }

  const events = await db.collection('officialSportEvents').where('matchId', '==', MATCH_ID).get();
  const exceptions = await db.collection('reconciliationExceptions').where('matchId', '==', MATCH_ID).get();
  const match = (await db.collection('matches').doc(MATCH_ID).get()).data();

  console.log('\n--- CANARY RESULT ---');
  console.log('submission.finalizationStatus :', submission?.finalizationStatus ?? '(none)');
  console.log('official events written       :', events.size);
  console.log('reconciliation exceptions     :', exceptions.size);
  console.log('match.verificationStatus      :', match?.verificationStatus);
  for (const doc of exceptions.docs) {
    const data = doc.data();
    console.log('exception.reasonCode          :', data.reasonCode);
    console.log('exception.issues              :', JSON.stringify(data.issues));
  }

  const passed = submission?.finalizationStatus === 'blocked_oversized_submission'
    && events.size === 0
    && exceptions.size === 1;
  console.log('\nVERDICT:', passed ? 'PASS — rejected before event construction, zero official writes' : 'FAIL');

  await cleanup();
  console.log('cleaned up.');
  process.exitCode = passed ? 0 : 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
