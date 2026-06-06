import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { adminDb } from '../src/lib/firebase/admin';
import { seedCollections } from './seed-firestore';

async function main() {
  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const outputDir = path.join(process.cwd(), 'backups', 'firestore', timestamp);
  await mkdir(outputDir, { recursive: true });

  for (const { name } of seedCollections) {
    const snapshot = await adminDb.collection(name).get();
    const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    await writeFile(path.join(outputDir, `${name}.json`), JSON.stringify(docs, null, 2), 'utf8');
    console.log(`Backed up ${docs.length} ${name} docs`);
  }

  console.log(`Firestore backup written to ${outputDir}`);
}

main().catch((error) => {
  console.error('Firestore backup failed:', error);
  process.exit(1);
});
