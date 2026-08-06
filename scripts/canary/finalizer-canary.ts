import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Builds, verifies and tears down a single controlled finalization.
 *
 * The finalizer writes official sporting records. Before it is given authority over every
 * future submission it has to be proven once, against cloud data, on a fixture that
 * touches nothing real: dedicated teams, dedicated athletes, a dedicated match.
 *
 * The fixture is constructed so its recorded events reconcile exactly to the submitted
 * score, so a reconciliation failure means a genuine defect rather than a bad fixture.
 *
 *   --setup    create the fixture and print the submission id for the allowlist
 *   --confirm  move the submission to `confirmed`, which is what the trigger reacts to
 *   --verify   run the checks against what the finalizer wrote
 *   --replay   rewrite the submission to force a duplicate event, then re-verify
 *   --teardown remove every document the fixture created
 */

const PREFIX = 'canary_fin';
const MATCH_ID = `${PREFIX}_match_001`;
const LEAGUE_ID = `${PREFIX}_league`;
const SEASON_ID = `${PREFIX}_season`;
const HOME = `${PREFIX}_team_home`;
const AWAY = `${PREFIX}_team_away`;

/** Two tries (5 each) = 10. The submitted score matches exactly. */
const SCORER = `${PREFIX}_athlete_scorer`;
const STARTER = `${PREFIX}_athlete_starter`;
const BENCH = `${PREFIX}_athlete_bench`;
const AWAY_PLAYER = `${PREFIX}_athlete_away`;

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
    id: LEAGUE_ID, name: 'Canary Rugby League', sport: 'rugby', city: 'Kampala',
    adminUserIds: [], createdAt: now,
  });
  batch.set(store.collection('seasons').doc(SEASON_ID), {
    id: SEASON_ID, name: 'Canary Season', leagueId: LEAGUE_ID, sport: 'rugby',
    status: 'active', createdAt: now,
  });
  for (const [teamId, name] of [[HOME, 'Canary Home'], [AWAY, 'Canary Away']] as const) {
    batch.set(store.collection('teams').doc(teamId), {
      id: teamId, name, sport: 'rugby', leagueId: LEAGUE_ID, city: 'Kampala',
      adminUserIds: [], createdAt: now,
    });
  }

  // Every athlete is registered to the team that claims them, so eligibility passes for
  // legitimate reasons rather than by tolerance.
  const athletes: Array<[string, string, string, string]> = [
    [SCORER, 'Canary Scorer', HOME, 'Fly-half'],
    [STARTER, 'Canary Starter', HOME, 'Lock'],
    [BENCH, 'Canary Bench', HOME, 'Back Row'],
    [AWAY_PLAYER, 'Canary Away Player', AWAY, 'Prop'],
  ];
  for (const [id, name, teamId, position] of athletes) {
    batch.set(store.collection('athletes').doc(id), {
      id, name, teamId, leagueId: LEAGUE_ID, position, sport: 'rugby',
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

  // Created as pending_confirmation. The trigger only acts on `confirmed`, so setup
  // alone cannot finalize anything even if the allowlist were already set.
  batch.set(store.collection('resultSubmissions').doc(MATCH_ID), {
    id: MATCH_ID, matchId: MATCH_ID, leagueId: LEAGUE_ID, seasonId: SEASON_ID,
    submittedByTeamId: HOME, opponentTeamId: AWAY, submittedByUserId: 'canary_operator',
    homeScore: 10, awayScore: 0,
    scorers: [{ athleteId: SCORER, teamId: HOME, count: 2, minute: 20 }],
    activeSquads: { [HOME]: [SCORER, STARTER, BENCH], [AWAY]: [AWAY_PLAYER] },
    // STARTER has verified minutes, so participation is evidenced. BENCH has none, so it
    // must receive no appearance — the defect this whole phase exists to prevent.
    athleteStatLines: [
      { athleteId: SCORER, teamId: HOME, minutesPlayed: 80, stats: {} },
      { athleteId: STARTER, teamId: HOME, minutesPlayed: 80, stats: {} },
    ],
    evidenceRefs: [], status: 'pending_confirmation', revision: 1, resultVersion: 1,
    submittedAsFinal: true, confirmationDeadline: now, submittedAt: now,
  });

  await batch.commit();
  console.log(`Fixture created. Allowlist id: ${MATCH_ID}`);
}

async function confirm(store: Firestore) {
  await store.collection('resultSubmissions').doc(MATCH_ID).set({
    status: 'confirmed',
    respondedByUserId: 'canary_opponent',
  }, { merge: true });
  console.log('Submission confirmed; the trigger should now act.');
}

async function verify(store: Firestore) {
  const checks: Array<[string, boolean, string]> = [];

  const finalizations = await store.collection('finalizations').where('matchId', '==', MATCH_ID).get();
  checks.push(['exactly one official result version', finalizations.size === 1, `found ${finalizations.size}`]);

  const match = (await store.collection('matches').doc(MATCH_ID).get()).data() ?? {};
  checks.push(['match marked verified', match.verificationStatus === 'verified', String(match.verificationStatus)]);
  checks.push(['official score is 10-0', match.score?.home === 10 && match.score?.away === 0,
    JSON.stringify(match.score)]);

  const recon = (await store.collection('officialMatchReconciliation').doc(`${MATCH_ID}_v1`).get()).data();
  checks.push(['events reconcile to the score', recon?.status === 'valid', String(recon?.status)]);
  checks.push(['nothing unattributed',
    recon?.unattributed?.home === 0 && recon?.unattributed?.away === 0,
    JSON.stringify(recon?.unattributed)]);
  checks.push(['no eligibility exclusions', (recon?.eligibilityIssues ?? []).length === 0,
    JSON.stringify(recon?.eligibilityIssues)]);

  const stats = await store.collection('officialAthleteMatchStats').where('matchId', '==', MATCH_ID).get();
  const byAthlete = new Map(stats.docs.map((d) => [d.data().athleteId, d.data()]));
  checks.push(['scorer credited with 2 tries', byAthlete.get(SCORER)?.stats?.try === 2,
    String(byAthlete.get(SCORER)?.stats?.try)]);
  checks.push(['scorer has an appearance', byAthlete.get(SCORER)?.stats?.appearance === 1,
    String(byAthlete.get(SCORER)?.stats?.appearance)]);
  checks.push(['starter has an appearance', byAthlete.get(STARTER)?.stats?.appearance === 1,
    String(byAthlete.get(STARTER)?.stats?.appearance)]);
  // The headline assertion.
  checks.push(['squad-only athlete has NO appearance', byAthlete.get(BENCH)?.stats?.appearance === 0,
    `appearance=${byAthlete.get(BENCH)?.stats?.appearance} level=${byAthlete.get(BENCH)?.participationLevel}`]);
  checks.push(['squad-only athlete has no win participation',
    byAthlete.get(BENCH)?.stats?.win_participation === 0,
    String(byAthlete.get(BENCH)?.stats?.win_participation)]);

  const events = await store.collection('officialSportEvents').where('matchId', '==', MATCH_ID).get();
  checks.push(['canonical sport events written', events.size > 0, `${events.size} events`]);

  let failed = 0;
  for (const [name, ok, detail] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (${detail})`}`);
    if (!ok) failed += 1;
  }
  console.log(failed ? `${failed} check(s) FAILED` : 'All checks passed.');
  if (failed) process.exitCode = 1;
  return { finalizations: finalizations.size, stats: stats.size, events: events.size };
}

async function replay(store: Firestore) {
  const before = await verify(store);
  console.log('--- forcing a duplicate trigger delivery ---');
  // Touching the submission re-fires onDocumentWritten with the same finalization key.
  await store.collection('resultSubmissions').doc(MATCH_ID).set({ canaryReplayAt: new Date().toISOString() }, { merge: true });
  await new Promise((resolve) => setTimeout(resolve, 25_000));
  const after = await verify(store);
  const stable = before.finalizations === after.finalizations
    && before.stats === after.stats
    && before.events === after.events;
  console.log(stable
    ? 'IDEMPOTENT: replay produced no additional official records.'
    : `NOT IDEMPOTENT: ${JSON.stringify({ before, after })}`);
  if (!stable) process.exitCode = 1;
}

async function teardown(store: Firestore) {
  let removed = 0;
  for (const collection of [
    'officialSportEvents', 'officialAthleteMatchStats', 'finalizations', 'standings',
    'fantasyPointEvents',
  ]) {
    const snapshot = await store.collection(collection).where('matchId', '==', MATCH_ID).get().catch(() => null);
    for (const document of snapshot?.docs ?? []) {
      await document.ref.delete();
      removed += 1;
    }
  }
  for (const [collection, id] of [
    ['officialMatchReconciliation', `${MATCH_ID}_v1`],
    ['resultSubmissions', MATCH_ID],
    ['matches', MATCH_ID],
    ['athletes', SCORER], ['athletes', STARTER], ['athletes', BENCH], ['athletes', AWAY_PLAYER],
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
