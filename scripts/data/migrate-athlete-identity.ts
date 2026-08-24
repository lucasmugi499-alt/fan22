import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

/**
 * Fill `legalName` and `registeredPosition` on athlete documents written before ADR-001.
 *
 * ## Why this is allowed to exist
 *
 * Invariant 04 says history is never rewritten, backfilled or reshaped to match a newer
 * model, and this script backfills a thousand documents. It is not a violation, and the
 * distinction matters enough to write down: `athletes/{id}` is a live registration record
 * that the League edits whenever a roster changes, not a record of something that happened.
 * The records invariant 04 protects are `officialSportEvents`,
 * `officialAthleteMatchStats` and the result versions, and this script does not touch them.
 *
 * `officialAthleteMatchStats` in particular keeps its denormalized `position` field. An
 * athlete registered as a forward in 2026 who moves to midfield in 2027 must not
 * retroactively change what their 2026 match record says.
 *
 * ## Order of operations
 *
 * Add, migrate, drop. This is the middle step: it writes the new fields and leaves the old
 * ones in place, so a surface that has not been swept yet keeps working and a rollback is a
 * deploy rather than a data repair. The old keys come off in a later pass, once
 * `data:guard` reports no reader left.
 *
 * Dry-run by default.
 */

export type AthleteIdentityRow = {
  id: string;
  legalName?: string;
  registeredPosition?: string;
  name?: string;
  position?: string;
};

export type MigrationPlan = {
  total: number;
  needsLegalName: AthleteIdentityRow[];
  needsRegisteredPosition: AthleteIdentityRow[];
  /** Carries neither shape: a human has to decide, because inventing a name is not a repair. */
  unresolvable: AthleteIdentityRow[];
};

export function planAthleteIdentityMigration(rows: AthleteIdentityRow[]): MigrationPlan {
  const needsLegalName = rows.filter((row) => !row.legalName && Boolean(row.name));
  const needsRegisteredPosition = rows.filter((row) => !row.registeredPosition && Boolean(row.position));
  const unresolvable = rows.filter((row) => !row.legalName && !row.name);

  return { total: rows.length, needsLegalName, needsRegisteredPosition, unresolvable };
}

function initialize() {
  if (getApps().length) return getFirestore();
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  initializeApp(raw ? { credential: cert(JSON.parse(raw)) } : { credential: applicationDefault() });
  return getFirestore();
}

async function main() {
  const apply = process.argv.includes('--apply');
  const db = initialize();
  const snapshot = await db.collection('athletes').get();
  const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AthleteIdentityRow);
  const plan = planAthleteIdentityMigration(rows);

  console.log('Athlete identity migration');
  console.log(`Athletes: ${plan.total}`);
  console.log(`Need legalName: ${plan.needsLegalName.length}`);
  console.log(`Need registeredPosition: ${plan.needsRegisteredPosition.length}`);
  console.log(`Cannot be resolved automatically: ${plan.unresolvable.length}`);

  if (plan.unresolvable.length) {
    console.log('\nThese carry no name in either field and are left alone:');
    for (const row of plan.unresolvable.slice(0, 20)) console.log(`  ${row.id}`);
    console.log('Inventing a registered name for an athlete is not a repair. Fix these by hand.');
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to write.');
    return;
  }

  const targets = new Map<string, Record<string, unknown>>();
  for (const row of plan.needsLegalName) {
    targets.set(row.id, { ...(targets.get(row.id) ?? {}), legalName: row.name });
  }
  for (const row of plan.needsRegisteredPosition) {
    targets.set(row.id, { ...(targets.get(row.id) ?? {}), registeredPosition: row.position });
  }

  let written = 0;
  const entries = [...targets.entries()];
  // Batched at 400 rather than Firestore's 500 limit, leaving headroom for the updatedAt
  // field on each write.
  for (let index = 0; index < entries.length; index += 400) {
    const batch = db.batch();
    for (const [id, fields] of entries.slice(index, index + 400)) {
      batch.update(db.collection('athletes').doc(id), { ...fields, updatedAt: FieldValue.serverTimestamp() });
      written += 1;
    }
    await batch.commit();
  }

  console.log(`\nUpdated ${written} athlete documents. Legacy keys left in place.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
