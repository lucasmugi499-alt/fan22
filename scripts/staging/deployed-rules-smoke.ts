/**
 * Verifies the DEPLOYED Firestore rules, using a real client credential.
 *
 * This exists because `staging:role-smoke` cannot do it. That script reads Firestore through
 * `firebase-admin`, which bypasses security rules entirely — it is an excellent check of the
 * API layer's authorization and tells you nothing about the ruleset. After promoting a
 * ruleset, the question "do the deployed rules agree with the app" was unanswerable.
 *
 * Every operation here goes through the client SDK, so every one is subject to whatever is
 * actually live in the project right now.
 *
 * SAFETY: this script is non-mutating by design. Every write it attempts is one it expects
 * to be DENIED, so a passing run changes nothing. Writes are tagged `__rulesSmokeProbe` and,
 * if one unexpectedly succeeds, that is itself the finding — it is reported loudly and the
 * script attempts to remove what it wrote. It creates no accounts. Safe to run against
 * production, which is the point: production is where the answer matters.
 *
 *   npm run rules:smoke -- --project <id> [--email someone@example.com]
 */
import process from 'node:process';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  setDoc,
  updateDoc,
  collection,
  type Firestore,
} from 'firebase/firestore';

type Outcome = { name: string; expected: 'allow' | 'deny'; actual: 'allow' | 'deny'; detail?: string };

function valueAfter(argv: string[], flag: string) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

/**
 * Runs one operation and records whether the rules allowed it.
 *
 * A thrown permission error is the *expected* result for most checks here, so failure to
 * throw is what gets reported — the inverse of a normal test, and worth stating because it
 * is easy to misread this file as a list of things that should work.
 */
async function probe(
  name: string,
  expected: 'allow' | 'deny',
  operation: () => Promise<unknown>,
  cleanup?: () => Promise<unknown>,
): Promise<Outcome> {
  try {
    await operation();
    if (expected === 'deny' && cleanup) {
      // The rules let something through that should not have been. Put it back.
      await cleanup().catch(() => undefined);
    }
    return { name, expected, actual: 'allow' };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const denied = /permission|insufficient/i.test(message);
    return {
      name,
      expected,
      actual: denied ? 'deny' : 'allow',
      detail: denied ? undefined : message,
    };
  }
}

/** Reads that must work, and writes that must not, for any signed-in or anonymous client. */
async function universalChecks(db: Firestore, label: string): Promise<Outcome[]> {
  const probeField = { __rulesSmokeProbe: new Date().toISOString() };
  const results: Outcome[] = [];

  // 1. Payout identity is closed to every client credential, without exception. This is the
  //    check the narrowed catch-all exists to make true.
  results.push(await probe(`${label}: read athletePayees`, 'deny',
    () => getDoc(doc(db, 'athletePayees/any_athlete'))));
  results.push(await probe(`${label}: write athletePayees`, 'deny',
    () => setDoc(doc(db, 'athletePayees/__rules_smoke'), probeField),
    () => deleteDoc(doc(db, 'athletePayees/__rules_smoke'))));

  // 2. A collection nobody modelled starts unreadable rather than super_admin-readable.
  results.push(await probe(`${label}: read unmodelled collection`, 'deny',
    () => getDoc(doc(db, '__rulesSmokeUnmodelled/probe'))));
  results.push(await probe(`${label}: write unmodelled collection`, 'deny',
    () => setDoc(doc(db, '__rulesSmokeUnmodelled/probe'), probeField),
    () => deleteDoc(doc(db, '__rulesSmokeUnmodelled/probe'))));

  // 3. Site settings are public to read — the site renders from them — and writable only
  //    through the audited command.
  results.push(await probe(`${label}: read platformSettings/site`, 'allow',
    () => getDoc(doc(db, 'platformSettings/site'))));
  results.push(await probe(`${label}: write platformSettings/site`, 'deny',
    () => updateDoc(doc(db, 'platformSettings/site'), probeField)));

  // 4. Official sporting data is not client-writable in the promoted ruleset.
  results.push(await probe(`${label}: read a match`, 'allow',
    () => getDocs(query(collection(db, 'matches'), limit(1)))));
  results.push(await probe(`${label}: write a match`, 'deny',
    () => setDoc(doc(db, 'matches/__rules_smoke'), probeField),
    () => deleteDoc(doc(db, 'matches/__rules_smoke'))));

  return results;
}

/** Checks that need a signed-in person: athlete self-editing, and other people's records. */
async function identityChecks(db: Firestore, label: string): Promise<Outcome[]> {
  const results: Outcome[] = [];
  const athletes = await getDocs(query(collection(db, 'athletes'), limit(1))).catch(() => null);
  const athleteId = athletes?.docs[0]?.id;

  if (athleteId) {
    // Athletes are managed profiles. Nobody edits one from a browser, including whoever the
    // profile is about — the club writes the sporting record through an audited command.
    results.push(await probe(`${label}: edit an athlete profile`, 'deny',
      () => updateDoc(doc(db, `athletes/${athleteId}`), { bio: '__rules_smoke probe' })));
  }

  results.push(await probe(`${label}: read another person's user record`, 'deny',
    () => getDoc(doc(db, 'users/__rules_smoke_someone_else'))));

  return results;
}

async function main() {
  const argv = process.argv.slice(2);
  const projectId = valueAfter(argv, '--project')
    ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = valueAfter(argv, '--api-key') ?? process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const databaseId = valueAfter(argv, '--database')
    ?? process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID ?? '(default)';
  const email = valueAfter(argv, '--email');
  const password = valueAfter(argv, '--password')
    ?? process.env.GOALPLACE_STAGING_SMOKE_PASSWORD
    ?? process.env.NEXT_PUBLIC_FIREBASE_DEMO_PASSWORD;

  if (!projectId || !apiKey) {
    throw new Error('A --project and --api-key (or the NEXT_PUBLIC_FIREBASE_* env vars) are required.');
  }

  const app: FirebaseApp = initializeApp({ projectId, apiKey }, `rules-smoke-${Date.now()}`);
  const db = getFirestore(app, databaseId);
  const results: Outcome[] = [];

  console.log(`Verifying deployed rules on ${projectId} (database ${databaseId})\n`);

  results.push(...await universalChecks(db, 'anonymous'));

  if (email && password) {
    await signInWithEmailAndPassword(getAuth(app), email, password);
    console.log(`Signed in as ${email}\n`);
    results.push(...await universalChecks(db, 'signed-in'));
    results.push(...await identityChecks(db, 'signed-in'));
    await signOut(getAuth(app));
  } else {
    // Said out loud rather than skipped silently: a run without a credential cannot check
    // the identity-scoped boundaries, and reporting "all passed" would overstate it.
    console.log('No --email/--password given: identity-scoped checks were NOT run.\n');
  }

  const failures = results.filter((result) => result.actual !== result.expected);
  for (const result of results) {
    const ok = result.actual === result.expected;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${result.name} — expected ${result.expected}, got ${result.actual}${result.detail ? ` (${result.detail})` : ''}`);
  }
  console.log(`\n${results.length - failures.length}/${results.length} checks matched the deployed rules.`);

  await deleteApp(app);
  if (failures.length) {
    console.error(`\n${failures.length} check(s) disagreed with what the deployed rules should say.`);
    process.exitCode = 1;
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
});
