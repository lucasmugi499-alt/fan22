import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { sweepUnreportedMatches } from '../../functions/src/matchReports';
import { initializeMigrationFirestore } from '../lib/firestoreTarget';

function numericFlag(argv: string[], name: string, fallback: number) {
  const index = argv.indexOf(name);
  const raw = index >= 0 ? argv[index + 1] : undefined;
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

export async function main(argv = process.argv.slice(2)) {
  const target = initializeMigrationFirestore();
  const apply = argv.includes('--apply');
  const maxOpened = numericFlag(argv, '--max-opened', 50);
  const result = await sweepUnreportedMatches(target.db, new Date(), {
    dryRun: !apply,
    maxOpened,
  });

  console.log(JSON.stringify({
    target: target.label,
    mode: apply ? 'apply' : 'dry_run',
    generatedAt: new Date().toISOString(),
    ...result,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
