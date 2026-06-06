import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { mockDatabase } from '../src/data/mockDatabase';

const outputDir = path.join(process.cwd(), 'backups', 'mock-data');

async function main() {
  await mkdir(outputDir, { recursive: true });

  for (const [collectionName, data] of Object.entries(mockDatabase)) {
    await writeFile(
      path.join(outputDir, `${collectionName}.json`),
      JSON.stringify(data, null, 2),
      'utf8'
    );
  }

  await writeFile(
    path.join(outputDir, 'mockDatabase.json'),
    JSON.stringify(mockDatabase, null, 2),
    'utf8'
  );

  console.log(`Mock data exported to ${outputDir}`);
}

main().catch((error) => {
  console.error('Mock export failed:', error);
  process.exit(1);
});
