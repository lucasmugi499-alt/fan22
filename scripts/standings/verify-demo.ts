import process from 'node:process';
import { initializeMigrationFirestore } from '../lib/firestoreTarget';

/**
 * Read the published table back off a live database.
 *
 * Not a test — a read-back. `standings` is now the projection every table surface reads, and
 * the point of a projection is that you can look at it. This prints one season's rows with
 * their recomputation stamp so an operator can confirm a rebuild actually landed, rather than
 * inferring it from the script's own summary line.
 *
 *   tsx --env-file=.env.local scripts/standings/verify-demo.ts --season=<seasonId>
 */
async function main() {
  const target = initializeMigrationFirestore();
  const seasonId = process.argv.find((a) => a.startsWith('--season='))?.slice(9);
  if (!seasonId) throw new Error('--season=<seasonId> is required.');

  const rows = await target.db.collection('standings').where('seasonId', '==', seasonId).get();
  console.log(`Target : ${target.label}`);
  console.log(`Season : ${seasonId}`);
  console.log(`Rows   : ${rows.size}`);

  rows.docs
    .map((doc) => doc.data())
    .sort((a, b) => Number(a.rank) - Number(b.rank))
    .forEach((row) => {
      const adj = row.adjustment ? `  adj ${row.adjustment}` : '';
      const awarded = row.awarded ? `  awarded ${row.awarded}` : '';
      console.log(
        `  ${String(row.rank).padStart(2)}  ${String(row.teamName).padEnd(22)}`
        + ` P${String(row.played).padStart(2)} Pts${String(row.points).padStart(3)}`
        + `${adj}${awarded}  ${row.recomputedAt ? 'recomputed' : 'NOT RECOMPUTED'}`,
      );
    });
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
