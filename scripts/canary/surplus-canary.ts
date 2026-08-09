import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Proves the surplus integrity gate against cloud data.
 *
 * The fixture is deliberately contradictory: a rugby result submitted as 2-0 whose only
 * recorded scoring event is a try, worth 5. The events claim more than the result does,
 * which is the one direction reconciliation cannot repair — attributing the difference
 * would mean inventing points nobody scored, and deleting the try would destroy submitted
 * evidence.
 *
 * The assertion that matters is negative: after the trigger runs, NOTHING official exists.
 * No official result version, no canonical sport events, no athlete statistics, no
 * standings, no fantasy point events, and a match still carrying a null score.
 *
 *   --setup    create the contradictory fixture and print the allowlist id
 *   --confirm  move the submission to `confirmed`, which is what the trigger reacts to
 *   --verify   assert the block, the single exception, and zero official writes
 *   --replay   force a duplicate delivery, then re-verify idempotency
 *   --teardown remove every document the fixture created
 */

const PREFIX = 'canary_surplus';
const MATCH_ID = `${PREFIX}_match_001`;
const LEAGUE_ID = `${PREFIX}_league`;
const SEASON_ID = `${PREFIX}_season`;
const HOME = `${PREFIX}_team_home`;
const AWAY = `${PREFIX}_team_away`;
const SCORER = `${PREFIX}_athlete_scorer`;
const AWAY_PLAYER = `${PREFIX}_athlete_away`;
const EXCEPTION_ID = `reconciliation_${MATCH_ID}_1`;

/** One try is 5 points. The submitted score claims 2. */
const SUBMITTED_HOME = 2;
const EXPECTED_RECONSTRUCTED = 5;

function db(): Firestore {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const app = getApps()[0] ?? initializeApp({
    credential: projectId && clientEmail && privateKey
      ? cert({ projectId, clientEmail, privateKey })
      : applicationDefault(),
    projectId,
  });
  return getFirestore(app, process.env.GOALPLACE_FIRESTORE_DATABASE_ID ?? 'fg256');
}

async function setup(store: Firestore) {
  const now = new Date().toISOString();
  const batch = store.batch();

  batch.set(store.collection('leagues').doc(LEAGUE_ID), {
    id: LEAGUE_ID, name: 'Canary Surplus League', sport: 'rugby', city: 'Kampala',
    adminUserIds: [], createdAt: now,
  });
  batch.set(store.collection('seasons').doc(SEASON_ID), {
    id: SEASON_ID, name: 'Canary Surplus Season', leagueId: LEAGUE_ID, sport: 'rugby',
    status: 'active', createdAt: now,
  });
  for (const [teamId, name] of [[HOME, 'Surplus Home'], [AWAY, 'Surplus Away']] as const) {
    batch.set(store.collection('teams').doc(teamId), {
      id: teamId, name, sport: 'rugby', leagueId: LEAGUE_ID, city: 'Kampala',
      adminUserIds: [], createdAt: now,
    });
  }
  for (const [id, name, teamId] of [
    [SCORER, 'Surplus Scorer', HOME],
    [AWAY_PLAYER, 'Surplus Away Player', AWAY],
  ] as const) {
    batch.set(store.collection('athletes').doc(id), {
      id, name, teamId, leagueId: LEAGUE_ID, position: 'Fly-half', sport: 'rugby',
      city: 'Kampala', verificationStatus: 'verified', createdAt: now,
    });
  }

  batch.set(store.collection('matches').doc(MATCH_ID), {
    id: MATCH_ID, sport: 'rugby', leagueId: LEAGUE_ID, seasonId: SEASON_ID,
    homeTeamId: HOME, awayTeamId: AWAY, venue: 'Canary Ground', city: 'Kampala',
    scheduledAt: now, status: 'completed', score: { home: null, away: null },
    verificationStatus: 'pending', events: [], supportersCount: 0, totalSupport: 0,
    createdAt: now,
  });

  batch.set(store.collection('resultSubmissions').doc(MATCH_ID), {
    id: MATCH_ID, matchId: MATCH_ID, leagueId: LEAGUE_ID, seasonId: SEASON_ID,
    submittedByTeamId: HOME, opponentTeamId: AWAY, submittedByUserId: 'canary_operator',
    // The contradiction: one try (5) recorded against a submitted score of 2.
    homeScore: SUBMITTED_HOME, awayScore: 0,
    scorers: [{ athleteId: SCORER, teamId: HOME, count: 1, minute: 20 }],
    activeSquads: { [HOME]: [SCORER], [AWAY]: [AWAY_PLAYER] },
    athleteStatLines: [],
    evidenceRefs: [`matchEvidence/${MATCH_ID}/${HOME}/canary_operator/photo.jpg`],
    status: 'pending_confirmation', revision: 1, resultVersion: 1,
    submittedAsFinal: true, confirmationDeadline: now, submittedAt: now,
  });

  await batch.commit();
  console.log(`Contradictory fixture created. Allowlist id: ${MATCH_ID}`);
  console.log(`Submitted ${SUBMITTED_HOME}-0; recorded events reconstruct to ${EXPECTED_RECONSTRUCTED}-0.`);
}

async function confirm(store: Firestore) {
  await store.collection('resultSubmissions').doc(MATCH_ID).set({
    status: 'confirmed',
    respondedByUserId: 'canary_opponent',
  }, { merge: true });
  console.log('Submission confirmed; the trigger should now block it.');
}

async function verify(store: Firestore) {
  const checks: Array<[string, boolean, string]> = [];

  // The negative assertions: nothing official may exist.
  const officialCounts: Record<string, number> = {};
  for (const collection of [
    'finalizations', 'officialSportEvents', 'officialAthleteMatchStats',
    'officialMatchReconciliation', 'standings', 'fantasyPointEvents',
  ]) {
    const snapshot = await store.collection(collection).where('matchId', '==', MATCH_ID).get()
      .catch(() => null);
    officialCounts[collection] = snapshot?.size ?? 0;
  }
  const totalOfficial = Object.values(officialCounts).reduce((a, b) => a + b, 0);
  checks.push(['no official records of any kind', totalOfficial === 0, JSON.stringify(officialCounts)]);

  const match = (await store.collection('matches').doc(MATCH_ID).get()).data() ?? {};
  checks.push(['match still unverified', match.verificationStatus === 'pending', String(match.verificationStatus)]);
  checks.push(['match score untouched',
    match.score?.home === null && match.score?.away === null, JSON.stringify(match.score)]);

  // The positive assertions: exactly one governed case, carrying the discrepancy.
  const cases = await store.collection('reconciliationExceptions')
    .where('matchId', '==', MATCH_ID).get();
  checks.push(['exactly one reconciliation exception', cases.size === 1, `found ${cases.size}`]);

  const record = (await store.collection('reconciliationExceptions').doc(EXCEPTION_ID).get()).data();
  checks.push(['exception uses the deterministic id', Boolean(record), EXCEPTION_ID]);
  checks.push(['records the submitted score', record?.officialHomeScore === SUBMITTED_HOME,
    String(record?.officialHomeScore)]);
  checks.push(['records the reconstructed score', record?.reconstructedHomeScore === EXPECTED_RECONSTRUCTED,
    String(record?.reconstructedHomeScore)]);
  checks.push(['records the difference',
    record?.homeDifference === EXPECTED_RECONSTRUCTED - SUBMITTED_HOME, String(record?.homeDifference)]);
  checks.push(['requires league review', record?.reviewStatus === 'league_review_required',
    String(record?.reviewStatus)]);
  checks.push(['preserves evidence references', (record?.evidenceRefs ?? []).length === 1,
    JSON.stringify(record?.evidenceRefs)]);
  checks.push(['preserves the submitted event ids', (record?.eventIds ?? []).length > 0,
    `${(record?.eventIds ?? []).length} ids`]);

  const submission = (await store.collection('resultSubmissions').doc(MATCH_ID).get()).data() ?? {};
  checks.push(['submission marked blocked', submission.finalizationStatus === 'blocked_reconciliation',
    String(submission.finalizationStatus)]);
  checks.push(['claim lifecycle left alone', submission.status === 'confirmed', String(submission.status)]);

  let failed = 0;
  for (const [name, ok, detail] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (${detail})`}`);
    if (!ok) failed += 1;
  }
  console.log(failed ? `${failed} check(s) FAILED` : 'All checks passed.');
  if (failed) process.exitCode = 1;

  const audit = await store.collection('resultSubmissions').doc(MATCH_ID).collection('events').get();
  return { cases: cases.size, official: totalOfficial, audit: audit.size };
}

async function replay(store: Firestore) {
  const before = await verify(store);
  console.log('--- forcing a duplicate trigger delivery ---');
  await store.collection('resultSubmissions').doc(MATCH_ID)
    .set({ canaryReplayAt: new Date().toISOString() }, { merge: true });
  await new Promise((resolve) => setTimeout(resolve, 25_000));
  const after = await verify(store);
  const stable = before.cases === after.cases
    && before.official === after.official
    && before.audit === after.audit;
  console.log(stable
    ? 'IDEMPOTENT: replay produced no second case, no audit duplicate, nothing official.'
    : `NOT IDEMPOTENT: ${JSON.stringify({ before, after })}`);
  if (!stable) process.exitCode = 1;
}

async function teardown(store: Firestore) {
  let removed = 0;
  for (const collection of [
    'officialSportEvents', 'officialAthleteMatchStats', 'finalizations', 'standings',
    'fantasyPointEvents', 'reconciliationExceptions',
  ]) {
    const snapshot = await store.collection(collection).where('matchId', '==', MATCH_ID).get()
      .catch(() => null);
    for (const document of snapshot?.docs ?? []) {
      await document.ref.delete();
      removed += 1;
    }
  }
  // Subcollections outlive a deleted parent, so clear them before the document itself.
  const submissionRef = store.collection('resultSubmissions').doc(MATCH_ID);
  for (const sub of await submissionRef.listCollections()) {
    for (const document of (await sub.get()).docs) {
      await document.ref.delete();
      removed += 1;
    }
  }
  for (const [collection, id] of [
    ['officialMatchReconciliation', `${MATCH_ID}_v1`],
    ['resultSubmissions', MATCH_ID],
    ['matches', MATCH_ID],
    ['athletes', SCORER], ['athletes', AWAY_PLAYER],
    ['teams', HOME], ['teams', AWAY],
    ['seasons', SEASON_ID], ['leagues', LEAGUE_ID],
  ] as const) {
    await store.collection(collection).doc(id).delete().catch(() => undefined);
    removed += 1;
  }
  console.log(`Teardown removed ${removed} document(s).`);
}

async function main() {
  const store = db();
  const argv = process.argv.slice(2);
  if (argv.includes('--setup')) return setup(store);
  if (argv.includes('--confirm')) return confirm(store);
  if (argv.includes('--verify')) { await verify(store); return; }
  if (argv.includes('--replay')) return replay(store);
  if (argv.includes('--teardown')) return teardown(store);
  throw new Error('Pass one of --setup --confirm --verify --replay --teardown');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
