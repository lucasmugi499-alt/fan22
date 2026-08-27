import process from 'node:process';
import { pathToFileURL } from 'node:url';
import type { Firestore } from 'firebase-admin/firestore';
import { initializeMigrationFirestore } from '../lib/firestoreTarget';

const DEMO_PROJECT = 'manifest-quasar-479416-s7';
const CANARY_MATCH_ID = 'canary_unreported_20260826';
const DEFAULT_TEMPLATE_ID = 'match_eurdl_18_03';

function valueAfter(argv: string[], flag: string) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function officialCounts(db: Firestore, matchId: string) {
  const [report, submission, finalizations, events, stats, provenance, reconciliation, exceptions] =
    await Promise.all([
      db.collection('matchReports').doc(matchId).get(),
      db.collection('resultSubmissions').doc(matchId).get(),
      db.collection('finalizations').where('matchId', '==', matchId).get(),
      db.collection('officialSportEvents').where('matchId', '==', matchId).get(),
      db.collection('officialAthleteMatchStats').where('matchId', '==', matchId).get(),
      db.collection('publicResultProvenance').where('matchId', '==', matchId).get(),
      db.collection('officialMatchReconciliation').where('matchId', '==', matchId).get(),
      db.collection('matchOperationalExceptions').where('matchId', '==', matchId).get(),
    ]);
  return {
    reports: Number(report.exists),
    submissions: Number(submission.exists),
    finalizations: finalizations.size,
    events: events.size,
    athleteStats: stats.size,
    provenance: provenance.size,
    reconciliation: reconciliation.size,
    exceptions: exceptions.size,
  };
}

function assertZeroOfficialArtifacts(counts: Awaited<ReturnType<typeof officialCounts>>) {
  for (const [name, count] of Object.entries(counts)) {
    if (name === 'exceptions') continue;
    if (count !== 0) throw new Error(`Canary is not controlled: ${name}=${count}.`);
  }
}

async function prepare(db: Firestore, templateId: string, now: Date) {
  const canaryRef = db.collection('matches').doc(CANARY_MATCH_ID);
  const [existing, template] = await Promise.all([
    canaryRef.get(),
    db.collection('matches').doc(templateId).get(),
  ]);
  if (existing.exists) throw new Error(`${CANARY_MATCH_ID} already exists; use --verify.`);
  if (!template.exists) throw new Error(`Template match ${templateId} does not exist.`);

  const source = template.data() ?? {};
  const homeTeamId = String(source.homeTeamId ?? source.teamAId ?? '');
  const awayTeamId = String(source.awayTeamId ?? source.teamBId ?? '');
  const leagueId = String(source.leagueId ?? '');
  const seasonId = String(source.seasonId ?? '');
  if (!homeTeamId || !awayTeamId || !leagueId || !seasonId) {
    throw new Error(`Template match ${templateId} lacks its competition or squads.`);
  }
  const [homeTeam, awayTeam] = await db.getAll(
    db.collection('teams').doc(homeTeamId),
    db.collection('teams').doc(awayTeamId),
  );
  if (!homeTeam.exists || !awayTeam.exists) {
    throw new Error(`Template match ${templateId} does not have two registered teams.`);
  }

  const kickoff = new Date(now.getTime() - 8 * 86_400_000).toISOString();
  const boundAt = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  await canaryRef.create({
    id: CANARY_MATCH_ID,
    sport: String(source.sport ?? 'football'),
    leagueId,
    seasonId,
    homeTeamId,
    teamAId: homeTeamId,
    awayTeamId,
    teamBId: awayTeamId,
    venue: String(source.venue ?? 'Controlled release canary'),
    city: String(source.city ?? ''),
    scheduledAt: kickoff,
    status: 'completed',
    verificationStatus: 'pending',
    score: { home: null, away: null },
    supportersCount: 0,
    totalSupport: 0,
    events: [],
    effectiveCapturePolicy: 'FIELD_REQUIRED',
    capturePolicyBoundAt: boundAt,
    operationalCanary: 'result_never_reported',
    createdAt: boundAt,
  });

  const counts = await officialCounts(db, CANARY_MATCH_ID);
  assertZeroOfficialArtifacts(counts);
  if (counts.exceptions !== 0) throw new Error(`Canary is not controlled: exceptions=${counts.exceptions}.`);
  return { matchId: CANARY_MATCH_ID, templateId, kickoff, capturePolicyBoundAt: boundAt, counts };
}

async function verify(db: Firestore) {
  const match = await db.collection('matches').doc(CANARY_MATCH_ID).get();
  if (!match.exists) throw new Error(`${CANARY_MATCH_ID} does not exist; use --prepare first.`);
  const data = match.data() ?? {};
  const counts = await officialCounts(db, CANARY_MATCH_ID);
  assertZeroOfficialArtifacts(counts);
  if (counts.exceptions !== 1) throw new Error(`Expected exactly one exception; found ${counts.exceptions}.`);

  const exception = await db.collection('matchOperationalExceptions')
    .doc(`${CANARY_MATCH_ID}_result_never_reported`)
    .get();
  const exceptionData = exception.data() ?? {};
  if (!exception.exists
    || exceptionData.code !== 'result_never_reported'
    || exceptionData.status !== 'open'
    || exceptionData.blocking !== true) {
    throw new Error('The deterministic result_never_reported exception is missing or malformed.');
  }
  if (data.status !== 'completed'
    || data.verificationStatus !== 'pending'
    || data.officialResultVersion !== undefined
    || (data.score as { home?: unknown; away?: unknown } | undefined)?.home !== null
    || (data.score as { home?: unknown; away?: unknown } | undefined)?.away !== null) {
    throw new Error('The sweep changed match truth instead of only surfacing an exception.');
  }

  return {
    matchId: CANARY_MATCH_ID,
    counts,
    match: {
      status: data.status,
      verificationStatus: data.verificationStatus,
      score: data.score,
      officialResultVersion: data.officialResultVersion ?? null,
    },
    exception: {
      id: exception.id,
      code: exceptionData.code,
      status: exceptionData.status,
      blocking: exceptionData.blocking,
    },
  };
}

export async function main(argv = process.argv.slice(2)) {
  const target = initializeMigrationFirestore();
  if (target.projectId !== DEMO_PROJECT || target.databaseId !== 'fg256') {
    throw new Error(`This canary is Demo-only; resolved ${target.label}.`);
  }
  const mode = argv.includes('--prepare') ? 'prepare' : argv.includes('--verify') ? 'verify' : null;
  if (!mode || (argv.includes('--prepare') && argv.includes('--verify'))) {
    throw new Error('Choose exactly one of --prepare or --verify.');
  }
  const result = mode === 'prepare'
    ? await prepare(target.db, valueAfter(argv, '--template') ?? DEFAULT_TEMPLATE_ID, new Date())
    : await verify(target.db);
  console.log(JSON.stringify({ target: target.label, mode, ...result }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
