import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Proves the fantasy chain end to end against cloud data.
 *
 * The finalizer canary already showed the handoff fires, but it scored nothing:
 * `competitionsScored: 0`, because the fixture league had no fantasy competition. That
 * left the half of the chain that actually produces fantasy points unproven. This closes
 * it: competition -> round -> squad -> lineup -> deadline lock -> result -> confirmation
 * -> finalizer -> canonical events -> athlete projection -> fantasy point events ->
 * leaderboard, then a correction and a deterministic recalculation.
 *
 * The fixture is built so each scoring rule is separable:
 *
 *   CAPTAIN    scores a try and plays, so the multiplier must apply
 *   STARTER    plays but does not score, so appearance points only
 *   BENCH      is named in the squad and never plays, so it must score NOTHING —
 *              the defect this whole phase exists to prevent, now measured in points
 *
 *   --setup    create the fixture and print the allowlist id
 *   --confirm  confirm the submission, which is what the trigger reacts to
 *   --verify   assert points, captain multiplier, bench exclusion and the leaderboard
 *   --correct  approve a corrected score and assert deterministic recalculation
 *   --teardown remove every document the fixture created
 */

const PREFIX = 'canary_fantasy';
const MATCH_ID = `${PREFIX}_match_001`;
const LEAGUE_ID = `${PREFIX}_league`;
const SEASON_ID = `${PREFIX}_season`;
const HOME = `${PREFIX}_team_home`;
const AWAY = `${PREFIX}_team_away`;
const CAPTAIN = `${PREFIX}_athlete_captain`;
const STARTER = `${PREFIX}_athlete_starter`;
const BENCH = `${PREFIX}_athlete_bench`;
const AWAY_PLAYER = `${PREFIX}_athlete_away`;
const COMPETITION_ID = `${PREFIX}_competition`;
const ROUND_ID = `${PREFIX}_round`;
const FANTASY_TEAM_ID = `${PREFIX}_fantasy_team`;
const LINEUP_ID = `${PREFIX}_lineup_v1`;
const FAN_USER_ID = `${PREFIX}_fan`;

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
  const past = new Date(Date.now() - 3_600_000).toISOString();
  const batch = store.batch();

  batch.set(store.collection('leagues').doc(LEAGUE_ID), {
    id: LEAGUE_ID, name: 'Canary Fantasy League', sport: 'rugby', city: 'Kampala',
    adminUserIds: [], createdAt: now, teamsCount: 2,
  });
  batch.set(store.collection('seasons').doc(SEASON_ID), {
    id: SEASON_ID, name: 'Canary Fantasy Season', leagueId: LEAGUE_ID, sport: 'rugby',
    status: 'active', createdAt: now,
  });
  for (const [teamId, name] of [[HOME, 'Canary Fantasy Home'], [AWAY, 'Canary Fantasy Away']] as const) {
    batch.set(store.collection('teams').doc(teamId), {
      id: teamId, name, sport: 'rugby', leagueId: LEAGUE_ID, city: 'Kampala',
      adminUserIds: [], createdAt: now,
    });
  }
  for (const [id, name, teamId] of [
    [CAPTAIN, 'Canary Captain', HOME],
    [STARTER, 'Canary Starter', HOME],
    [BENCH, 'Canary Bench', HOME],
    [AWAY_PLAYER, 'Canary Away Player', AWAY],
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

  // The competition the finalizer's fantasy handoff will find: same league, same season,
  // active. Its absence is exactly why the earlier canary scored zero.
  batch.set(store.collection('fantasyCompetitions').doc(COMPETITION_ID), {
    id: COMPETITION_ID, name: 'Canary Fantasy Cup', shortName: 'CFC',
    sport: 'rugby', variant: 'rugby_union',
    leagueId: LEAGUE_ID, seasonId: SEASON_ID,
    scoringProfileId: 'fantasy_scoring_rugby_v1', scoringProfileVersion: 1,
    squadRulesId: 'fantasy_squad_rugby_15s_v1', dataLevel: 'basic',
    recordedStatKeys: ['active_squad', 'appearance', 'try', 'win_participation'],
    status: 'active', isFreeToPlay: true, creditsLabel: 'Fantasy Credits',
    createdAt: past,
  });
  batch.set(store.collection('fantasyRounds').doc(ROUND_ID), {
    id: ROUND_ID, competitionId: COMPETITION_ID, number: 1, name: 'Canary Round 1',
    matchIds: [MATCH_ID],
    startsAt: past,
    // Already past, so the round is locked before the result lands — a lineup must not be
    // editable after kickoff.
    deadlineAt: past,
    endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    status: 'open',
  });
  batch.set(store.collection('fantasyTeams').doc(FANTASY_TEAM_ID), {
    id: FANTASY_TEAM_ID, competitionId: COMPETITION_ID, userId: FAN_USER_ID,
    name: 'Canary Selectors', createdAt: past,
  });
  batch.set(store.collection('fantasyLineupVersions').doc(LINEUP_ID), {
    id: LINEUP_ID, fantasyTeamId: FANTASY_TEAM_ID, competitionId: COMPETITION_ID,
    roundId: ROUND_ID, version: 1,
    // BENCH is deliberately selected. It must earn nothing, because it never plays.
    squadAthleteIds: [CAPTAIN, STARTER, BENCH],
    startingAthleteIds: [CAPTAIN, STARTER, BENCH],
    benchAthleteIds: [],
    captainAthleteId: CAPTAIN,
    viceCaptainAthleteId: STARTER,
    creditsUsed: 15,
    status: 'submitted',
    submittedAt: past,
    createdAt: past,
  });

  batch.set(store.collection('resultSubmissions').doc(MATCH_ID), {
    id: MATCH_ID, matchId: MATCH_ID, leagueId: LEAGUE_ID, seasonId: SEASON_ID,
    submittedByTeamId: HOME, opponentTeamId: AWAY, submittedByUserId: 'canary_operator',
    // One try, worth 5. The events reconcile exactly, so nothing is blocked.
    homeScore: 5, awayScore: 0,
    scorers: [{ athleteId: CAPTAIN, teamId: HOME, count: 1, minute: 20 }],
    activeSquads: { [HOME]: [CAPTAIN, STARTER, BENCH], [AWAY]: [AWAY_PLAYER] },
    // CAPTAIN and STARTER have verified minutes. BENCH has none.
    athleteStatLines: [
      { athleteId: CAPTAIN, teamId: HOME, minutesPlayed: 80, stats: {} },
      { athleteId: STARTER, teamId: HOME, minutesPlayed: 80, stats: {} },
    ],
    evidenceRefs: [], status: 'pending_confirmation', revision: 1, resultVersion: 1,
    submittedAsFinal: true, confirmationDeadline: now, submittedAt: now,
  });

  await batch.commit();
  console.log(`Fantasy fixture created. Allowlist id: ${MATCH_ID}`);
  console.log(`Competition ${COMPETITION_ID} is active on ${LEAGUE_ID}/${SEASON_ID}.`);
  console.log(`Lineup: captain=${CAPTAIN}, vice=${STARTER}, selected-but-benched=${BENCH}`);
}

async function confirm(store: Firestore) {
  await store.collection('resultSubmissions').doc(MATCH_ID).set({
    status: 'confirmed',
    respondedByUserId: 'canary_opponent',
  }, { merge: true });
  console.log('Submission confirmed; the finalizer and the fantasy handoff should now run.');
}

/**
 * Base points and the scoring rules that produced them, for one athlete.
 *
 * `basePoints` is pre-multiplier: the captain's bonus is applied when the lineup is scored,
 * not on the event. Superseded events are excluded so a correction is measured on the
 * result that stands.
 */
async function scoringFor(store: Firestore, athleteId: string) {
  const events = await store.collection('fantasyPointEvents')
    .where('matchId', '==', MATCH_ID).get().catch(() => null);
  const live = (events?.docs ?? [])
    .map((doc) => doc.data())
    .filter((data) => data.athleteId === athleteId && data.status !== 'superseded');
  return {
    base: live.reduce((sum, data) => sum + Number(data.basePoints ?? 0), 0),
    rules: new Set(live.map((data) => String(data.scoringRuleId))),
  };
}

async function verify(store: Firestore) {
  const checks: Array<[string, boolean, string]> = [];

  const match = (await store.collection('matches').doc(MATCH_ID).get()).data() ?? {};
  checks.push(['official result exists', match.verificationStatus === 'verified', String(match.verificationStatus)]);

  const stats = await store.collection('officialAthleteMatchStats').where('matchId', '==', MATCH_ID).get();
  const byAthlete = new Map(stats.docs.map((doc) => [doc.data().athleteId, doc.data()]));
  checks.push(['athlete projection written', stats.size > 0, `${stats.size} rows`]);
  checks.push(['captain has an appearance', byAthlete.get(CAPTAIN)?.stats?.appearance === 1,
    String(byAthlete.get(CAPTAIN)?.stats?.appearance)]);
  checks.push(['selected-but-benched athlete has NO appearance',
    byAthlete.get(BENCH)?.stats?.appearance === 0, String(byAthlete.get(BENCH)?.stats?.appearance)]);

  const pointEvents = await store.collection('fantasyPointEvents').where('matchId', '==', MATCH_ID).get()
    .catch(() => null);
  checks.push(['fantasy point events written', (pointEvents?.size ?? 0) > 0, `${pointEvents?.size ?? 0} events`]);

  const captain = await scoringFor(store, CAPTAIN);
  const starter = await scoringFor(store, STARTER);
  const bench = await scoringFor(store, BENCH);
  checks.push(['captain scored a try', captain.rules.has('try'), [...captain.rules].join(',')]);
  checks.push(['captain earned an appearance point', captain.rules.has('appearance'), [...captain.rules].join(',')]);
  checks.push(['starter earned an appearance point', starter.rules.has('appearance'), [...starter.rules].join(',')]);

  // The headline assertion, expressed in scoring rules rather than a bare total. Being
  // named in a squad is itself worth a point, so "scored nothing" would be the wrong test:
  // what must never happen is a benched athlete earning points for PLAYING.
  checks.push(['selected-but-benched athlete earned the squad point only',
    bench.rules.has('active_squad') && bench.rules.size === 1, [...bench.rules].join(',') || 'none']);
  checks.push(['selected-but-benched athlete earned NO appearance point',
    !bench.rules.has('appearance'), [...bench.rules].join(',')]);
  checks.push(['selected-but-benched athlete earned NO win participation',
    !bench.rules.has('win_participation'), [...bench.rules].join(',')]);

  const leaderboard = await store.collection('fantasyLeaderboards')
    .where('competitionId', '==', COMPETITION_ID).get().catch(() => null);
  const entry = leaderboard?.docs[0]?.data();
  checks.push(['leaderboard entry created', Boolean(entry), `${leaderboard?.size ?? 0} entries`]);

  // The captain multiplier is applied at lineup scoring, so it shows up as the leaderboard
  // total exceeding the plain sum of base points.
  const plainSum = captain.base + starter.base + bench.base;
  const total = Number(entry?.totalPoints ?? 0);
  checks.push(['captain multiplier applied to the leaderboard total', total > plainSum,
    `total ${total} vs unmultiplied ${plainSum}`]);
  checks.push(['leaderboard total equals captain-multiplied scoring',
    Math.abs(total - (captain.base * 1.5 + starter.base + bench.base)) < 0.001,
    `total ${total} vs expected ${captain.base * 1.5 + starter.base + bench.base}`]);

  let failed = 0;
  for (const [name, ok, detail] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (${detail})`}`);
    if (!ok) failed += 1;
  }
  console.log(failed ? `${failed} check(s) FAILED` : 'All checks passed.');
  if (failed) process.exitCode = 1;
  return {
    captainBase: captain.base,
    starterBase: starter.base,
    benchRules: [...bench.rules],
    total: Number(entry?.totalPoints ?? 0),
  };
}

async function correct(store: Firestore) {
  const before = await verify(store);
  console.log('--- approving a corrected official result (5-0 becomes 10-0, two tries) ---');
  await store.collection('resultSubmissions').doc(MATCH_ID).set({
    homeScore: 10,
    scorers: [{ athleteId: CAPTAIN, teamId: HOME, count: 2, minute: 20 }],
    status: 'confirmed',
    revision: 2,
    resultVersion: 2,
    correctionReason: 'Canary correction: a second try was missed by the original claim.',
    correctionApprovedBy: 'canary_league_admin',
    finalizationKey: null,
    finalizedAt: null,
  }, { merge: true });
  await new Promise((resolve) => setTimeout(resolve, 30_000));
  const after = await verify(store);

  const recalculated = after.captainBase > before.captainBase && after.total > before.total;
  console.log(recalculated
    ? `DETERMINISTIC RECALCULATION: captain base ${before.captainBase} -> ${after.captainBase}, `
      + `leaderboard ${before.total} -> ${after.total}.`
    : `NO RECALCULATION: ${JSON.stringify({ before, after })}`);
  if (!recalculated) process.exitCode = 1;
  // A correction must not quietly grant the benched athlete playing points.
  if (after.benchRules.some((rule) => rule !== 'active_squad')) {
    console.log(`REGRESSION: benched athlete earned playing points after the correction: ${after.benchRules.join(',')}`);
    process.exitCode = 1;
  }
}

async function teardown(store: Firestore) {
  let removed = 0;
  for (const collection of [
    'officialSportEvents', 'officialAthleteMatchStats', 'finalizations', 'standings',
    'fantasyPointEvents', 'reconciliationExceptions', 'fantasyRoundScores', 'fantasyCorrections',
  ]) {
    const snapshot = await store.collection(collection).where('matchId', '==', MATCH_ID).get()
      .catch(() => null);
    for (const document of snapshot?.docs ?? []) {
      await document.ref.delete();
      removed += 1;
    }
  }
  for (const collection of ['fantasyLeaderboards', 'fantasyRoundScores', 'fantasyAuditEvents']) {
    const snapshot = await store.collection(collection).where('competitionId', '==', COMPETITION_ID).get()
      .catch(() => null);
    for (const document of snapshot?.docs ?? []) {
      await document.ref.delete();
      removed += 1;
    }
  }
  // Subcollections outlive a deleted parent, so they go first.
  const submissionRef = store.collection('resultSubmissions').doc(MATCH_ID);
  for (const sub of await submissionRef.listCollections()) {
    for (const document of (await sub.get()).docs) {
      await document.ref.delete();
      removed += 1;
    }
  }
  for (const [collection, id] of [
    ['officialMatchReconciliation', `${MATCH_ID}_v1`],
    ['officialMatchReconciliation', `${MATCH_ID}_v2`],
    ['fantasyLineupVersions', LINEUP_ID],
    ['fantasyTeams', FANTASY_TEAM_ID],
    ['fantasyRounds', ROUND_ID],
    ['fantasyCompetitions', COMPETITION_ID],
    ['resultSubmissions', MATCH_ID],
    ['matches', MATCH_ID],
    ['athletes', CAPTAIN], ['athletes', STARTER], ['athletes', BENCH], ['athletes', AWAY_PLAYER],
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
  if (argv.includes('--correct')) return correct(store);
  if (argv.includes('--teardown')) return teardown(store);
  throw new Error('Pass one of --setup --confirm --verify --correct --teardown');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
