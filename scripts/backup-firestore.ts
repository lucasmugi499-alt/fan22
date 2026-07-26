import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type App } from 'firebase-admin/app';
import {
  getFirestore,
  type CollectionReference,
  type DocumentReference,
} from 'firebase-admin/firestore';
import { buildProjectMap, GuardError, parseArgs, validate } from './clean/guards';
import { createApp, destroyApp, loadCredentials } from './clean/app';

interface BackupEntry {
  path: string;
  documents: number;
  file: string;
}

function safeFilename(collectionPath: string) {
  return `${collectionPath.replaceAll('/', '__')}.json`;
}

async function backupCollection(
  collection: CollectionReference,
  outputDir: string,
  entries: BackupEntry[]
): Promise<number> {
  const snapshot = await collection.get();
  const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const file = safeFilename(collection.path);

  await writeFile(path.join(outputDir, file), JSON.stringify(docs, null, 2), 'utf8');
  entries.push({ path: collection.path, documents: docs.length, file });

  let total = docs.length;
  for (const doc of snapshot.docs) {
    total += await backupSubcollections(doc.ref, outputDir, entries);
  }
  return total;
}

async function backupSubcollections(
  docRef: DocumentReference,
  outputDir: string,
  entries: BackupEntry[]
): Promise<number> {
  let total = 0;
  for (const subcollection of await docRef.listCollections()) {
    total += await backupCollection(subcollection, outputDir, entries);
  }
  return total;
}

async function runBackup(app: App, projectId: string, databaseId: string, environment: string) {
  const db = getFirestore(app, databaseId);
  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const outputDir = path.join(process.cwd(), 'backups', 'firestore', environment, timestamp);
  const entries: BackupEntry[] = [];
  let totalDocuments = 0;

  await mkdir(outputDir, { recursive: true });

  const rootCollections = await db.listCollections();
  for (const collection of rootCollections.sort((a, b) => a.id.localeCompare(b.id))) {
    totalDocuments += await backupCollection(collection, outputDir, entries);
  }

  const manifest = {
    projectId,
    databaseId,
    environment,
    takenAt: new Date().toISOString(),
    totalDocuments,
    collections: entries.sort((a, b) => a.path.localeCompare(b.path)),
  };

  await writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  await writeFile(
    path.join(outputDir, 'README.md'),
    [
      `# Firestore backup: ${environment}`,
      '',
      `- Project: \`${projectId}\``,
      `- Database: \`${databaseId}\``,
      `- Total documents: ${totalDocuments}`,
      `- Taken at: ${manifest.takenAt}`,
      '',
      '## Collections',
      ...manifest.collections.map((entry) => `- \`${entry.path}\`: ${entry.documents} docs -> \`${entry.file}\``),
      '',
    ].join('\n'),
    'utf8'
  );

  return { outputDir, totalDocuments, collectionFiles: entries.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const aliases = JSON.parse(readFileSync('.firebaserc', 'utf8')).projects ?? {};
  const creds = loadCredentials((args as { credentials?: string }).credentials);

  if (!creds) {
    throw new GuardError(
      'No Admin credentials found. Provide --credentials <service-account.json> or set ' +
        'FIREBASE_ADMIN_* variables for the TARGET project.'
    );
  }

  const plan = validate(args, buildProjectMap(aliases), {
    requireConfirm: false,
    credentialProjectId: creds.projectId,
  });

  const app = createApp(creds, `backup-${Date.now()}`);
  try {
    const result = await runBackup(app, plan.projectId, plan.databaseId, plan.environment);
    console.log(`Backed up ${result.totalDocuments} Firestore document(s).`);
    console.log(`Wrote ${result.collectionFiles} collection file(s) to ${result.outputDir}`);
  } finally {
    await destroyApp(app);
  }
}

main().catch((error) => {
  if (error instanceof GuardError) {
    console.error(`\nRefusing to run:\n\n${error.message}\n`);
    process.exit(2);
  }
  console.error('Firestore backup failed:', error);
  process.exit(1);
});
