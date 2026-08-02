import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fantasyDemo } from '../src/data/fantasyDemo';

type JsonScalar = string | number | boolean | null;
type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };
type JsonRecord = { id: string; [key: string]: JsonValue };
type DatabaseMetadata = {
  synthetic: boolean;
  notice?: string;
  [key: string]: JsonValue | undefined;
};
type DatabaseExport = {
  metadata: DatabaseMetadata;
  [collection: string]: JsonRecord[] | DatabaseMetadata;
};
type DemoAccount = {
  uid: string;
  email: string;
  role: string;
  workspace?: string;
};
type AccountClass = 'fan' | 'athlete' | 'organization_operator' | 'platform_operator';

type Args = {
  project?: string;
  database?: string;
  confirm?: string;
  source?: string;
  execute: boolean;
  reset: boolean;
  createAuth: boolean;
  mergeFantasy: boolean;
};

const EXPECTED_COUNTS: Record<string, number> = {
  sports: 3,
  users: 1308,
  leagues: 6,
  seasons: 6,
  teams: 60,
  teamAssignments: 60,
  rosters: 60,
  athletes: 1000,
  matches: 540,
  resultSubmissions: 264,
  resultSubmissionEvents: 756,
  standings: 60,
  challenges: 120,
  supportPledges: 1020,
  walletTransactions: 1020,
  feedPosts: 204,
  comments: 354,
  notifications: 264,
  sponsors: 12,
  sponsorReports: 6,
  leagueNotices: 48,
  verifications: 186,
  reports: 12,
  awards: 9,
  finalizations: 240,
  fantasyCompetitions: fantasyDemo.competitions.length,
  fantasyScoringProfiles: fantasyDemo.scoringProfiles.length,
  fantasySquadRules: fantasyDemo.squadRules.length,
  fantasyRounds: fantasyDemo.rounds.length,
  fantasyPlayers: fantasyDemo.players.length,
  fantasyPlayerPrices: fantasyDemo.playerPrices.length,
  fantasyTeams: fantasyDemo.teams.length,
  fantasyLineupVersions: fantasyDemo.lineupVersions.length,
  fantasyTransfers: fantasyDemo.transfers.length,
  fantasyPointEvents: fantasyDemo.pointEvents.length,
  fantasyRoundScores: fantasyDemo.roundScores.length,
  fantasyLeaderboards: fantasyDemo.leaderboards.length,
  fantasyMiniLeagues: fantasyDemo.miniLeagues.length,
  fantasyMiniLeagueMembers: fantasyDemo.miniLeagueMembers.length,
  fantasyAchievements: fantasyDemo.achievements.length,
  fantasyCorrections: fantasyDemo.corrections.length,
};

const REQUIRED_CONFIRMATION = 'SEED-GOALPLACE-STAGING';
const FANTASY_CONFIRMATION = 'SYNC-GOALPLACE-FANTASY-STAGING';
const DEFAULT_SOURCE = path.join(process.cwd(), 'data', 'investor-demo');
const FIREBASE_CONFIG = path.join(
  process.env.HOME ?? '',
  '.config',
  'configstore',
  'firebase-tools.json',
);

function accountClassForDemoRole(role: string): AccountClass {
  if (role === 'athlete' || role === 'athlete_self' || role === 'athlete_guardian') return 'athlete';
  if (
    role === 'league_owner' ||
    role === 'league_admin' ||
    role === 'league_operator' ||
    role === 'league_verifier' ||
    role === 'team_owner' ||
    role === 'team_admin' ||
    role === 'roster_manager' ||
    role === 'result_reporter' ||
    role === 'content_manager'
  ) {
    return 'organization_operator';
  }
  if (
    role === 'platform_admin' ||
    role === 'platform_reviewer' ||
    role === 'platform_support' ||
    role === 'super_admin'
  ) {
    return 'platform_operator';
  }
  return 'fan';
}

function withAccessProfileFields(database: DatabaseExport): DatabaseExport {
  const userRows = database.users;
  if (!Array.isArray(userRows)) return database;
  return {
    ...database,
    users: userRows.map((user) => {
      const role = typeof user.role === 'string' ? user.role : 'fan';
      return {
        ...user,
        accountClass: typeof user.accountClass === 'string' ? user.accountClass : accountClassForDemoRole(role),
        primaryPersona: typeof user.primaryPersona === 'string' ? user.primaryPersona : role,
        accountStatus: typeof user.accountStatus === 'string' ? user.accountStatus : 'active',
        accessVersion: typeof user.accessVersion === 'number' ? user.accessVersion : 1,
      };
    }),
  };
}

function parseArgs(argv: string[]): Args {
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  return {
    project: value('--project'),
    database: value('--database'),
    confirm: value('--confirm'),
    source: value('--source'),
    execute: argv.includes('--execute'),
    reset: argv.includes('--reset'),
    createAuth: argv.includes('--create-auth'),
    mergeFantasy: argv.includes('--merge-fantasy'),
  };
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function stagingProjectId() {
  const aliases = readJson<{ projects?: Record<string, string> }>('.firebaserc').projects ?? {};
  const staging = aliases.staging ?? aliases.stage;
  if (!staging) throw new Error('No staging alias is configured in .firebaserc.');
  return staging;
}

function collectionEntries(database: DatabaseExport) {
  return Object.entries(database).filter(
    (entry): entry is [string, JsonRecord[]] => entry[0] !== 'metadata' && Array.isArray(entry[1]),
  );
}

function assertUniqueIds(collection: string, rows: JsonRecord[]) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row.id || row.id.includes('/')) {
      throw new Error(`${collection} contains a missing or invalid document id.`);
    }
    if (ids.has(row.id)) throw new Error(`${collection} contains duplicate id "${row.id}".`);
    ids.add(row.id);
  }
}

function validatePackage(database: DatabaseExport, accounts: DemoAccount[]) {
  if (database.metadata?.synthetic !== true) {
    throw new Error('Refusing to seed a package that is not explicitly marked synthetic.');
  }

  const actualCounts: Record<string, number> = {};
  for (const [collection, rows] of collectionEntries(database)) {
    assertUniqueIds(collection, rows);
    actualCounts[collection] = rows.length;
  }

  for (const [collection, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (actualCounts[collection] !== expected) {
      throw new Error(
        `${collection} count mismatch: expected ${expected}, received ${actualCounts[collection] ?? 0}.`,
      );
    }
  }

  if (accounts.length !== 23) {
    throw new Error(`Demo account count mismatch: expected 23, received ${accounts.length}.`);
  }

  const userRows = database.users;
  if (!Array.isArray(userRows)) throw new Error('The users collection is missing.');
  const users = new Map(userRows.map((user) => [user.id, user]));
  const accountIds = new Set<string>();
  const accountEmails = new Set<string>();

  for (const account of accounts) {
    if (accountIds.has(account.uid) || accountEmails.has(account.email)) {
      throw new Error(`Duplicate demo account identity: ${account.uid}.`);
    }
    accountIds.add(account.uid);
    accountEmails.add(account.email);
    const profile = users.get(account.uid);
    if (!profile) throw new Error(`Demo account ${account.uid} has no Firestore user profile.`);
    if (profile.email !== account.email || profile.role !== account.role) {
      throw new Error(`Demo account ${account.uid} does not match its Firestore profile.`);
    }
  }

  return actualCounts;
}

function requireSafeTarget(args: Args) {
  if (!args.project) throw new Error('--project is required.');
  if (!args.database) throw new Error('--database is required.');
  const staging = stagingProjectId();
  if (args.project !== staging) {
    throw new Error(
      `Refusing target "${args.project}". This importer only accepts the staging alias "${staging}".`,
    );
  }
  if (args.database !== 'fg256') {
    throw new Error(
      `Refusing database "${args.database}". This importer only accepts the isolated staging database "fg256".`,
    );
  }
  if (args.execute) {
    if (args.mergeFantasy) {
      if (args.reset || args.createAuth) {
        throw new Error('Fantasy merge cannot reset data or modify Authentication users.');
      }
      if (args.confirm !== FANTASY_CONFIRMATION) {
        throw new Error(`Fantasy merge requires --confirm ${FANTASY_CONFIRMATION}.`);
      }
    } else {
      if (!args.reset) throw new Error('Execute requires --reset so package counts remain exact.');
      if (args.confirm !== REQUIRED_CONFIRMATION) {
        throw new Error(`Execute requires --confirm ${REQUIRED_CONFIRMATION}.`);
      }
    }
  }
}

function runFirebase(args: string[], options: { quiet?: boolean } = {}) {
  const result = spawnSync('npx', ['firebase', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: options.quiet ? 'pipe' : 'inherit',
  });
  if (result.status !== 0) {
    const details = options.quiet ? `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim() : '';
    throw new Error(`Firebase command failed: firebase ${args[0]}${details ? `\n${details}` : ''}`);
  }
  return result.stdout ?? '';
}

function firebaseAccessToken() {
  runFirebase(['projects:list', '--json'], { quiet: true });
  const config = readJson<{
    tokens?: { access_token?: string; expires_at?: number };
  }>(FIREBASE_CONFIG);
  const token = config.tokens?.access_token;
  const expiresAt = Number(config.tokens?.expires_at ?? 0);
  if (!token || expiresAt <= Date.now()) {
    throw new Error('The Firebase CLI session is missing or expired. Run `npx firebase login`.');
  }
  return token;
}

async function apiRequest<T>(
  token: string,
  url: string | URL,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);
  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText} for ${options.method ?? 'GET'} ${url}: ${text}`,
    );
  }
  return body;
}

function firestoreBase(projectId: string, databaseId: string) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
}

async function listDocuments(
  token: string,
  projectId: string,
  databaseId: string,
  collectionPath: string,
) {
  const documents: { name: string; fields?: Record<string, JsonValue> }[] = [];
  let pageToken: string | undefined;
  do {
    const encodedPath = collectionPath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const url = new URL(`${firestoreBase(projectId, databaseId)}/${encodedPath}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await apiRequest<{
      documents?: { name: string; fields?: Record<string, JsonValue> }[];
      nextPageToken?: string;
    }>(token, url);
    documents.push(...(response.documents ?? []));
    pageToken = response.nextPageToken;
  } while (pageToken);
  return documents;
}

async function listResultSubmissionEvents(
  token: string,
  projectId: string,
  databaseId: string,
) {
  const response = await apiRequest<
    { document?: { name: string; fields?: Record<string, JsonValue> } }[]
  >(
    token,
    `${firestoreBase(projectId, databaseId)}:runQuery`,
    {
      method: 'POST',
      body: {
        structuredQuery: {
          from: [{ collectionId: 'events', allDescendants: true }],
        },
      },
    },
  );
  return response
    .flatMap((item) => (item.document ? [item.document] : []))
    .filter((document) => document.name.includes('/documents/resultSubmissions/'));
}

async function listAuthUsers(token: string, projectId: string) {
  const users: { localId: string; [key: string]: JsonValue }[] = [];
  let nextPageToken: string | undefined;
  do {
    const response = await apiRequest<{
      userInfo?: { localId: string; [key: string]: JsonValue }[];
      nextPageToken?: string;
    }>(
      token,
      `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:query`,
      {
        method: 'POST',
        body: nextPageToken
          ? { returnUserInfo: true, limit: 500, nextPageToken }
          : { returnUserInfo: true, limit: 500 },
      },
    );
    users.push(...(response.userInfo ?? []));
    nextPageToken = response.nextPageToken;
  } while (nextPageToken);
  return users;
}

async function takeBackup(token: string, projectId: string, databaseId: string) {
  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const backupDir = path.join(
    process.cwd(),
    'backups',
    'investor-demo',
    'staging',
    timestamp,
  );
  const firestoreDir = path.join(backupDir, 'firestore');
  fs.mkdirSync(firestoreDir, { recursive: true });

  const manifest: Record<string, number> = {};
  const rootCollections = Object.keys(EXPECTED_COUNTS).filter(
    (collection) => collection !== 'resultSubmissionEvents',
  );
  for (const collection of rootCollections) {
    const documents = await listDocuments(token, projectId, databaseId, collection);
    manifest[collection] = documents.length;
    fs.writeFileSync(
      path.join(firestoreDir, `${collection}.json`),
      JSON.stringify(documents, null, 2),
    );
  }
  const obsoleteRootEvents = await listDocuments(
    token,
    projectId,
    databaseId,
    'resultSubmissionEvents',
  );
  manifest.resultSubmissionEventsRoot = obsoleteRootEvents.length;
  fs.writeFileSync(
    path.join(firestoreDir, 'resultSubmissionEventsRoot.json'),
    JSON.stringify(obsoleteRootEvents, null, 2),
  );
  if (manifest.resultSubmissions) {
    const events = await listResultSubmissionEvents(token, projectId, databaseId);
    manifest.resultSubmissionEventsNested = events.length;
    fs.writeFileSync(
      path.join(firestoreDir, 'resultSubmissionEventsNested.json'),
      JSON.stringify(events, null, 2),
    );
  }

  const authPath = path.join(backupDir, 'auth.json');
  runFirebase(['auth:export', authPath, '--project', projectId, '--format=json']);
  fs.writeFileSync(
    path.join(backupDir, 'manifest.json'),
    JSON.stringify(
      {
        projectId,
        databaseId,
        takenAt: new Date().toISOString(),
        firestore: manifest,
        authUsers: (await listAuthUsers(token, projectId)).length,
      },
      null,
      2,
    ),
  );
  return backupDir;
}

function firestoreValue(value: JsonValue): Record<string, unknown> {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(firestoreValue) } };
  }
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [key, firestoreValue(nested)]),
      ),
    },
  };
}

function firestoreDocument(
  projectId: string,
  databaseId: string,
  documentPath: string,
  row: JsonRecord,
) {
  return {
    name:
      `projects/${projectId}/databases/${databaseId}/documents/` +
      documentPath
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/'),
    fields: Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, firestoreValue(value)]),
    ),
  };
}

function firestoreDocumentPath(collection: string, row: JsonRecord) {
  if (collection !== 'resultSubmissionEvents') return `${collection}/${row.id}`;
  if (typeof row.submissionId !== 'string' || !row.submissionId) {
    throw new Error(`Result submission event ${row.id} has no submissionId.`);
  }
  return `resultSubmissions/${row.submissionId}/events/${row.id}`;
}

async function writeDatabase(
  token: string,
  projectId: string,
  databaseId: string,
  database: DatabaseExport,
) {
  for (const [collection, rows] of collectionEntries(database)) {
    for (let offset = 0; offset < rows.length; offset += 400) {
      const writes = rows.slice(offset, offset + 400).map((row) => ({
        update: firestoreDocument(
          projectId,
          databaseId,
          firestoreDocumentPath(collection, row),
          row,
        ),
      }));
      const response = await apiRequest<{ status?: { code?: number; message?: string }[] }>(
        token,
        `${firestoreBase(projectId, databaseId)}:batchWrite`,
        { method: 'POST', body: { writes } },
      );
      const failed = response.status?.filter((status) => status.code) ?? [];
      if (failed.length) {
        throw new Error(`Firestore rejected ${failed.length} ${collection} write(s).`);
      }
    }
    console.log(`Wrote ${rows.length} ${collection} documents.`);
  }
}

function deleteSeedCollections(projectId: string, databaseId: string) {
  const rootCollections = [
    ...Object.keys(EXPECTED_COUNTS).filter(
      (collection) => collection !== 'resultSubmissionEvents',
    ),
    // Remove the obsolete location after its records have been backed up separately.
    'resultSubmissionEvents',
  ];
  for (const collection of rootCollections) {
    runFirebase([
      'firestore:delete',
      collection,
      '--recursive',
      '--force',
      '--project',
      projectId,
      '--database',
      databaseId,
    ]);
  }
  console.log(
    `Deleted ${rootCollections.length} known seed collections; unrelated staging data was preserved.`,
  );
}

async function deleteAuthUsers(token: string, projectId: string) {
  const users = await listAuthUsers(token, projectId);
  for (let offset = 0; offset < users.length; offset += 1000) {
    await apiRequest<JsonValue>(
      token,
      `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchDelete`,
      {
        method: 'POST',
        body: {
          localIds: users.slice(offset, offset + 1000).map((user) => user.localId),
          force: true,
        },
      },
    );
  }
  console.log(`Deleted ${users.length} previous staging Auth users.`);
}

function importAuthUsers(
  projectId: string,
  database: DatabaseExport,
  accounts: DemoAccount[],
  password: string,
  backupDir: string,
) {
  const userRows = database.users;
  if (!Array.isArray(userRows)) throw new Error('The users collection is missing.');
  const profiles = new Map(userRows.map((user) => [user.id, user]));
  const hashKey = crypto.randomBytes(32);
  const users = accounts.map((account) => {
    const salt = crypto.randomBytes(16);
    const passwordHash = crypto
      .createHmac('sha256', hashKey)
      .update(Buffer.concat([Buffer.from(password), salt]))
      .digest('base64');
    const profile = profiles.get(account.uid);
    return {
      localId: account.uid,
      email: account.email,
      emailVerified: true,
      displayName:
        typeof profile?.displayName === 'string'
          ? profile.displayName
          : account.email.split('@')[0],
      passwordHash,
      salt: salt.toString('base64'),
      customAttributes: JSON.stringify({
        role: account.role,
        accountClass: accountClassForDemoRole(account.role),
      }),
    };
  });

  const importPath = path.join(backupDir, 'auth-import.json');
  fs.writeFileSync(importPath, JSON.stringify({ users }));
  try {
    runFirebase([
      'auth:import',
      importPath,
      '--project',
      projectId,
      '--hash-algo',
      'HMAC_SHA256',
      '--hash-key',
      hashKey.toString('base64'),
      '--hash-input-order',
      'PASSWORD_FIRST',
    ]);
  } finally {
    fs.rmSync(importPath, { force: true });
  }
}

async function verifyCounts(
  token: string,
  projectId: string,
  databaseId: string,
  expected: Record<string, number>,
  expectedAuthUsers: number,
) {
  const actual: Record<string, number> = {};
  const rootCollections = Object.keys(expected).filter(
    (collection) => collection !== 'resultSubmissionEvents',
  );
  for (const collection of rootCollections) {
    actual[collection] = (
      await listDocuments(token, projectId, databaseId, collection)
    ).length;
  }
  const obsoleteRootEvents = await listDocuments(
    token,
    projectId,
    databaseId,
    'resultSubmissionEvents',
  );
  if (obsoleteRootEvents.length) {
    throw new Error(
      'Post-seed verification found the obsolete top-level resultSubmissionEvents collection.',
    );
  }
  actual.resultSubmissionEvents = (
    await listResultSubmissionEvents(token, projectId, databaseId)
  ).length;
  for (const [collection, count] of Object.entries(expected)) {
    if (actual[collection] !== count) {
      throw new Error(
        `Post-seed verification failed for ${collection}: expected ${count}, received ${actual[collection] ?? 0}.`,
      );
    }
  }
  const authUsers = (await listAuthUsers(token, projectId)).length;
  if (authUsers !== expectedAuthUsers) {
    throw new Error(
      `Post-seed Auth verification failed: expected ${expectedAuthUsers}, received ${authUsers}.`,
    );
  }
  return { collections: actual, authUsers };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  requireSafeTarget(args);
  const source = path.resolve(args.source ?? DEFAULT_SOURCE);
  const database = withAccessProfileFields({
    ...readJson<DatabaseExport>(path.join(source, 'database.json')),
    fantasyCompetitions: fantasyDemo.competitions,
    fantasyScoringProfiles: fantasyDemo.scoringProfiles,
    fantasySquadRules: fantasyDemo.squadRules,
    fantasyRounds: fantasyDemo.rounds,
    fantasyPlayers: fantasyDemo.players,
    fantasyPlayerPrices: fantasyDemo.playerPrices,
    fantasyTeams: fantasyDemo.teams,
    fantasyLineupVersions: fantasyDemo.lineupVersions,
    fantasyTransfers: fantasyDemo.transfers,
    fantasyPointEvents: fantasyDemo.pointEvents,
    fantasyRoundScores: fantasyDemo.roundScores,
    fantasyLeaderboards: fantasyDemo.leaderboards,
    fantasyMiniLeagues: fantasyDemo.miniLeagues,
    fantasyMiniLeagueMembers: fantasyDemo.miniLeagueMembers,
    fantasyAchievements: fantasyDemo.achievements,
    fantasyCorrections: fantasyDemo.corrections,
  } as unknown as DatabaseExport);
  const accounts = readJson<DemoAccount[]>(path.join(source, 'demo-accounts.json'));
  const counts = validatePackage(database, accounts);

  console.log(
    JSON.stringify(
      {
        mode: args.execute ? 'EXECUTE' : 'DRY RUN',
        operation: args.mergeFantasy ? 'merge-fantasy' : 'full-seed',
        project: args.project,
        database: args.database,
        synthetic: database.metadata.synthetic,
        collections: counts,
        demoAccounts: accounts.length,
      },
      null,
      2,
    ),
  );

  if (!args.execute) {
    console.log('Dry run complete. No remote data was changed.');
    return;
  }

  const password = process.env.FIREBASE_DEMO_PASSWORD;
  if (args.createAuth && !password) {
    throw new Error('Set FIREBASE_DEMO_PASSWORD before using --create-auth.');
  }

  const projectId = args.project as string;
  const databaseId = args.database as string;
  const token = firebaseAccessToken();
  const backupDir = await takeBackup(token, projectId, databaseId);
  console.log(`Backup written to ${backupDir}`);

  if (args.mergeFantasy) {
    const fantasyCollections = Object.fromEntries(
      collectionEntries(database).filter(([collection]) => collection.startsWith('fantasy')),
    );
    const fantasyDatabase = {
      metadata: database.metadata,
      ...fantasyCollections,
    } as DatabaseExport;
    await writeDatabase(token, projectId, databaseId, fantasyDatabase);
    const fantasyCounts = Object.fromEntries(
      Object.entries(counts).filter(([collection]) => collection.startsWith('fantasy')),
    );
    const verified = await verifyCounts(
      token,
      projectId,
      databaseId,
      fantasyCounts,
      (await listAuthUsers(token, projectId)).length,
    );
    console.log(
      JSON.stringify(
        {
          status: 'success',
          operation: 'merge-fantasy',
          projectId,
          databaseId,
          collections: verified.collections,
          authUsers: verified.authUsers,
        },
        null,
        2,
      ),
    );
    return;
  }

  deleteSeedCollections(projectId, databaseId);
  await writeDatabase(token, projectId, databaseId, database);

  if (args.createAuth && password) {
    await deleteAuthUsers(token, projectId);
    importAuthUsers(projectId, database, accounts, password, backupDir);
  }

  const verified = await verifyCounts(
    token,
    projectId,
    databaseId,
    counts,
    args.createAuth ? accounts.length : (await listAuthUsers(token, projectId)).length,
  );
  console.log(
    JSON.stringify(
      {
        status: 'success',
        projectId,
        databaseId,
        collections: verified.collections,
        authUsers: verified.authUsers,
        syntheticNotice: database.metadata.notice,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`Investor demo seed failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
