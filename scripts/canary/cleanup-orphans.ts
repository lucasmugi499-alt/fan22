import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Removes canary residue that outlived its fixture, under evidence.
 *
 * The original finalizer canary deletes the submission document but not its `events`
 * subcollection, and a Firestore subcollection outlives a deleted parent. Two audit
 * entries from the 2026-08-06 and 2026-08-08 runs are stranded under a
 * `resultSubmissions/canary_fin_match_001` that no longer exists.
 *
 * These are test records, but they are *audit* test records, so they are not deleted
 * casually. Before removing anything this:
 *
 *   1. confirms every document carries the canary fixture id — nothing real is in scope
 *   2. checks for inbound references from live collections
 *   3. writes a full JSON snapshot to reports/canary/ as the evidence of what existed
 *   4. records one demo.canary.cleanup audit event describing the operation
 *
 * Immutable canary evidence elsewhere — finalizations, official events, reconciliation
 * records — is NOT in scope here and is left untouched. This removes only the orphaned
 * subcollection documents whose parent is already gone.
 *
 *   (no flag)  dry run
 *   --apply    delete, after writing the snapshot
 */

const FIXTURE_MATCH_IDS = ['canary_fin_match_001', 'canary_surplus_match_001'];

type Args = { apply: boolean; projectId?: string; databaseId: string };

function parseArgs(argv: string[]): Args {
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return {
    apply: argv.includes('--apply'),
    projectId: value('--project') ?? process.env.FIREBASE_ADMIN_PROJECT_ID,
    databaseId: value('--database') ?? process.env.GOALPLACE_FIRESTORE_DATABASE_ID ?? 'fg256',
  };
}

function db(args: Args): Firestore {
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const app = getApps()[0] ?? initializeApp({
    credential: args.projectId && clientEmail && privateKey
      ? cert({ projectId: args.projectId, clientEmail, privateKey })
      : applicationDefault(),
    projectId: args.projectId,
  });
  return getFirestore(app, args.databaseId);
}

export async function runCleanup(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const store = db(args);

  const found: Array<{ path: string; data: Record<string, unknown> }> = [];
  const parentsStillPresent: string[] = [];

  for (const matchId of FIXTURE_MATCH_IDS) {
    const parent = store.collection('resultSubmissions').doc(matchId);
    if ((await parent.get()).exists) {
      // A live parent means this is an active fixture, not residue. Never touch it.
      parentsStillPresent.push(matchId);
      continue;
    }
    for (const sub of await parent.listCollections()) {
      for (const doc of (await sub.get()).docs) {
        found.push({ path: `resultSubmissions/${matchId}/${sub.id}/${doc.id}`, data: doc.data() });
      }
    }
  }

  // Every document must name the fixture it belongs to. Anything else is out of scope.
  const misattributed = found.filter((entry) =>
    !FIXTURE_MATCH_IDS.includes(String(entry.data.submissionId ?? '')));

  // Inbound references: does anything live still point at these fixtures?
  const inbound: Record<string, number> = {};
  for (const collection of ['finalizations', 'officialSportEvents', 'officialAthleteMatchStats', 'reconciliationExceptions', 'matches', 'standings', 'fantasyPointEvents']) {
    for (const matchId of FIXTURE_MATCH_IDS) {
      const snapshot = await store.collection(collection).where('matchId', '==', matchId).get()
        .catch(() => null);
      if (snapshot?.size) inbound[`${collection}:${matchId}`] = snapshot.size;
    }
  }

  console.log('Canary orphan cleanup');
  console.log(`Source: ${args.projectId}/${args.databaseId}`);
  console.log(`Mode: ${args.apply ? 'APPLY (deletes)' : 'dry run'}`);
  console.log(`Fixtures with a surviving parent (skipped): ${parentsStillPresent.join(', ') || 'none'}`);
  console.log(`Orphaned documents found: ${found.length}`);
  for (const entry of found) console.log(`  ${entry.path}`);
  console.log(`Documents not attributable to a canary fixture: ${misattributed.length}`);
  console.log(`Inbound references from live collections: ${Object.keys(inbound).length ? JSON.stringify(inbound) : 'none'}`);

  if (misattributed.length) {
    console.log('');
    console.log('REFUSING: a document in scope does not name a canary fixture. Nothing deleted.');
    process.exitCode = 1;
    return { found: found.length, deleted: 0 };
  }
  if (Object.keys(inbound).length) {
    console.log('');
    console.log('REFUSING: live records still reference these fixtures. Nothing deleted.');
    process.exitCode = 1;
    return { found: found.length, deleted: 0 };
  }
  if (!found.length) {
    console.log('');
    console.log('Nothing to clean.');
    return { found: 0, deleted: 0 };
  }
  if (!args.apply) {
    console.log('');
    console.log('Re-run with --apply to write the evidence snapshot and delete.');
    return { found: found.length, deleted: 0 };
  }

  // Evidence first: the snapshot is written and confirmed before anything is removed.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = path.join(process.cwd(), 'reports', 'canary');
  await mkdir(directory, { recursive: true });
  const snapshotPath = path.join(directory, `canary-orphan-cleanup-${stamp}.json`);
  await writeFile(snapshotPath, JSON.stringify({
    operation: 'demo.canary.cleanup',
    generatedAt: new Date().toISOString(),
    database: `${args.projectId}/${args.databaseId}`,
    fixtures: FIXTURE_MATCH_IDS,
    documents: found,
  }, null, 2));
  console.log(`Evidence snapshot: ${snapshotPath}`);

  for (const entry of found) {
    await store.doc(entry.path).delete();
  }

  await store.collection('adminAuditEvents').add({
    action: 'demo.canary.cleanup',
    actorUserId: 'system:operator',
    targetCollection: 'resultSubmissions',
    targetId: FIXTURE_MATCH_IDS.join(','),
    note: `Removed ${found.length} orphaned canary audit document(s) whose parent submission was already deleted.`,
    evidenceSnapshot: path.relative(process.cwd(), snapshotPath),
    documentPaths: found.map((entry) => entry.path),
    environment: 'demo',
    createdAt: new Date().toISOString(),
  });

  console.log(`Deleted: ${found.length}`);
  console.log('Recorded audit event: demo.canary.cleanup');
  return { found: found.length, deleted: found.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCleanup().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
