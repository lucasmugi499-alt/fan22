import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
  accessIndexId,
  buildAccessIndexDocuments,
  type AccessAssignment,
  type AccessIndexDocument,
  type AccessRoleKey,
  type AccessScopeType,
} from '../../src/lib/auth/access';
import { accountClassForRole, isAccountClass, resolveAccountClass } from '../../src/lib/auth/accountClass';
import type { AccountClass } from '../../src/types';

type JsonRecord = { id: string; [key: string]: unknown };

type AccessCompatibilityDataset = {
  source: string;
  users: JsonRecord[];
  authUsers?: JsonRecord[];
  leagues: JsonRecord[];
  teams: JsonRecord[];
  athletes: JsonRecord[];
  assignments: JsonRecord[];
  indexes: JsonRecord[];
};

type IssueSeverity = 'blocker' | 'warning';

type CompatibilityIssue = {
  severity: IssueSeverity;
  code: string;
  message: string;
  userId?: string;
  assignmentId?: string;
  scope?: string;
};

type CompatibilityReport = {
  source: string;
  generatedAt: string;
  counts: {
    users: number;
    authUsers: number;
    leagues: number;
    teams: number;
    athletes: number;
    assignments: number;
    indexes: number;
  };
  blockers: number;
  warnings: number;
  issueCounts: Record<string, number>;
  issues: CompatibilityIssue[];
};

const validAssignmentStatuses = new Set(['pending', 'active', 'suspended', 'expired', 'revoked']);
const validScopes = new Set(['platform', 'organization', 'league', 'team', 'athlete']);
const operatorRoles = new Set([
  'league_owner',
  'league_admin',
  'league_operator',
  'league_verifier',
  'team_owner',
  'team_admin',
  'roster_manager',
  'result_reporter',
  'content_manager',
]);
const platformRoles = new Set([
  'platform_admin',
  'platform_reviewer',
  'platform_support',
  'super_admin',
]);
const athleteRoles = new Set(['athlete', 'athlete_self', 'athlete_guardian']);

function parseArgs(argv: string[]) {
  return {
    firebase: argv.includes('--firebase'),
    json: argv.includes('--json'),
    strict: argv.includes('--strict'),
    source: valueAfter(argv, '--source') ?? path.join(process.cwd(), 'data', 'investor-demo'),
    projectId:
      valueAfter(argv, '--project') ??
      process.env.GOALPLACE_ADMIN_PROJECT_ID ??
      process.env.FIREBASE_ADMIN_PROJECT_ID ??
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    databaseId:
      valueAfter(argv, '--database') ??
      process.env.GOALPLACE_FIRESTORE_DATABASE_ID ??
      process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID,
  };
}

function valueAfter(argv: string[], flag: string) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function indexKey(index: Pick<AccessIndexDocument, 'scopeType' | 'scopeId' | 'userId'>) {
  return accessIndexId(index.scopeType, index.scopeId, index.userId);
}

function normalizeAssignment(row: JsonRecord, fallbackNow: string): AccessAssignment {
  return {
    id: stringValue(row.id),
    userId: stringValue(row.userId),
    roleKey: stringValue(row.roleKey) as AccessRoleKey,
    scopeType: stringValue(row.scopeType) as AccessScopeType,
    scopeId: stringValue(row.scopeId),
    permissionBundleId: stringValue(row.permissionBundleId || row.roleKey),
    status: stringValue(row.status || 'pending') as AccessAssignment['status'],
    grantedByUserId: stringValue(row.grantedByUserId),
    invitationId: typeof row.invitationId === 'string' ? row.invitationId : undefined,
    applicationId: typeof row.applicationId === 'string' ? row.applicationId : undefined,
    validFrom: stringValue(row.validFrom) || fallbackNow,
    validUntil: typeof row.validUntil === 'string' ? row.validUntil : undefined,
    suspendedAt: typeof row.suspendedAt === 'string' ? row.suspendedAt : undefined,
    revokedAt: typeof row.revokedAt === 'string' ? row.revokedAt : undefined,
    revocationReason: typeof row.revocationReason === 'string' ? row.revocationReason : undefined,
    createdAt: stringValue(row.createdAt) || fallbackNow,
    updatedAt: stringValue(row.updatedAt) || fallbackNow,
  };
}

function normalizeIndex(row: JsonRecord): AccessIndexDocument {
  return {
    userId: stringValue(row.userId),
    scopeType: stringValue(row.scopeType) as AccessScopeType,
    scopeId: stringValue(row.scopeId),
    activeRoles: stringArray(row.activeRoles).sort() as AccessRoleKey[],
    capabilities: stringArray(row.capabilities).sort() as AccessIndexDocument['capabilities'],
    assignmentIds: stringArray(row.assignmentIds).sort(),
    accessVersion: Number(row.accessVersion ?? 1),
    updatedAt: stringValue(row.updatedAt) || new Date().toISOString(),
  };
}

function assignmentRecord(input: {
  id: string;
  userId: string;
  roleKey: AccessRoleKey;
  scopeType: AccessScopeType;
  scopeId: string;
  permissionBundleId: string;
  grantedByUserId: string;
}): JsonRecord {
  const timestamp = '2026-08-01T00:00:00.000Z';
  return {
    ...input,
    status: 'active',
    validFrom: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function derivedDemoAssignments(database: Record<string, unknown>) {
  const users = Array.isArray(database.users) ? database.users as JsonRecord[] : [];
  const leagues = Array.isArray(database.leagues) ? database.leagues as JsonRecord[] : [];
  const teams = Array.isArray(database.teams) ? database.teams as JsonRecord[] : [];
  const athletes = Array.isArray(database.athletes) ? database.athletes as JsonRecord[] : [];
  const userRole = new Map(users.map((user) => [String(user.id), stringValue(user.role)]));
  const assignments: JsonRecord[] = [];

  for (const user of users) {
    if (stringValue(user.role) === 'platform_admin') {
      assignments.push(assignmentRecord({
        id: `assignment_demo_platform_${user.id}`,
        userId: String(user.id),
        roleKey: 'platform_admin',
        scopeType: 'platform',
        scopeId: 'global',
        permissionBundleId: 'platform_admin',
        grantedByUserId: 'system_demo_seed',
      }));
    }
    if (stringValue(user.role) === 'super_admin') {
      assignments.push(assignmentRecord({
        id: `assignment_demo_super_${user.id}`,
        userId: String(user.id),
        roleKey: 'super_admin',
        scopeType: 'platform',
        scopeId: 'global',
        permissionBundleId: 'super_admin_governance',
        grantedByUserId: 'system_demo_seed',
      }));
    }
  }

  for (const league of leagues) {
    for (const userId of stringArray(league.adminUserIds)) {
      if (userRole.get(userId) !== 'league_admin') continue;
      assignments.push(assignmentRecord({
        id: `assignment_demo_league_${league.id}_${userId}`,
        userId,
        roleKey: 'league_admin',
        scopeType: 'league',
        scopeId: String(league.id),
        permissionBundleId: 'league_admin',
        grantedByUserId: 'system_demo_seed',
      }));
    }
  }

  for (const team of teams) {
    for (const userId of stringArray(team.adminUserIds)) {
      if (userRole.get(userId) !== 'team_admin') continue;
      assignments.push(assignmentRecord({
        id: `assignment_demo_team_${team.id}_${userId}`,
        userId,
        roleKey: 'team_admin',
        scopeType: 'team',
        scopeId: String(team.id),
        permissionBundleId: 'full_team_admin',
        grantedByUserId: 'system_demo_seed',
      }));
    }
  }

  for (const athlete of athletes) {
    const userId = stringValue(athlete.userId);
    if (!userId || userRole.get(userId) !== 'athlete') continue;
    assignments.push(assignmentRecord({
      id: `assignment_demo_athlete_${athlete.id}_${userId}`,
      userId,
      roleKey: 'athlete_self',
      scopeType: 'athlete',
      scopeId: String(athlete.id),
      permissionBundleId: 'athlete_self',
      grantedByUserId: 'system_demo_seed',
    }));
  }

  return assignments;
}

function derivedDemoUsers(database: Record<string, unknown>) {
  const users = Array.isArray(database.users) ? database.users as JsonRecord[] : [];
  return users.map((user) => {
    const role = stringValue(user.role) || 'fan';
    return {
      ...user,
      accountClass: isAccountClass(user.accountClass) ? user.accountClass : accountClassForRole(role),
      primaryPersona: typeof user.primaryPersona === 'string' ? user.primaryPersona : role,
      accountStatus: typeof user.accountStatus === 'string' ? user.accountStatus : 'active',
      accessVersion: typeof user.accessVersion === 'number' ? user.accessVersion : 1,
    };
  });
}

function requiredAccountClassForAssignmentRole(roleKey: string): AccountClass | null {
  if (operatorRoles.has(roleKey)) return 'organization_operator';
  if (platformRoles.has(roleKey)) return 'platform_operator';
  if (athleteRoles.has(roleKey)) return 'athlete';
  return null;
}

function canonicalProjectionValue(index: AccessIndexDocument) {
  return JSON.stringify({
    userId: index.userId,
    scopeType: index.scopeType,
    scopeId: index.scopeId,
    activeRoles: [...index.activeRoles].sort(),
    capabilities: [...index.capabilities].sort(),
    assignmentIds: [...index.assignmentIds].sort(),
  });
}

function pushIssue(issues: CompatibilityIssue[], issue: CompatibilityIssue) {
  issues.push(issue);
}

export function buildAccessCompatibilityReport(
  dataset: AccessCompatibilityDataset,
  options: { now?: Date; includeSamples?: number; strict?: boolean } = {},
): CompatibilityReport {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const users = new Map(dataset.users.map((user) => [String(user.id), user]));
  const userIds = new Set(users.keys());
  const leagueIds = new Set(dataset.leagues.map((league) => String(league.id)));
  const teamIds = new Set(dataset.teams.map((team) => String(team.id)));
  const athleteIds = new Set(dataset.athletes.map((athlete) => String(athlete.id)));
  const issues: CompatibilityIssue[] = [];

  for (const user of dataset.users) {
    const userId = String(user.id);
    const role = stringValue(user.role);
    const inferredClass = accountClassForRole(role);
    if (user.accountClass === undefined) {
      pushIssue(issues, {
        severity: 'warning',
        code: 'missing_account_class',
        userId,
        message: `User ${userId} has no accountClass; resolver will infer ${inferredClass} from legacy role ${role || 'unknown'}.`,
      });
    } else if (!isAccountClass(user.accountClass)) {
      pushIssue(issues, {
        severity: 'blocker',
        code: 'invalid_account_class',
        userId,
        message: `User ${userId} has unsupported accountClass "${String(user.accountClass)}".`,
      });
    } else if (resolveAccountClass({ accountClass: user.accountClass, role }) !== inferredClass) {
      pushIssue(issues, {
        severity: 'blocker',
        code: 'account_class_role_conflict',
        userId,
        message: `User ${userId} is ${String(user.accountClass)} but legacy role ${role} maps to ${inferredClass}.`,
      });
    }

    if ((operatorRoles.has(role) || platformRoles.has(role)) && !user.accessVersion) {
      pushIssue(issues, {
        severity: 'warning',
        code: 'operator_missing_access_version',
        userId,
        message: `Operator user ${userId} has no accessVersion for scoped-context cache invalidation.`,
      });
    }
  }

  const assignments = dataset.assignments.map((assignment) => normalizeAssignment(assignment, nowIso));
  for (const assignment of assignments) {
    const user = users.get(assignment.userId);
    if (!user) {
      pushIssue(issues, {
        severity: 'blocker',
        code: 'assignment_user_missing',
        assignmentId: assignment.id,
        message: `Assignment ${assignment.id} references missing user ${assignment.userId}.`,
      });
      continue;
    }

    if (!validAssignmentStatuses.has(assignment.status)) {
      pushIssue(issues, {
        severity: 'blocker',
        code: 'invalid_assignment_status',
        assignmentId: assignment.id,
        userId: assignment.userId,
        message: `Assignment ${assignment.id} has unsupported status ${assignment.status}.`,
      });
    }
    if (!validScopes.has(assignment.scopeType)) {
      pushIssue(issues, {
        severity: 'blocker',
        code: 'invalid_assignment_scope',
        assignmentId: assignment.id,
        userId: assignment.userId,
        message: `Assignment ${assignment.id} has unsupported scope type ${assignment.scopeType}.`,
      });
    }

    const requiredClass = requiredAccountClassForAssignmentRole(assignment.roleKey);
    const accountClass = resolveAccountClass({
      accountClass: user.accountClass,
      role: stringValue(user.role),
    });
    if (requiredClass && accountClass !== requiredClass) {
      pushIssue(issues, {
        severity: 'blocker',
        code: 'assignment_account_class_mismatch',
        assignmentId: assignment.id,
        userId: assignment.userId,
        scope: `${assignment.scopeType}:${assignment.scopeId}`,
        message: `Assignment ${assignment.id} requires ${requiredClass}, but user ${assignment.userId} resolves to ${accountClass}.`,
      });
    }

    if (assignment.scopeType === 'league' && !leagueIds.has(assignment.scopeId)) {
      pushIssue(issues, {
        severity: 'blocker',
        code: 'assignment_league_missing',
        assignmentId: assignment.id,
        userId: assignment.userId,
        scope: `league:${assignment.scopeId}`,
        message: `Assignment ${assignment.id} references missing league ${assignment.scopeId}.`,
      });
    }
    if (assignment.scopeType === 'team' && !teamIds.has(assignment.scopeId)) {
      pushIssue(issues, {
        severity: 'blocker',
        code: 'assignment_team_missing',
        assignmentId: assignment.id,
        userId: assignment.userId,
        scope: `team:${assignment.scopeId}`,
        message: `Assignment ${assignment.id} references missing team ${assignment.scopeId}.`,
      });
    }
    if (assignment.scopeType === 'athlete' && !athleteIds.has(assignment.scopeId)) {
      pushIssue(issues, {
        severity: 'blocker',
        code: 'assignment_athlete_missing',
        assignmentId: assignment.id,
        userId: assignment.userId,
        scope: `athlete:${assignment.scopeId}`,
        message: `Assignment ${assignment.id} references missing athlete ${assignment.scopeId}.`,
      });
    }
  }

  const assignmentUserIds = new Set(assignments.map((assignment) => assignment.userId));
  for (const user of dataset.users) {
    const role = stringValue(user.role);
    if ((operatorRoles.has(role) || platformRoles.has(role) || athleteRoles.has(role)) && !assignmentUserIds.has(String(user.id))) {
      pushIssue(issues, {
        severity: 'warning',
        code: 'legacy_principal_without_assignment',
        userId: String(user.id),
        message: `User ${String(user.id)} still depends on legacy role ${role}; no scoped assignment exists yet.`,
      });
    }
  }

  for (const authUser of dataset.authUsers ?? []) {
    const userId = String(authUser.id || authUser.uid || authUser.localId);
    if (userId && !userIds.has(userId)) {
      pushIssue(issues, {
        severity: 'warning',
        code: 'auth_user_without_profile',
        userId,
        message: `Auth user ${userId} has no Firestore users profile.`,
      });
    }
  }

  const indexes = dataset.indexes.map(normalizeIndex);
  const expectedIndexes = buildAccessIndexDocuments({
    assignments,
    accessVersion: 1,
    updatedAt: nowIso,
    now,
  });
  const actualById = new Map(indexes.map((index) => [indexKey(index), index]));
  const expectedById = new Map(expectedIndexes.map((index) => [indexKey(index), index]));

  for (const [id, expected] of expectedById) {
    const actual = actualById.get(id);
    if (!actual) {
      pushIssue(issues, {
        severity: 'blocker',
        code: 'missing_access_index',
        userId: expected.userId,
        scope: `${expected.scopeType}:${expected.scopeId}`,
        message: `Active assignments require accessIndex ${id}, but it is missing.`,
      });
    } else if (canonicalProjectionValue(actual) !== canonicalProjectionValue(expected)) {
      pushIssue(issues, {
        severity: 'blocker',
        code: 'access_index_projection_mismatch',
        userId: expected.userId,
        scope: `${expected.scopeType}:${expected.scopeId}`,
        message: `accessIndex ${id} does not match deterministic assignment projection.`,
      });
    }
  }

  for (const [id, actual] of actualById) {
    if (!expectedById.has(id)) {
      pushIssue(issues, {
        severity: 'warning',
        code: 'legacy_access_index_without_active_assignment',
        userId: actual.userId,
        scope: `${actual.scopeType}:${actual.scopeId}`,
        message: `accessIndex ${id} has no matching active assignment projection.`,
      });
    }
  }

  const issueCounts = issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.code] = (counts[issue.code] ?? 0) + 1;
    return counts;
  }, {});
  const strictWarnings = options.strict ? issues.filter((issue) => issue.severity === 'warning').length : 0;

  return {
    source: dataset.source,
    generatedAt: nowIso,
    counts: {
      users: dataset.users.length,
      authUsers: dataset.authUsers?.length ?? 0,
      leagues: dataset.leagues.length,
      teams: dataset.teams.length,
      athletes: dataset.athletes.length,
      assignments: dataset.assignments.length,
      indexes: dataset.indexes.length,
    },
    blockers: issues.filter((issue) => issue.severity === 'blocker').length + strictWarnings,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
    issueCounts,
    issues: issues.slice(0, options.includeSamples ?? 12),
  };
}

async function loadDemoDataset(source: string): Promise<AccessCompatibilityDataset> {
  const database = readJson<Record<string, unknown>>(path.join(source, 'database.json'));
  const persistedAssignments = Array.isArray(database.accessAssignments) ? database.accessAssignments as JsonRecord[] : [];
  const assignments = persistedAssignments.length ? persistedAssignments : derivedDemoAssignments(database);
  const fallbackNow = '2026-08-01T00:00:00.000Z';
  const persistedIndexes = Array.isArray(database.accessIndex) ? database.accessIndex as JsonRecord[] : [];
  const indexes = persistedIndexes.length
    ? persistedIndexes
    : buildAccessIndexDocuments({
        assignments: assignments.map((assignment) => normalizeAssignment(assignment, fallbackNow)),
        accessVersion: 1,
        updatedAt: fallbackNow,
        now: new Date(fallbackNow),
      }).map((index) => ({ id: indexKey(index), ...index }));
  return {
    source: `demo:${source}`,
    users: derivedDemoUsers(database),
    leagues: Array.isArray(database.leagues) ? database.leagues as JsonRecord[] : [],
    teams: Array.isArray(database.teams) ? database.teams as JsonRecord[] : [],
    athletes: Array.isArray(database.athletes) ? database.athletes as JsonRecord[] : [],
    assignments,
    indexes,
  };
}

async function loadFirebaseDataset(projectId: string | undefined, databaseId: string | undefined): Promise<AccessCompatibilityDataset> {
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const app = getApps()[0] ?? initializeApp({
    credential: projectId && clientEmail && privateKey
      ? cert({ projectId, clientEmail, privateKey })
      : applicationDefault(),
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
  const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  const auth = getAuth(app);

  const listCollection = async (collectionName: string) => {
    const snapshot = await db.collection(collectionName).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  };
  const authUsers: JsonRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    authUsers.push(...page.users.map((user) => ({
      id: user.uid,
      uid: user.uid,
      email: user.email ?? '',
      disabled: user.disabled,
      customClaims: user.customClaims ?? {},
    })));
    pageToken = page.pageToken;
  } while (pageToken);

  return {
    source: `firebase:${projectId ?? 'default'}:${databaseId ?? '(default)'}`,
    authUsers,
    users: await listCollection('users'),
    leagues: await listCollection('leagues'),
    teams: await listCollection('teams'),
    athletes: await listCollection('athletes'),
    assignments: await listCollection('accessAssignments'),
    indexes: await listCollection('accessIndex'),
  };
}

function printHuman(report: CompatibilityReport) {
  console.log('GoalPlace256 access compatibility report');
  console.log(`Source: ${report.source}`);
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Users: ${report.counts.users} Firestore / ${report.counts.authUsers} Auth`);
  console.log(`Assignments: ${report.counts.assignments}`);
  console.log(`Access indexes: ${report.counts.indexes}`);
  console.log(`Blockers: ${report.blockers}`);
  console.log(`Warnings: ${report.warnings}`);
  if (Object.keys(report.issueCounts).length) {
    console.log('Issue counts:');
    for (const [code, count] of Object.entries(report.issueCounts).sort()) {
      console.log(`- ${code}: ${count}`);
    }
  }
  if (report.issues.length) {
    console.log('Samples:');
    for (const issue of report.issues) {
      console.log(`- [${issue.severity}] ${issue.code}: ${issue.message}`);
    }
  }
}

export async function runAccessCompatibilityReport(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const dataset = args.firebase
    ? await loadFirebaseDataset(args.projectId, args.databaseId)
    : await loadDemoDataset(args.source);
  const report = buildAccessCompatibilityReport(dataset, { strict: args.strict });
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }
  if (report.blockers > 0) process.exitCode = 1;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAccessCompatibilityReport().catch((error) => {
    console.error(`Access compatibility report failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
