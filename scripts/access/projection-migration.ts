import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { accessIndexId } from '../../src/lib/auth/access';
import {
  authorityMatches,
  normalizeAccessAssignment,
  normalizeAccessIndex,
  projectScopeIndex,
  projectionAuthority,
  type AccessScopeKey,
} from '../../src/lib/auth/accessProjection';
import { loadDemoDataset as loadCompatibilityDemoDataset } from './compatibility-report';

/**
 * Stage B of the access migration: rebuild every `accessIndex` document from canonical
 * assignments, report the drift, and optionally repair it.
 *
 * Dry-run by default. Nothing about the cutover may be approved on the strength of an
 * untested projection — this is how the rehearsal is performed and how the "divergence
 * has reached zero" gate is evidenced.
 *
 *   npx tsx scripts/access/projection-migration.ts                       # demo, dry run
 *   npx tsx scripts/access/projection-migration.ts --firebase --project X --database fg256
 *   npx tsx scripts/access/projection-migration.ts --firebase ... --apply
 */

type JsonRecord = { id: string; [key: string]: unknown };

type DriftRow = {
  userId: string;
  scopeType: string;
  scopeId: string;
  indexId: string;
  reason: 'missing_index' | 'stale_index' | 'orphan_index';
  current: ReturnType<typeof projectionAuthority>;
  desired: ReturnType<typeof projectionAuthority>;
};

type MigrationReport = {
  source: string;
  generatedAt: string;
  apply: boolean;
  counts: {
    users: number;
    assignments: number;
    indexes: number;
    scopesChecked: number;
  };
  driftCounts: Record<DriftRow['reason'], number>;
  drift: DriftRow[];
  legacyCoverage: {
    gaps: number;
    byGrant: Record<LegacyCoverageRow['grant'], number>;
    samples: LegacyCoverageRow[];
  };
  repaired: number;
};

function valueAfter(argv: string[], flag: string) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function parseArgs(argv: string[]) {
  return {
    firebase: argv.includes('--firebase'),
    apply: argv.includes('--apply'),
    json: argv.includes('--json'),
    source: valueAfter(argv, '--source') ?? path.join(process.cwd(), 'data', 'investor-demo'),
    projectId:
      valueAfter(argv, '--project')
      ?? process.env.GOALPLACE_ADMIN_PROJECT_ID
      ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    databaseId:
      valueAfter(argv, '--database')
      ?? process.env.GOALPLACE_FIRESTORE_DATABASE_ID
      ?? process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID,
  };
}

function scopeSignature(scope: { userId: string; scopeType: string; scopeId: string }) {
  return `${scope.scopeType}:${scope.scopeId}:${scope.userId}`;
}

/**
 * The comparison itself. Identical maths to the runtime projector — both call
 * `projectScopeIndex` — so a clean report here means the runtime agrees.
 */
export function buildMigrationPlan(input: {
  assignments: JsonRecord[];
  indexes: JsonRecord[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  const assignments = input.assignments.map((row) => normalizeAccessAssignment(row.id, row, nowIso));
  const currentByScope = new Map(input.indexes.map((row) => {
    const index = normalizeAccessIndex(row);
    return [scopeSignature(index), index];
  }));

  const scopes = new Map<string, AccessScopeKey>();
  for (const assignment of assignments) {
    const scope = { userId: assignment.userId, scopeType: assignment.scopeType, scopeId: assignment.scopeId };
    scopes.set(scopeSignature(scope), scope);
  }
  for (const [, index] of currentByScope) {
    const scope = { userId: index.userId, scopeType: index.scopeType, scopeId: index.scopeId };
    scopes.set(scopeSignature(scope), scope);
  }

  const drift: DriftRow[] = [];
  for (const [signature, scope] of scopes) {
    const current = currentByScope.get(signature) ?? null;
    const desired = projectScopeIndex({ scope, assignments, updatedAt: nowIso, now });
    if (authorityMatches(current, desired)) continue;

    drift.push({
      userId: scope.userId,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      indexId: accessIndexId(scope.scopeType, scope.scopeId, scope.userId),
      reason: !current ? 'missing_index' : !desired ? 'orphan_index' : 'stale_index',
      current: projectionAuthority(current),
      desired: projectionAuthority(desired),
    });
  }

  return { assignments, scopes, drift };
}

/**
 * Reuses the compatibility report's loader. The bundled demo database stores no
 * canonical assignments — they are derived from the legacy team assignments and admin
 * arrays — so deriving them a second way here would compare the migration against a
 * different dataset than the one the compatibility gate reports on.
 */
async function loadDemoDataset(source: string) {
  const dataset = await loadCompatibilityDemoDataset(source);
  const database = JSON.parse(
    fs.readFileSync(path.join(source, 'database.json'), 'utf8'),
  ) as Record<string, JsonRecord[] | undefined>;
  return {
    label: dataset.source,
    users: dataset.users,
    assignments: dataset.assignments,
    indexes: dataset.indexes,
    leagues: dataset.leagues,
    teams: dataset.teams,
    teamAssignments: database.teamAssignments ?? [],
  };
}

async function loadFirebaseDataset(projectId?: string, databaseId?: string) {
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const app = getApps()[0] ?? initializeApp({
    credential: projectId && clientEmail && privateKey
      ? cert({ projectId, clientEmail, privateKey })
      : applicationDefault(),
    projectId,
  });
  const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);

  const list = async (name: string) => {
    const snapshot = await db.collection(name).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as JsonRecord));
  };

  return {
    db,
    label: `firebase:${projectId ?? 'default'}/${databaseId ?? '(default)'}`,
    users: await list('users'),
    assignments: await list('accessAssignments'),
    indexes: await list('accessIndex'),
    leagues: await list('leagues'),
    teams: await list('teams'),
    teamAssignments: await list('teamAssignments'),
  };
}

export type LegacyCoverageRow = {
  scopeType: 'league' | 'team';
  scopeId: string;
  userId: string;
  grant: 'adminUserIds' | 'teamAssignment';
};

/**
 * The availability half of the cutover.
 *
 * The drift report above answers "does the projection match the assignments". It does
 * NOT answer "does a canonical assignment exist for everyone who currently has access".
 * An operator sitting in a legacy `adminUserIds` array with no active assignment keeps
 * working today and is locked out the moment Rules stop reading that array.
 *
 * Every row here is one such operator. This count must reach zero before Stage C, for
 * the opposite reason drift must: drift preserves privilege that should be gone, this
 * removes privilege that should remain.
 */
export function findLegacyCoverageGaps(input: {
  assignments: ReturnType<typeof buildMigrationPlan>['assignments'];
  leagues: JsonRecord[];
  teams: JsonRecord[];
  teamAssignments: JsonRecord[];
  now?: Date;
}): LegacyCoverageRow[] {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  const covered = (userId: string, scopeType: 'league' | 'team', scopeId: string) => {
    const projected = projectScopeIndex({
      scope: { userId, scopeType, scopeId },
      assignments: input.assignments,
      updatedAt: nowIso,
      now,
    });
    return Boolean(projected && projected.capabilities.length > 0);
  };

  const gaps: LegacyCoverageRow[] = [];

  for (const [scopeType, records] of [['league', input.leagues], ['team', input.teams]] as const) {
    for (const record of records) {
      const ids = record.adminUserIds;
      if (!Array.isArray(ids)) continue;
      for (const userId of ids) {
        if (typeof userId !== 'string' || !userId) continue;
        if (!covered(userId, scopeType, record.id)) {
          gaps.push({ scopeType, scopeId: record.id, userId, grant: 'adminUserIds' });
        }
      }
    }
  }

  for (const record of input.teamAssignments) {
    if (record.status !== 'active') continue;
    const userId = typeof record.userId === 'string' ? record.userId : '';
    const teamId = typeof record.teamId === 'string' ? record.teamId : '';
    if (!userId || !teamId) continue;
    if (!covered(userId, 'team', teamId)) {
      gaps.push({ scopeType: 'team', scopeId: teamId, userId, grant: 'teamAssignment' });
    }
  }

  return gaps;
}

async function repair(
  db: FirebaseFirestore.Firestore,
  drift: DriftRow[],
  assignments: ReturnType<typeof buildMigrationPlan>['assignments'],
  now: Date,
) {
  const nowIso = now.toISOString();
  let repaired = 0;

  // Batched in chunks so a large repair does not exceed the write limit.
  for (let offset = 0; offset < drift.length; offset += 400) {
    const chunk = drift.slice(offset, offset + 400);
    const batch = db.batch();
    const touchedUsers = new Set<string>();

    for (const row of chunk) {
      const ref = db.collection('accessIndex').doc(row.indexId);
      const desired = projectScopeIndex({
        scope: { userId: row.userId, scopeType: row.scopeType as AccessScopeKey['scopeType'], scopeId: row.scopeId },
        assignments,
        updatedAt: nowIso,
        now,
      });
      if (desired) {
        batch.set(ref, {
          ...desired,
          accessVersion: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: false });
      } else {
        // No active assignment remains: the projection is removed, not emptied.
        batch.delete(ref);
      }
      touchedUsers.add(row.userId);
      repaired += 1;
    }

    for (const userId of touchedUsers) {
      batch.set(db.collection('users').doc(userId), {
        accessVersion: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
  }

  return repaired;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();

  const dataset = args.firebase
    ? await loadFirebaseDataset(args.projectId, args.databaseId)
    : await loadDemoDataset(args.source);

  const plan = buildMigrationPlan({
    assignments: dataset.assignments,
    indexes: dataset.indexes,
    now,
  });

  let repaired = 0;
  if (args.apply) {
    if (!args.firebase) throw new Error('--apply requires --firebase; the demo dataset is a file, not a database.');
    repaired = await repair(
      (dataset as Awaited<ReturnType<typeof loadFirebaseDataset>>).db,
      plan.drift,
      plan.assignments,
      now,
    );
  }

  const legacyGaps = findLegacyCoverageGaps({
    assignments: plan.assignments,
    leagues: dataset.leagues ?? [],
    teams: dataset.teams ?? [],
    teamAssignments: dataset.teamAssignments ?? [],
    now,
  });

  const driftCounts = plan.drift.reduce((counts, row) => {
    counts[row.reason] = (counts[row.reason] ?? 0) + 1;
    return counts;
  }, {} as Record<DriftRow['reason'], number>);

  const report: MigrationReport = {
    source: dataset.label,
    generatedAt: now.toISOString(),
    apply: args.apply,
    counts: {
      users: dataset.users.length,
      assignments: dataset.assignments.length,
      indexes: dataset.indexes.length,
      scopesChecked: plan.scopes.size,
    },
    driftCounts: {
      missing_index: driftCounts.missing_index ?? 0,
      stale_index: driftCounts.stale_index ?? 0,
      orphan_index: driftCounts.orphan_index ?? 0,
    },
    drift: plan.drift.slice(0, 200),
    legacyCoverage: {
      gaps: legacyGaps.length,
      byGrant: {
        adminUserIds: legacyGaps.filter((row) => row.grant === 'adminUserIds').length,
        teamAssignment: legacyGaps.filter((row) => row.grant === 'teamAssignment').length,
      },
      samples: legacyGaps.slice(0, 200),
    },
    repaired,
  };

  const reportDir = path.join(process.cwd(), 'reports', 'access');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportFile = path.join(reportDir, `projection-migration-${now.toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('GoalPlace256 access projection migration');
    console.log(`Source: ${report.source}`);
    console.log(`Mode: ${args.apply ? 'APPLY (writes)' : 'dry run (no writes)'}`);
    console.log(`Users: ${report.counts.users}`);
    console.log(`Assignments: ${report.counts.assignments}`);
    console.log(`Access indexes: ${report.counts.indexes}`);
    console.log(`Scopes checked: ${report.counts.scopesChecked}`);
    console.log(`Missing index: ${report.driftCounts.missing_index}`);
    console.log(`Stale index: ${report.driftCounts.stale_index}`);
    console.log(`Orphan index: ${report.driftCounts.orphan_index}`);
    console.log('');
    console.log(`Legacy grants with no canonical assignment: ${report.legacyCoverage.gaps}`);
    console.log(`  via adminUserIds: ${report.legacyCoverage.byGrant.adminUserIds}`);
    console.log(`  via teamAssignments: ${report.legacyCoverage.byGrant.teamAssignment}`);
    console.log(`Repaired: ${report.repaired}`);
    console.log(`Report: ${reportFile}`);
  }

  const totalDrift = plan.drift.length;
  if (!args.apply && totalDrift > 0) {
    console.log('');
    console.log(`${totalDrift} scope(s) diverge from canonical assignments. Re-run with --apply to repair.`);
  }
  if (legacyGaps.length > 0) {
    console.log('');
    console.log(`${legacyGaps.length} legacy grant(s) have no canonical assignment.`);
    console.log('Each is an operator who would lose access at the Stage C cutover.');
    console.log('These cannot be repaired by --apply: the assignments must be created first.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
