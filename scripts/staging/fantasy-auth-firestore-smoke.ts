import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { applicationDefault, cert, deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type {
  FantasyCompetition,
  FantasyOfficialAthletePerformance,
  FantasyPlayer,
  FantasyPlayerPrice,
  FantasyRound,
  FantasyScoringProfile,
  FantasySquadRules,
} from '../../src/types/fantasy';
import type { Match } from '../../src/types';

type ProjectMap = {
  projects?: Record<string, string>;
};

type CliOptions = {
  baseUrl?: string;
  projectId?: string;
  databaseId?: string;
  apiKey?: string;
  password?: string;
  scoringSecret?: string;
  runId?: string;
  keep: boolean;
  allowProduction: boolean;
  json: boolean;
};

export type SmokePlan = {
  baseUrl: string;
  projectId: string;
  databaseId: string;
  apiKey: string;
  password: string;
  scoringSecret: string;
  runId: string;
  keep: boolean;
  allowProduction: boolean;
  json: boolean;
};

type SmokeIds = {
  suffix: string;
  uid: string;
  email: string;
  leagueId: string;
  seasonId: string;
  homeTeamId: string;
  awayTeamId: string;
  competitionId: string;
  roundId: string;
  squadRulesId: string;
  scoringProfileId: string;
  matchId: string;
  fantasyTeamId: string;
  lineupV1Id: string;
  lineupV2Id: string;
  correctionId: string;
  athleteIds: [string, string, string, string];
};

type SeedRecord = {
  collection: string;
  id: string;
  data: Record<string, unknown>;
};

type ApiStep = {
  name: string;
  status: number;
  ok: boolean;
  body: unknown;
};

type SmokeReport = {
  runId: string;
  projectId: string;
  databaseId: string;
  baseUrl: string;
  startedAt: string;
  completedAt: string;
  ids: SmokeIds;
  steps: ApiStep[];
  assertions: Record<string, unknown>;
  cleanup: {
    attempted: boolean;
    skipped: boolean;
    deletedDocuments: number;
    authUserDeleted: boolean;
  };
};

type IdentityToolkitResponse = {
  idToken?: string;
  error?: { message?: string };
};

type LineupResponse = {
  fantasyTeamId: string;
  lineupVersionId: string;
  creditsUsed: number;
  creditsRemaining: number;
};

type TransferResponse = {
  transferId: string;
  lineupVersionId: string;
  transfersRemaining: number;
};

type LockResponse = {
  roundsLocked: number;
  lineupsLocked: number;
};

type ScoreResponse = {
  competitionsScored: number;
  pointEventsWritten: number;
  lineupsScored: number;
  correctionsWritten: number;
};

const DEFAULT_DATABASE_ID = 'fg256';
const REPORT_DIR = path.join(process.cwd(), 'reports', 'staging');
const PROD_PROJECT_PATTERN = /manifest-quasar-479416-s7|prod/i;

export function parseArgs(argv: string[]): CliOptions {
  return {
    baseUrl: valueAfter(argv, '--base-url') ?? process.env.GOALPLACE_STAGING_BASE_URL,
    projectId:
      valueAfter(argv, '--project') ??
      process.env.GOALPLACE_STAGING_PROJECT_ID ??
      process.env.GOALPLACE_ADMIN_PROJECT_ID ??
      process.env.FIREBASE_ADMIN_PROJECT_ID,
    databaseId:
      valueAfter(argv, '--database') ??
      process.env.GOALPLACE_FIRESTORE_DATABASE_ID ??
      process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID ??
      DEFAULT_DATABASE_ID,
    apiKey:
      valueAfter(argv, '--api-key') ??
      process.env.GOALPLACE_STAGING_FIREBASE_API_KEY ??
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    password:
      valueAfter(argv, '--password') ??
      process.env.GOALPLACE_STAGING_SMOKE_PASSWORD ??
      process.env.FIREBASE_DEMO_PASSWORD ??
      process.env.NEXT_PUBLIC_FIREBASE_DEMO_PASSWORD,
    scoringSecret:
      valueAfter(argv, '--scoring-secret') ??
      process.env.GOALPLACE_FANTASY_SCORING_SECRET,
    runId: valueAfter(argv, '--run-id'),
    keep: argv.includes('--keep') || argv.includes('--no-cleanup'),
    allowProduction: argv.includes('--allow-production'),
    json: argv.includes('--json'),
  };
}

export function readProjectMap(file = path.join(process.cwd(), '.firebaserc')): ProjectMap {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ProjectMap;
}

export function resolveSmokePlan(options: CliOptions, projectMap = readProjectMap()): SmokePlan {
  const projectId = options.projectId ?? projectMap.projects?.staging;
  const missing: string[] = [];
  if (!options.baseUrl) missing.push('GOALPLACE_STAGING_BASE_URL or --base-url');
  if (!projectId) missing.push('GOALPLACE_STAGING_PROJECT_ID, --project, or .firebaserc projects.staging');
  if (!options.databaseId) missing.push('GOALPLACE_FIRESTORE_DATABASE_ID, NEXT_PUBLIC_FIREBASE_DATABASE_ID, or --database');
  if (!options.apiKey) missing.push('GOALPLACE_STAGING_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_API_KEY, or --api-key');
  if (!options.password) missing.push('GOALPLACE_STAGING_SMOKE_PASSWORD, FIREBASE_DEMO_PASSWORD, or --password');
  if (!options.scoringSecret) missing.push('GOALPLACE_FANTASY_SCORING_SECRET or --scoring-secret');
  if (missing.length) {
    throw new Error(`Missing staging fantasy smoke configuration: ${missing.join(', ')}.`);
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl!);
  if (options.databaseId !== DEFAULT_DATABASE_ID) {
    throw new Error(`Refusing database "${options.databaseId}". This smoke test is scoped to "${DEFAULT_DATABASE_ID}".`);
  }
  if (!options.allowProduction && isProductionProject(projectId!, projectMap)) {
    throw new Error(`Refusing to run fantasy staging smoke against production project "${projectId}".`);
  }
  if (options.password!.length < 8) {
    throw new Error('The smoke account password must be at least 8 characters.');
  }

  return {
    baseUrl,
    projectId: projectId!,
    databaseId: options.databaseId,
    apiKey: options.apiKey!,
    password: options.password!,
    scoringSecret: options.scoringSecret!,
    runId: normalizeRunId(options.runId ?? `fantasy_${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}_${randomUUID().slice(0, 8)}`),
    keep: options.keep,
    allowProduction: options.allowProduction,
    json: options.json,
  };
}

export function buildSmokeIds(runId: string): SmokeIds {
  const suffix = normalizeRunId(runId);
  const uid = `smoke_fan_${suffix}`;
  const competitionId = `smoke_comp_${suffix}`;
  const roundId = `smoke_round_${suffix}`;
  const matchId = `smoke_match_${suffix}`;
  const fantasyTeamId = `${competitionId}_${uid}`;
  return {
    suffix,
    uid,
    email: `fantasy-smoke-${suffix.slice(0, 36)}@goalplace256.test`,
    leagueId: `smoke_league_${suffix}`,
    seasonId: `smoke_season_${suffix}`,
    homeTeamId: `smoke_home_${suffix}`,
    awayTeamId: `smoke_away_${suffix}`,
    competitionId,
    roundId,
    squadRulesId: `smoke_rules_${suffix}`,
    scoringProfileId: `smoke_profile_${suffix}`,
    matchId,
    fantasyTeamId,
    lineupV1Id: `${fantasyTeamId}_${roundId}_v1`,
    lineupV2Id: `${fantasyTeamId}_${roundId}_v2`,
    correctionId: `${competitionId}:${roundId}:${matchId}:v1-v2`,
    athleteIds: [
      `smoke_athlete_1_${suffix}`,
      `smoke_athlete_2_${suffix}`,
      `smoke_athlete_3_${suffix}`,
      `smoke_athlete_4_${suffix}`,
    ],
  };
}

export function buildSeedRecords(ids: SmokeIds, now = new Date()): SeedRecord[] {
  const createdAt = now.toISOString();
  const future = offsetIso(now, 60 * 60 * 1000);
  const later = offsetIso(now, 2 * 60 * 60 * 1000);
  const [captainId, viceCaptainId, benchOutId, benchInId] = ids.athleteIds;
  const scoringProfile: FantasyScoringProfile = {
    id: ids.scoringProfileId,
    sport: 'rugby',
    variant: 'rugby_7s',
    name: 'Staging Smoke Rugby Basic',
    version: 1,
    status: 'approved',
    captainMultiplier: 1.5,
    createdAt,
    publishedAt: createdAt,
    rules: [
      rule('active_squad', 'Active Squad', 1),
      rule('appearance', 'Appearance', 2),
      rule('try', 'Try', 5),
      rule('win_participation', 'Win Participation', 1),
    ],
  };
  const squadRules: FantasySquadRules = {
    id: ids.squadRulesId,
    sport: 'rugby',
    variant: 'rugby_7s',
    version: 1,
    squadSize: 3,
    startingSize: 2,
    benchSize: 1,
    budgetCredits: 100,
    maxFromRealTeam: 3,
    captainRequired: true,
    viceCaptainRequired: true,
    transferAllowancePerRound: 2,
    deadlineStrategy: 'first_round_kickoff',
    positionGroups: [{ id: 'back', label: 'Backs', positions: ['Wing', 'Centre'], minimum: 0, maximum: 3 }],
    createdAt,
  };
  const competition: FantasyCompetition = {
    id: ids.competitionId,
    name: 'Staging Smoke Fantasy Rugby',
    shortName: 'Smoke Rugby',
    sport: 'rugby',
    variant: 'rugby_7s',
    leagueId: ids.leagueId,
    seasonId: ids.seasonId,
    scoringProfileId: ids.scoringProfileId,
    scoringProfileVersion: 1,
    squadRulesId: ids.squadRulesId,
    dataLevel: 'basic',
    recordedStatKeys: ['active_squad', 'appearance', 'try', 'win_participation'],
    status: 'active',
    isFreeToPlay: true,
    creditsLabel: 'Fantasy Credits',
    createdAt,
    activatedAt: createdAt,
  };
  const round: FantasyRound = {
    id: ids.roundId,
    competitionId: ids.competitionId,
    number: 1,
    name: 'Smoke Round',
    matchIds: [ids.matchId],
    startsAt: future,
    deadlineAt: future,
    endsAt: later,
    status: 'open',
  };
  const match: Match = {
    id: ids.matchId,
    sport: 'rugby',
    leagueId: ids.leagueId,
    seasonId: ids.seasonId,
    homeTeamId: ids.homeTeamId,
    awayTeamId: ids.awayTeamId,
    venue: 'Staging Smoke Ground',
    city: 'Kampala',
    scheduledAt: createdAt,
    status: 'completed',
    score: { home: 21, away: 12 },
    verificationStatus: 'verified',
    officialResultVersion: 1,
    supportersCount: 0,
    totalSupport: 0,
    events: [],
    createdAt,
  };
  return [
    {
      collection: 'users',
      id: ids.uid,
      data: {
        id: ids.uid,
        uid: ids.uid,
        email: ids.email,
        name: 'Fantasy Smoke Fan',
        role: 'fan',
        accountClass: 'fan',
        accountStatus: 'active',
        status: 'active',
        points: 0,
        followedTeams: [],
        followedAthletes: [],
        favoriteSports: ['rugby'],
        createdAt,
        updatedAt: createdAt,
      },
    },
    { collection: 'fantasyScoringProfiles', id: ids.scoringProfileId, data: scoringProfile as unknown as Record<string, unknown> },
    { collection: 'fantasySquadRules', id: ids.squadRulesId, data: squadRules as unknown as Record<string, unknown> },
    { collection: 'fantasyCompetitions', id: ids.competitionId, data: competition as unknown as Record<string, unknown> },
    { collection: 'fantasyRounds', id: ids.roundId, data: round as unknown as Record<string, unknown> },
    { collection: 'matches', id: ids.matchId, data: match as unknown as Record<string, unknown> },
    performanceRecord(ids, captainId, 1, 1),
    performanceRecord(ids, viceCaptainId, 1, 0),
    ...ids.athleteIds.map((athleteId) => playerRecord(ids, athleteId)),
    ...ids.athleteIds.map((athleteId) => priceRecord(ids, athleteId, createdAt)),
    performanceRecord(ids, captainId, 2, 2),
    performanceRecord(ids, viceCaptainId, 2, 0),
    // The fourth athlete only exists to prove bench transfer validation through the API.
    playerRecord(ids, benchInId),
    priceRecord(ids, benchInId, createdAt),
    playerRecord(ids, benchOutId),
    priceRecord(ids, benchOutId, createdAt),
  ].filter(uniqueSeedRecord);
}

export function expectedTotals() {
  return {
    firstOfficialTotal: 13.5,
    correctedTotal: 21,
  };
}

async function run() {
  const plan = resolveSmokePlan(parseArgs(process.argv.slice(2)));
  const ids = buildSmokeIds(plan.runId);
  const app = createAdminApp(plan);
  const auth = getAuth(app);
  const db = getFirestore(app, plan.databaseId);
  const steps: ApiStep[] = [];
  const assertions: Record<string, unknown> = {};
  const cleanup = {
    attempted: false,
    skipped: plan.keep,
    deletedDocuments: 0,
    authUserDeleted: false,
  };
  const startedAt = new Date().toISOString();

  try {
    await auth.createUser({
      uid: ids.uid,
      email: ids.email,
      emailVerified: true,
      password: plan.password,
      displayName: 'Fantasy Smoke Fan',
      disabled: false,
    });
    await seedFirestore(db, buildSeedRecords(ids));
    const idToken = await signInWithPassword(plan, ids.email);

    const lineup = await callApi<LineupResponse>(plan, steps, {
      name: 'create_lineup',
      path: '/api/fantasy/teams',
      bearerToken: idToken,
      body: {
        competitionId: ids.competitionId,
        roundId: ids.roundId,
        teamName: 'Smoke XV',
        squadAthleteIds: [ids.athleteIds[0], ids.athleteIds[1], ids.athleteIds[2]],
        startingAthleteIds: [ids.athleteIds[0], ids.athleteIds[1]],
        benchAthleteIds: [ids.athleteIds[2]],
        captainAthleteId: ids.athleteIds[0],
        viceCaptainAthleteId: ids.athleteIds[1],
      },
    });
    assertEqual(lineup.fantasyTeamId, ids.fantasyTeamId, 'lineup fantasyTeamId');
    assertEqual(lineup.lineupVersionId, ids.lineupV1Id, 'lineup version id');

    const transfer = await callApi<TransferResponse>(plan, steps, {
      name: 'transfer_bench_player',
      path: '/api/fantasy/transfers',
      bearerToken: idToken,
      body: {
        competitionId: ids.competitionId,
        roundId: ids.roundId,
        athleteOutId: ids.athleteIds[2],
        athleteInId: ids.athleteIds[3],
      },
    });
    assertEqual(transfer.lineupVersionId, ids.lineupV2Id, 'transfer lineup version id');
    assertEqual(transfer.transfersRemaining, 1, 'transfer allowance remaining');

    await db.collection('fantasyRounds').doc(ids.roundId).set({
      deadlineAt: offsetIso(new Date(), -60 * 1000),
    }, { merge: true });

    const lock = await callApi<LockResponse>(plan, steps, {
      name: 'lock_lineups',
      path: '/api/fantasy/lock-lineups',
      schedulerSecret: plan.scoringSecret,
      body: {},
    });
    assertAtLeast(lock.roundsLocked, 1, 'rounds locked');
    assertAtLeast(lock.lineupsLocked, 1, 'lineups locked');
    await assertDocFields(db, 'fantasyLineupVersions', ids.lineupV2Id, { status: 'locked' });

    const firstScore = await callApi<ScoreResponse>(plan, steps, {
      name: 'score_finalized_match_v1',
      path: '/api/fantasy/score-finalized',
      schedulerSecret: plan.scoringSecret,
      body: { matchId: ids.matchId },
    });
    assertAtLeast(firstScore.competitionsScored, 1, 'v1 competitions scored');
    assertAtLeast(firstScore.lineupsScored, 1, 'v1 lineups scored');
    assertEqual(firstScore.correctionsWritten, 0, 'v1 corrections');
    await assertDocFields(db, 'fantasyLeaderboards', `${ids.competitionId}_${ids.fantasyTeamId}`, {
      totalPoints: expectedTotals().firstOfficialTotal,
    });

    await db.collection('matches').doc(ids.matchId).set({ officialResultVersion: 2 }, { merge: true });
    const correctionScore = await callApi<ScoreResponse>(plan, steps, {
      name: 'score_finalized_match_v2_correction',
      path: '/api/fantasy/score-finalized',
      schedulerSecret: plan.scoringSecret,
      body: { matchId: ids.matchId },
    });
    assertAtLeast(correctionScore.competitionsScored, 1, 'v2 competitions scored');
    assertAtLeast(correctionScore.lineupsScored, 1, 'v2 lineups scored');
    assertAtLeast(correctionScore.correctionsWritten, 1, 'v2 corrections');
    await assertDocFields(db, 'fantasyCorrections', ids.correctionId, {
      previousOfficialResultVersion: 1,
      newOfficialResultVersion: 2,
    });
    await assertDocFields(db, 'fantasyLeaderboards', `${ids.competitionId}_${ids.fantasyTeamId}`, {
      totalPoints: expectedTotals().correctedTotal,
      previousRank: 1,
    });

    assertions.lineupVersionId = lineup.lineupVersionId;
    assertions.transferId = transfer.transferId;
    assertions.lock = lock;
    assertions.firstScore = firstScore;
    assertions.correctionScore = correctionScore;
    assertions.expectedTotals = expectedTotals();

    const report: SmokeReport = {
      runId: plan.runId,
      projectId: plan.projectId,
      databaseId: plan.databaseId,
      baseUrl: plan.baseUrl,
      startedAt,
      completedAt: new Date().toISOString(),
      ids,
      steps,
      assertions,
      cleanup,
    };
    if (!plan.keep) {
      cleanup.attempted = true;
      cleanup.deletedDocuments = await cleanupFirestore(db, ids);
      await auth.deleteUser(ids.uid);
      cleanup.authUserDeleted = true;
    }
    const reportPath = await writeReport(report);
    if (plan.json) {
      console.log(JSON.stringify({ ok: true, reportPath, report }, null, 2));
    } else {
      console.log(`Fantasy staging smoke passed. Evidence: ${reportPath}`);
      console.log(`Verified: lineup, transfer, lock, scoring v1, correction v2 on ${plan.projectId}/${plan.databaseId}.`);
    }
  } catch (error) {
    if (!plan.keep) {
      cleanup.attempted = true;
      cleanup.deletedDocuments += await cleanupFirestore(db, ids).catch(() => 0);
      await auth.deleteUser(ids.uid)
        .then(() => { cleanup.authUserDeleted = true; })
        .catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : 'Unknown fantasy staging smoke failure.';
    const report: SmokeReport = {
      runId: plan.runId,
      projectId: plan.projectId,
      databaseId: plan.databaseId,
      baseUrl: plan.baseUrl,
      startedAt,
      completedAt: new Date().toISOString(),
      ids,
      steps,
      assertions: { ...assertions, failure: message },
      cleanup,
    };
    const reportPath = await writeReport(report);
    console.error(`Fantasy staging smoke failed. Evidence: ${reportPath}`);
    console.error(message);
    process.exitCode = 1;
  } finally {
    await deleteApp(app).catch(() => undefined);
  }
}

function valueAfter(argv: string[], flag: string) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function normalizeBaseUrl(raw: string) {
  const url = new URL(raw);
  const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLocal) {
    throw new Error('GOALPLACE_STAGING_BASE_URL must be HTTPS unless targeting localhost.');
  }
  return url.toString().replace(/\/$/, '');
}

function normalizeRunId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 54);
}

function isProductionProject(projectId: string, projectMap: ProjectMap) {
  return projectId === projectMap.projects?.prod || PROD_PROJECT_PATTERN.test(projectId);
}

function offsetIso(now: Date, offsetMs: number) {
  return new Date(now.getTime() + offsetMs).toISOString();
}

function rule(stat: FantasyScoringProfile['rules'][number]['stat'], label: string, points: number) {
  return {
    id: stat,
    label,
    stat,
    points,
    requiredDataLevel: 'basic' as const,
    requiredStatKey: stat,
    enabled: true,
  };
}

function playerRecord(ids: SmokeIds, athleteId: string): SeedRecord {
  const player: FantasyPlayer = {
    id: `${ids.competitionId}_${athleteId}`,
    competitionId: ids.competitionId,
    athleteId,
    realTeamId: ids.homeTeamId,
    sport: 'rugby',
    position: 'Wing',
    positionGroup: 'back',
    availability: 'available',
    verifiedRecentForm: [],
    ownershipPercentage: 0,
    active: true,
    nextFixtureMatchId: ids.matchId,
  };
  return { collection: 'fantasyPlayers', id: player.id, data: player as unknown as Record<string, unknown> };
}

function priceRecord(ids: SmokeIds, athleteId: string, publishedAt: string): SeedRecord {
  const price: FantasyPlayerPrice = {
    id: `${ids.competitionId}_${athleteId}_v1`,
    competitionId: ids.competitionId,
    athleteId,
    credits: 10,
    version: 1,
    status: 'published',
    publishedAt,
  };
  return { collection: 'fantasyPlayerPrices', id: price.id, data: price as unknown as Record<string, unknown> };
}

function performanceRecord(ids: SmokeIds, athleteId: string, version: number, tries: number): SeedRecord {
  const performance: FantasyOfficialAthletePerformance = {
    id: `${ids.matchId}_v${version}_${athleteId}`,
    matchId: ids.matchId,
    athleteId,
    realTeamId: ids.homeTeamId,
    sport: 'rugby',
    position: 'Wing',
    positionGroup: 'back',
    officialResultVersion: version,
    verificationStatus: 'verified',
    dataLevel: 'basic',
    dataCoverage: 'match_squad_basic',
    activeSquad: true,
    didPlay: true,
    minutesPlayed: 0,
    teamWon: true,
    playerOfMatch: false,
    stats: {
      active_squad: 1,
      appearance: 1,
      try: tries,
      win_participation: 1,
    },
    sourceEventIds: {
      active_squad: `${ids.matchId}_v${version}_${athleteId}_active`,
      appearance: `${ids.matchId}_v${version}_${athleteId}_active`,
      try: `${ids.matchId}_v${version}_${athleteId}_try`,
      win_participation: `${ids.matchId}_v${version}_${athleteId}_active`,
    },
  };
  return { collection: 'officialAthleteMatchStats', id: performance.id, data: performance as unknown as Record<string, unknown> };
}

function uniqueSeedRecord(record: SeedRecord, index: number, records: SeedRecord[]) {
  return records.findIndex((candidate) =>
    candidate.collection === record.collection && candidate.id === record.id,
  ) === index;
}

function createAdminApp(plan: SmokePlan): App {
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  return initializeApp({
    credential: clientEmail && privateKey
      ? cert({ projectId: plan.projectId, clientEmail, privateKey })
      : applicationDefault(),
    projectId: plan.projectId,
  }, `fantasy-smoke-${plan.runId}`);
}

async function seedFirestore(db: Firestore, records: SeedRecord[]) {
  for (const record of records) {
    await db.collection(record.collection).doc(record.id).set(record.data);
  }
}

async function signInWithPassword(plan: SmokePlan, email: string) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${plan.apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password: plan.password,
      returnSecureToken: true,
    }),
  });
  const body = await response.json().catch(() => ({})) as IdentityToolkitResponse;
  if (!response.ok || !body.idToken) {
    throw new Error(`Smoke fan sign-in failed: ${body.error?.message ?? response.statusText}`);
  }
  return body.idToken;
}

async function callApi<T>(
  plan: SmokePlan,
  steps: ApiStep[],
  options: {
    name: string;
    path: string;
    body: Record<string, unknown>;
    bearerToken?: string;
    schedulerSecret?: string;
  },
): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.bearerToken) headers.authorization = `Bearer ${options.bearerToken}`;
  if (options.schedulerSecret) headers['x-goalplace-fantasy-secret'] = options.schedulerSecret;
  const response = await fetch(`${plan.baseUrl}${options.path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(options.body),
  });
  const body = await readResponseBody(response);
  steps.push({ name: options.name, status: response.status, ok: response.ok, body });
  if (!response.ok) {
    throw new Error(`${options.name} failed with ${response.status}: ${JSON.stringify(body)}`);
  }
  return body as T;
}

async function readResponseBody(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text };
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`Expected ${label} to be ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

function assertAtLeast(actual: number, expected: number, label: string) {
  if (actual < expected) {
    throw new Error(`Expected ${label} to be at least ${expected}, received ${actual}.`);
  }
}

async function assertDocFields(
  db: Firestore,
  collection: string,
  id: string,
  expected: Record<string, unknown>,
) {
  const snapshot = await db.collection(collection).doc(id).get();
  if (!snapshot.exists) throw new Error(`Expected ${collection}/${id} to exist.`);
  const data = snapshot.data() ?? {};
  for (const [key, value] of Object.entries(expected)) {
    if (data[key] !== value) {
      throw new Error(`Expected ${collection}/${id}.${key} to be ${JSON.stringify(value)}, received ${JSON.stringify(data[key])}.`);
    }
  }
}

async function cleanupFirestore(db: Firestore, ids: SmokeIds) {
  let deleted = 0;
  const directPaths = buildSeedRecords(ids).map((record) => [record.collection, record.id] as const);
  for (const [collection, id] of directPaths) {
    await db.collection(collection).doc(id).delete().then(() => { deleted += 1; });
  }

  const competitionCollections = [
    'fantasyTeams',
    'fantasyLineupVersions',
    'fantasyTransfers',
    'fantasyAuditEvents',
    'fantasyPointEvents',
    'fantasyRoundScores',
    'fantasyLeaderboards',
    'fantasyCorrections',
  ];
  for (const collection of competitionCollections) {
    deleted += await deleteQuery(db, db.collection(collection).where('competitionId', '==', ids.competitionId));
  }
  deleted += await deleteQuery(db, db.collection('notifications').where('userId', '==', ids.uid));
  return deleted;
}

async function deleteQuery(db: Firestore, query: FirebaseFirestore.Query) {
  let deleted = 0;
  const snapshot = await query.get();
  for (let index = 0; index < snapshot.docs.length; index += 450) {
    const batch = db.batch();
    for (const doc of snapshot.docs.slice(index, index + 450)) {
      batch.delete(doc.ref);
      deleted += 1;
    }
    await batch.commit();
  }
  return deleted;
}

async function writeReport(report: SmokeReport) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `fantasy-auth-firestore-smoke-${report.runId}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  void run();
}
