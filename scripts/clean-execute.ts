/**
 * DESTRUCTIVE reset of GoalPlace256 application data.
 *
 * Deletes Firestore application documents (recursively, including subcollections), obsolete
 * Firebase Authentication accounts, and Storage objects. It never touches the project, the
 * database itself, security rules, indexes, or Cloud Functions.
 *
 *   npm run clean:execute -- --project <id> --database fg256 --env staging \
 *     --preserve <owner-uid> --confirm RESET-GOALPLACE-STAGING
 *
 * Production additionally requires --confirm RESET-GOALPLACE-PRODUCTION and must not be run
 * until a staging rehearsal and an approved dry-run report exist.
 */

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { buildProjectMap, parseArgs, validate, GuardError } from './clean/guards';
import { loadCredentials, createApp, destroyApp } from './clean/app';
import { buildInventory, renderInventory } from './clean/inventory';

/** Infrastructure that a data reset must never remove. */
const NEVER_DELETE_COLLECTIONS = new Set<string>([
  // Reserved for future server-owned immutable ledgers; deleting them would destroy the audit
  // trail that the trust model depends on. Remove explicitly and deliberately if ever needed.
  'finalizations',
  'auditEvents',
]);

interface DeletionLog {
  firestore: { collection: string; deleted: number; failed: number }[];
  auth: { uid: string; email: string | null; result: 'deleted' | 'preserved' | 'failed'; reason?: string }[];
  storage: { path: string; result: 'deleted' | 'failed' }[];
  skipped: string[];
  errors: string[];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const aliases = JSON.parse(readFileSync('.firebaserc', 'utf8')).projects ?? {};
  const projectMap = buildProjectMap(aliases);

  const creds = loadCredentials((args as { credentials?: string }).credentials);
  if (!creds) {
    throw new GuardError(
      'No Admin credentials found. Provide --credentials <service-account.json> or set ' +
        'FIREBASE_ADMIN_* variables for the TARGET project.'
    );
  }

  const plan = validate(args, projectMap, {
    requireConfirm: true,
    credentialProjectId: creds.projectId,
  });

  const keepLedgers = !(args as { includeLedgers?: boolean }).includeLedgers;

  console.log(`GoalPlace256 RESET — ${plan.environment.toUpperCase()}`);
  console.log(`Project ${plan.projectId} · database ${plan.databaseId}`);
  if (plan.dryRun) console.log('\n--dry-run set: no writes will be performed.\n');

  const app = createApp(creds, `execute-${Date.now()}`);
  const log: DeletionLog = { firestore: [], auth: [], storage: [], skipped: [], errors: [] };

  try {
    // Inventory first so the report records the exact pre-reset state.
    const before = await buildInventory(app, plan);
    console.log(renderInventory(before));

    // A reset that removes every administrator locks the platform. Refuse rather than warn.
    const admins = before.authUsers.filter(
      (u) => u.claims.role === 'platform_admin' || u.claims.role === 'super_admin' ||
             u.role === 'platform_admin' || u.role === 'super_admin'
    );
    if (admins.length > 0 && admins.every((u) => !u.preserved) && !plan.dryRun) {
      throw new GuardError(
        `Refusing to continue: all ${admins.length} admin account(s) would be deleted, which ` +
          'would lock you out.\nPass --preserve <uid> for the admin account you have verified ' +
          'you can sign in with.'
      );
    }

    const db = getFirestore(app, plan.databaseId);
    const auth = getAuth(app);

    // --- Firestore ---------------------------------------------------------------
    console.log('\nDeleting Firestore documents...');
    for (const c of before.collections) {
      if (keepLedgers && NEVER_DELETE_COLLECTIONS.has(c.path)) {
        log.skipped.push(`${c.path} (protected ledger; pass --include-ledgers to override)`);
        console.log(`  skip   ${c.path} (protected ledger)`);
        continue;
      }
      if (plan.dryRun) {
        console.log(`  would delete ${c.path} (${c.documents} docs)`);
        log.firestore.push({ collection: c.path, deleted: 0, failed: 0 });
        continue;
      }
      try {
        // recursiveDelete removes subcollections too, so nothing is orphaned.
        await db.recursiveDelete(db.collection(c.path));
        log.firestore.push({ collection: c.path, deleted: c.documents, failed: 0 });
        console.log(`  deleted ${c.path} (${c.documents} docs)`);
      } catch (cause) {
        const message = (cause as Error).message;
        log.firestore.push({ collection: c.path, deleted: 0, failed: c.documents });
        log.errors.push(`firestore ${c.path}: ${message}`);
        console.log(`  FAILED  ${c.path}: ${message}`);
      }
    }

    // --- Authentication ----------------------------------------------------------
    console.log('\nDeleting Firebase Authentication accounts...');
    const toDelete = before.authUsers.filter((u) => !u.preserved);
    for (const u of before.authUsers.filter((x) => x.preserved)) {
      log.auth.push({ uid: u.uid, email: u.email, result: 'preserved' });
      console.log(`  keep   ${u.email ?? u.uid}`);
    }
    // Batched, because deleteUsers accepts at most 1000 UIDs per call.
    for (let i = 0; i < toDelete.length; i += 1000) {
      const batch = toDelete.slice(i, i + 1000);
      if (plan.dryRun) {
        for (const u of batch) {
          console.log(`  would delete ${u.email ?? u.uid}`);
          log.auth.push({ uid: u.uid, email: u.email, result: 'deleted' });
        }
        continue;
      }
      try {
        const result = await auth.deleteUsers(batch.map((u) => u.uid));
        const failedUids = new Set(result.errors.map((e) => batch[e.index].uid));
        for (const u of batch) {
          const failed = failedUids.has(u.uid);
          log.auth.push({ uid: u.uid, email: u.email, result: failed ? 'failed' : 'deleted' });
          console.log(`  ${failed ? 'FAILED ' : 'deleted'} ${u.email ?? u.uid}`);
        }
        for (const e of result.errors) log.errors.push(`auth ${batch[e.index].uid}: ${e.error.message}`);
      } catch (cause) {
        log.errors.push(`auth batch: ${(cause as Error).message}`);
      }
    }

    // --- Storage -----------------------------------------------------------------
    console.log('\nDeleting Storage objects...');
    if (before.storageObjects === 0) {
      console.log('  (nothing to delete)');
    } else if (plan.dryRun) {
      console.log(`  would delete ${before.storageObjects} object(s)`);
    } else {
      try {
        const bucket = getStorage(app).bucket();
        const [files] = await bucket.getFiles();
        for (const file of files) {
          try {
            await file.delete();
            log.storage.push({ path: file.name, result: 'deleted' });
          } catch (cause) {
            log.storage.push({ path: file.name, result: 'failed' });
            log.errors.push(`storage ${file.name}: ${(cause as Error).message}`);
          }
        }
        console.log(`  deleted ${log.storage.filter((s) => s.result === 'deleted').length} object(s)`);
      } catch (cause) {
        log.errors.push(`storage: ${(cause as Error).message}`);
      }
    }

    // --- Report ------------------------------------------------------------------
    const after = plan.dryRun ? before : await buildInventory(app, plan);
    mkdirSync('reports', { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `reports/reset-execution-${plan.environment}-${stamp}`;
    const payload = { plan, dryRun: plan.dryRun, before, after, log };
    writeFileSync(`${base}.json`, JSON.stringify(payload, null, 2));

    const summary = [
      `# Reset execution report: ${plan.environment}`,
      '',
      `- Project: \`${plan.projectId}\``,
      `- Database: \`${plan.databaseId}\``,
      `- Mode: ${plan.dryRun ? 'DRY RUN (no writes)' : 'EXECUTED'}`,
      `- Completed: ${new Date().toISOString()}`,
      '',
      '## Firestore',
      ...log.firestore.map((f) => `- \`${f.collection}\`: ${f.deleted} deleted, ${f.failed} failed`),
      ...(log.skipped.length ? ['', '## Skipped', ...log.skipped.map((s) => `- ${s}`)] : []),
      '',
      '## Authentication',
      `- Deleted: ${log.auth.filter((a) => a.result === 'deleted').length}`,
      `- Preserved: ${log.auth.filter((a) => a.result === 'preserved').length}`,
      `- Failed: ${log.auth.filter((a) => a.result === 'failed').length}`,
      '',
      '## Storage',
      `- Deleted: ${log.storage.filter((s) => s.result === 'deleted').length}`,
      `- Failed: ${log.storage.filter((s) => s.result === 'failed').length}`,
      ...(log.errors.length ? ['', '## Errors', ...log.errors.map((e) => `- ${e}`)] : []),
      '',
      '## Remaining documents after reset',
      `- ${after.totalDocuments}`,
      '',
    ].join('\n');
    writeFileSync(`${base}.md`, summary);
    writeFileSync('RESET_EXECUTION_REPORT.md', summary);

    console.log(`\nWrote ${base}.json, ${base}.md and RESET_EXECUTION_REPORT.md`);
    if (log.errors.length) {
      console.log(`\nCompleted with ${log.errors.length} recoverable error(s); see the report.`);
    }
  } finally {
    await destroyApp(app);
  }
}

main().catch((error) => {
  if (error instanceof GuardError) {
    console.error(`\nRefusing to run:\n\n${error.message}\n`);
    process.exit(2);
  }
  console.error(error);
  process.exit(1);
});
