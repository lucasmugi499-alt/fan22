/**
 * Report-only run of the lifecycle convergence worker against a live project.
 *
 * Runs the exact functions the scheduled Function calls, with `dryRun` set, so the operator
 * can see what a first mutating run WOULD do before one is ever scheduled. Nothing is
 * written: assignments are counted, not transitioned, and repair jobs are counted, not
 * claimed.
 *
 *   npm run lifecycle:report
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { expireLapsedAssignments, runProjectionRepairs } from '../../functions/src/lifecycle';

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n'),
  }),
}, `lifecycle-report-${Date.now()}`);
const db = getFirestore(app, process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID!);

async function main() {
  console.log(`Project  : ${process.env.FIREBASE_ADMIN_PROJECT_ID}`);
  console.log(`Database : ${process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID}`);
  console.log('Mode     : REPORT ONLY (no writes)\n');

  const expiry = await expireLapsedAssignments(db, { dryRun: true, rebuild: async () => 0 });
  console.log('--- assignment expiry ---');
  console.log('lapsed assignments found     :', expiry.lapsedFound);
  console.log('would transition to expired  :', expiry.transitioned);
  console.log('users whose access rebuilds  :', expiry.usersRebuilt);
  console.log('errors                       :', expiry.errors.length);
  for (const error of expiry.errors) console.log('   ', error);

  const repairs = await runProjectionRepairs(
    db,
    async () => undefined,
    async () => true,
    { dryRun: true },
  );
  console.log('\n--- projection repair backlog ---');
  console.log('jobs due for an attempt      :', repairs.claimed);
  console.log('jobs past their budget       :', repairs.deadLettered);

  const byStatus: Record<string, number> = {};
  const all = await db.collection('projectionRepairJobs').limit(500).get();
  for (const doc of all.docs) {
    const status = String(doc.data()?.status ?? 'unknown');
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }
  console.log('queue by status              :', JSON.stringify(byStatus));
  console.log('\nNothing was written.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
