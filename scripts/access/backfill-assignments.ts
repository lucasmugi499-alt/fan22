import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { accessIndexId, type AccessAssignment, type AccessRoleKey } from '../../src/lib/auth/access';
import { normalizeAccessAssignment, projectScopeIndex } from '../../src/lib/auth/accessProjection';
import { accountClassForRole } from '../../src/lib/auth/accountClass';

/**
 * Stage B backfill: give every legacy grant a canonical assignment, and every operator an
 * explicit account class.
 *
 * The drift report proves the projection matches the assignments. This closes the other
 * direction — operators who hold access only through a legacy `adminUserIds` entry and
 * would be locked out the moment Firestore Rules stop reading those arrays.
 *
 * Additive and idempotent. Assignment ids are deterministic, so re-running creates
 * nothing new. It never revokes: removing access that should not exist is a separate,
 * deliberate decision, not something a migration should infer.
 *
 *   npx tsx --env-file=.env.local scripts/access/backfill-assignments.ts --project X --database fg256
 *   ... --apply
 */

type JsonRecord = { id: string; [key: string]: unknown };

type PlannedAssignment = {
  id: string;
  userId: string;
  scopeType: 'league' | 'team' | 'platform';
  scopeId: string;
  roleKey: AccessRoleKey;
  permissionBundleId: string;
  source: 'adminUserIds' | 'teamAssignment' | 'platformRole';
};

type PlannedAccountClass = {
  userId: string;
  role: string;
  accountClass: string;
};

/** The role a legacy grant implies. Legacy arrays carry no finer distinction. */
const SCOPE_ROLE: Record<'league' | 'team', { roleKey: AccessRoleKey; permissionBundleId: string }> = {
  league: { roleKey: 'league_admin', permissionBundleId: 'league_admin' },
  team: { roleKey: 'team_admin', permissionBundleId: 'full_team_admin' },
};

/**
 * Platform authority currently rests on the coarse `role` custom claim, which
 * `securePlatformCommand` accepts as a blanket bypass. Mirroring it into a canonical
 * platform-scope assignment grants nothing these accounts do not already have, and is
 * what allows the bypass to be removed later in favour of real capability checks.
 */
const PLATFORM_ROLE: Record<string, { roleKey: AccessRoleKey; permissionBundleId: string }> = {
  super_admin: { roleKey: 'super_admin', permissionBundleId: 'super_admin_governance' },
  platform_admin: { roleKey: 'platform_admin', permissionBundleId: 'platform_admin' },
};

export function backfillAssignmentId(scopeType: 'league' | 'team' | 'platform', scopeId: string, userId: string) {
  return `assignment_migrated_${scopeType}_${scopeId}_${userId}`;
}

export function planBackfill(input: {
  assignments: AccessAssignment[];
  leagues: JsonRecord[];
  teams: JsonRecord[];
  teamAssignments: JsonRecord[];
  users: JsonRecord[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  const covered = (userId: string, scopeType: 'league' | 'team' | 'platform', scopeId: string) => {
    const projected = projectScopeIndex({
      scope: { userId, scopeType, scopeId },
      assignments: input.assignments,
      updatedAt: nowIso,
      now,
    });
    return Boolean(projected && projected.capabilities.length > 0);
  };

  const planned = new Map<string, PlannedAssignment>();
  const add = (userId: string, scopeType: 'league' | 'team', scopeId: string, source: PlannedAssignment['source']) => {
    /**
     * Team scope is never backfilled since ADR-004.
     *
     * `covered()` asks whether a canonical assignment already grants something, and every
     * team bundle was versioned to zero capabilities, so no team assignment can ever answer
     * yes. Without this guard the tool would propose one migrated assignment per legacy
     * `adminUserIds` entry, each granting nothing and each reading to whoever holds it as a
     * role they still have. A legacy team entry is residue to be cleared, not a gap to be
     * filled.
     */
    if (scopeType === 'team') return;
    if (!userId || !scopeId || covered(userId, scopeType, scopeId)) return;
    const id = backfillAssignmentId(scopeType, scopeId, userId);
    if (planned.has(id)) return;
    planned.set(id, { id, userId, scopeType, scopeId, source, ...SCOPE_ROLE[scopeType] });
  };

  for (const [scopeType, records] of [['league', input.leagues], ['team', input.teams]] as const) {
    for (const record of records) {
      const ids = record.adminUserIds;
      if (!Array.isArray(ids)) continue;
      for (const userId of ids) {
        if (typeof userId === 'string') add(userId, scopeType, record.id, 'adminUserIds');
      }
    }
  }

  for (const record of input.teamAssignments) {
    if (record.status !== 'active') continue;
    const userId = typeof record.userId === 'string' ? record.userId : '';
    const teamId = typeof record.teamId === 'string' ? record.teamId : '';
    add(userId, 'team', teamId, 'teamAssignment');
  }

  for (const user of input.users) {
    const role = typeof user.role === 'string' ? user.role : '';
    const platform = PLATFORM_ROLE[role];
    if (!platform) continue;
    if (covered(user.id, 'platform', 'global')) continue;
    const id = backfillAssignmentId('platform', 'global', user.id);
    if (planned.has(id)) continue;
    planned.set(id, {
      id,
      userId: user.id,
      scopeType: 'platform',
      scopeId: 'global',
      source: 'platformRole',
      ...platform,
    });
  }

  // An operator whose account class is only inferable from the legacy role would fail
  // the account-class gates once that role stops being authoritative.
  const accountClasses: PlannedAccountClass[] = [];
  for (const user of input.users) {
    if (typeof user.accountClass === 'string' && user.accountClass) continue;
    const role = typeof user.role === 'string' ? user.role : 'fan';
    accountClasses.push({ userId: user.id, role, accountClass: accountClassForRole(role) });
  }

  // Without accessVersion a client cannot tell that its cached scoped context is stale.
  const accessVersions = input.users
    .filter((user) => user.accessVersion == null)
    .filter((user) => {
      const role = typeof user.role === 'string' ? user.role : 'fan';
      return accountClassForRole(role) !== 'fan';
    })
    .map((user) => user.id);

  return { assignments: [...planned.values()], accountClasses, accessVersions };
}

function assignmentDocument(planned: PlannedAssignment, nowIso: string) {
  return {
    id: planned.id,
    userId: planned.userId,
    roleKey: planned.roleKey,
    scopeType: planned.scopeType,
    scopeId: planned.scopeId,
    permissionBundleId: planned.permissionBundleId,
    status: 'active',
    // Recorded as a migration grant so the origin of this authority stays auditable.
    grantedByUserId: 'system_access_migration',
    migrationSource: planned.source,
    validFrom: nowIso,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function valueAfter(argv: string[], flag: string) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const projectId = valueAfter(argv, '--project') ?? process.env.FIREBASE_ADMIN_PROJECT_ID;
  const databaseId = valueAfter(argv, '--database') ?? process.env.GOALPLACE_FIRESTORE_DATABASE_ID ?? 'fg256';

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const app = getApps()[0] ?? initializeApp({
    credential: projectId && clientEmail && privateKey
      ? cert({ projectId, clientEmail, privateKey })
      : applicationDefault(),
    projectId,
  });
  const db = getFirestore(app, databaseId);
  const now = new Date();
  const nowIso = now.toISOString();

  const list = async (name: string) => {
    const snapshot = await db.collection(name).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as JsonRecord));
  };

  const [assignmentRows, leagues, teams, teamAssignments, users] = await Promise.all([
    list('accessAssignments'),
    list('leagues'),
    list('teams'),
    list('teamAssignments'),
    list('users'),
  ]);

  const assignments = assignmentRows.map((row) => normalizeAccessAssignment(row.id, row, nowIso));
  const plan = planBackfill({ assignments, leagues, teams, teamAssignments, users, now });

  console.log('GoalPlace256 access backfill');
  console.log(`Source: ${projectId}/${databaseId}`);
  console.log(`Mode: ${apply ? 'APPLY (writes)' : 'dry run (no writes)'}`);
  console.log(`Existing assignments: ${assignments.length}`);
  console.log(`Assignments to create: ${plan.assignments.length}`);
  console.log(`  from adminUserIds: ${plan.assignments.filter((row) => row.source === 'adminUserIds').length}`);
  console.log(`  from teamAssignments: ${plan.assignments.filter((row) => row.source === 'teamAssignment').length}`);
  console.log(`  from platform roles: ${plan.assignments.filter((row) => row.source === 'platformRole').length}`);
  console.log(`Users needing an explicit accountClass: ${plan.accountClasses.length}`);
  console.log(`Operators needing an accessVersion: ${plan.accessVersions.length}`);
  for (const distinct of ['fan', 'athlete', 'organization_operator', 'platform_operator']) {
    const count = plan.accountClasses.filter((row) => row.accountClass === distinct).length;
    if (count) console.log(`  ${distinct}: ${count}`);
  }

  if (apply) {
    const created = [...assignments];
    for (let offset = 0; offset < plan.assignments.length; offset += 200) {
      const batch = db.batch();
      for (const planned of plan.assignments.slice(offset, offset + 200)) {
        batch.set(db.collection('accessAssignments').doc(planned.id), assignmentDocument(planned, nowIso), { merge: true });
        created.push(normalizeAccessAssignment(planned.id, {
          ...planned,
          status: 'active',
          validFrom: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
          grantedByUserId: 'system_access_migration',
        }, nowIso));
      }
      await batch.commit();
    }

    // Project the new assignments so the index matches immediately rather than waiting
    // for the next mutation to touch each scope.
    for (let offset = 0; offset < plan.assignments.length; offset += 200) {
      const batch = db.batch();
      const touched = new Set<string>();
      for (const planned of plan.assignments.slice(offset, offset + 200)) {
        const desired = projectScopeIndex({
          scope: { userId: planned.userId, scopeType: planned.scopeType, scopeId: planned.scopeId },
          assignments: created,
          updatedAt: nowIso,
          now,
        });
        if (!desired) continue;
        batch.set(db.collection('accessIndex').doc(accessIndexId(planned.scopeType, planned.scopeId, planned.userId)), {
          ...desired,
          accessVersion: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: false });
        touched.add(planned.userId);
      }
      for (const userId of touched) {
        batch.set(db.collection('users').doc(userId), {
          accessVersion: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      await batch.commit();
    }

    for (let offset = 0; offset < plan.accountClasses.length; offset += 300) {
      const batch = db.batch();
      for (const row of plan.accountClasses.slice(offset, offset + 300)) {
        batch.set(db.collection('users').doc(row.userId), {
          accountClass: row.accountClass,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      await batch.commit();
    }

    for (let offset = 0; offset < plan.accessVersions.length; offset += 300) {
      const batch = db.batch();
      for (const userId of plan.accessVersions.slice(offset, offset + 300)) {
        batch.set(db.collection('users').doc(userId), {
          accessVersion: 1,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      await batch.commit();
    }

    console.log('');
    console.log(`Created ${plan.assignments.length} assignment(s), set ${plan.accountClasses.length} account class(es) and ${plan.accessVersions.length} access version(s).`);
  }

  const reportDir = path.join(process.cwd(), 'reports', 'access');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportFile = path.join(reportDir, `backfill-${now.toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportFile, `${JSON.stringify({
    source: `${projectId}/${databaseId}`,
    generatedAt: nowIso,
    apply,
    assignments: plan.assignments,
    accountClasses: plan.accountClasses.slice(0, 500),
    accountClassCount: plan.accountClasses.length,
    accessVersionCount: plan.accessVersions.length,
  }, null, 2)}\n`);
  console.log(`Report: ${reportFile}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
