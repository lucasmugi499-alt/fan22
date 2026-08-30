import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Generate the composite indexes `/api/discover` needs, into `firestore.indexes.json`.
 *
 * ## Why generated and not hand-written
 *
 * Firestore needs a composite index for every combination of equality filters plus an order.
 * Discovery offers three optional filters over four collections, which is twenty-six indexes —
 * enough that maintaining them by hand guarantees drift, and the failure mode of drift is
 * nasty: the query works for every filter combination somebody tried locally and returns
 * FAILED_PRECONDITION for the one they did not.
 *
 * Deriving them from the same table the query builder uses means the set cannot fall behind
 * the queries. If `queryDiscovery` learns a new filter, this file is where it is declared, and
 * running this regenerates the indexes to match.
 *
 *   tsx scripts/firestore/discovery-indexes.ts            # report what is missing
 *   tsx scripts/firestore/discovery-indexes.ts --apply    # write firestore.indexes.json
 *
 * Then deploy them. An index declared and not deployed is an index that does not exist:
 *
 *   npm run deploy:demo:candidate
 */

const ROOT = process.cwd();
const INDEX_FILE = path.join(ROOT, 'firestore.indexes.json');

type IndexField = { fieldPath: string; order: 'ASCENDING' | 'DESCENDING' };
type CompositeIndex = {
  collectionGroup: string;
  queryScope: 'COLLECTION';
  fields: IndexField[];
};

/**
 * Mirrors `ORDER` and the filter support tables in `server/discovery/query.ts`.
 *
 * Kept as data rather than imported, because that module is `server-only` and importing it
 * here would drag the Admin SDK into a script that only needs to know shapes.
 */
const COLLECTIONS: Record<string, {
  order: IndexField;
  filters: string[];
}> = {
  leagues: {
    order: { fieldPath: 'goalPlaceIndex', order: 'DESCENDING' },
    filters: ['sport', 'city', 'verified'],
  },
  teams: {
    order: { fieldPath: 'createdAt', order: 'DESCENDING' },
    filters: ['sport', 'city', 'verified'],
  },
  athletes: {
    order: { fieldPath: 'goalPlacePoints', order: 'DESCENDING' },
    filters: ['sport', 'city', 'verified'],
  },
  matches: {
    order: { fieldPath: 'scheduledAt', order: 'DESCENDING' },
    // No city or verified filter on matches — see the note in query.ts.
    filters: ['sport'],
  },
};

/** Every non-empty subset of the filters, in the order the query builder applies them. */
function filterCombinations(filters: string[]): string[][] {
  const combos: string[][] = [];
  for (let mask = 1; mask < 2 ** filters.length; mask += 1) {
    combos.push(filters.filter((_, index) => mask & (1 << index)));
  }
  return combos;
}

export function requiredIndexes(): CompositeIndex[] {
  const indexes: CompositeIndex[] = [];
  for (const [collectionGroup, spec] of Object.entries(COLLECTIONS)) {
    for (const combo of filterCombinations(spec.filters)) {
      indexes.push({
        collectionGroup,
        queryScope: 'COLLECTION',
        fields: [
          // Equality filters ascending, then the order field. This is the shape Firestore
          // requires; the equality direction is irrelevant to it but must be present.
          ...combo.map((fieldPath) => ({ fieldPath, order: 'ASCENDING' as const })),
          spec.order,
        ],
      });
    }
  }
  return indexes;
}

/** Field-order sensitive: two indexes with the same fields in a different order differ. */
function signature(index: CompositeIndex): string {
  return `${index.collectionGroup}:${index.fields.map((f) => `${f.fieldPath}/${f.order}`).join(',')}`;
}

export function main(argv = process.argv.slice(2)) {
  const apply = argv.includes('--apply');
  const file = JSON.parse(readFileSync(INDEX_FILE, 'utf8')) as {
    indexes: CompositeIndex[];
    fieldOverrides?: unknown[];
  };

  const existing = new Set(file.indexes.map(signature));
  const missing = requiredIndexes().filter((index) => !existing.has(signature(index)));

  console.log(`Existing composite indexes : ${file.indexes.length}`);
  console.log(`Required for discovery     : ${requiredIndexes().length}`);
  console.log(`Missing                    : ${missing.length}`);
  missing.forEach((index) => {
    console.log(`  ${index.collectionGroup}: ${index.fields.map((f) => f.fieldPath).join(' + ')}`);
  });

  if (!missing.length) {
    console.log('\nNothing to add.');
    return { missing: 0 };
  }
  if (!apply) {
    console.log('\nNo files were written. Re-run with --apply.');
    return { missing: missing.length };
  }

  // Appended, never reordered. Firestore matches indexes by content, but a diff that rewrites
  // the whole file hides the change being made.
  file.indexes = [...file.indexes, ...missing];
  writeFileSync(INDEX_FILE, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`\nAdded ${missing.length} index(es) to firestore.indexes.json.`);
  console.log('Deploy them before the queries that need them: npm run deploy:demo:candidate');
  return { missing: missing.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
