/**
 * Creates the real platform owner account, with its Firestore profile and custom claims.
 *
 * This must be run by a human who supplies the password, and it must be run and verified
 * BEFORE any Authentication cleanup, because production currently has no real administrator:
 * all 200 accounts are seeded fakes and none carry custom claims.
 *
 *   npm run create:owner -- \
 *     --project manifest-quasar-479416-s7 \
 *     --database fg256 \
 *     --env production \
 *     --email you@yourdomain.com \
 *     --name "Your Name" \
 *     --role super_admin
 *
 * The password is read from the OWNER_PASSWORD environment variable so it never appears in
 * shell history or in this file:
 *
 *   OWNER_PASSWORD='...' npm run create:owner -- ...
 *
 * Custom claims are what the security model should ultimately trust, so they are set here
 * rather than relying on the Firestore role field alone.
 */

import { readFileSync } from 'node:fs';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { buildProjectMap, parseArgs, validate, GuardError } from './clean/guards';
import { loadCredentials, createApp, destroyApp } from './clean/app';

const ALLOWED_ROLES = new Set(['platform_admin', 'super_admin']);

async function main() {
  const args = parseArgs(process.argv.slice(2)) as ReturnType<typeof parseArgs> & {
    email?: string;
    name?: string;
    role?: string;
    credentials?: string;
  };

  const aliases = JSON.parse(readFileSync('.firebaserc', 'utf8')).projects ?? {};
  const creds = loadCredentials(args.credentials);
  if (!creds) throw new GuardError('No Admin credentials found for the target project.');

  // Creating a privileged account is sensitive, so it reuses the same project/env guards as
  // the destructive scripts. No confirmation phrase: this creates, it does not delete.
  const plan = validate(args, buildProjectMap(aliases), {
    requireConfirm: false,
    credentialProjectId: creds.projectId,
  });

  const email = args.email;
  const displayName = args.name;
  const role = args.role ?? 'super_admin';
  const password = process.env.OWNER_PASSWORD;

  const problems: string[] = [];
  if (!email) problems.push('--email is required.');
  if (!displayName) problems.push('--name is required.');
  if (!ALLOWED_ROLES.has(role)) problems.push(`--role must be one of: ${[...ALLOWED_ROLES].join(', ')}`);
  if (!password) problems.push('OWNER_PASSWORD environment variable is required (never pass it as a flag).');
  if (password && password.length < 12) problems.push('OWNER_PASSWORD must be at least 12 characters.');
  if (problems.length) throw new GuardError(problems.join('\n'));

  const app = createApp(creds, `create-owner-${Date.now()}`);
  try {
    const auth = getAuth(app);
    const db = getFirestore(app, plan.databaseId);

    let uid: string;
    try {
      const existing = await auth.getUserByEmail(email as string);
      uid = existing.uid;
      console.log(`Account already exists for ${email} (${uid}); updating instead of creating.`);
      await auth.updateUser(uid, { displayName, emailVerified: true });
    } catch {
      const created = await auth.createUser({
        email: email as string,
        password,
        displayName,
        emailVerified: true,
      });
      uid = created.uid;
      console.log(`Created Authentication account ${uid}`);
    }

    // Custom claims are the trusted authority for elevated roles.
    await auth.setCustomUserClaims(uid, { role });
    console.log(`Set custom claim role=${role}`);

    // The Firestore profile id must equal the Auth uid.
    await db.collection('users').doc(uid).set(
      {
        uid,
        email,
        displayName,
        role,
        status: 'active',
        emailVerified: true,
        country: 'Uganda',
        teamIds: [],
        leagueIds: [],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    console.log(`Wrote users/${uid}`);

    console.log('\nNext steps, all of which must pass before any Auth cleanup:');
    console.log(`  1. Sign in at /login as ${email}`);
    console.log('  2. Confirm /admin loads');
    console.log('  3. Sign out and confirm /admin redirects to /login');
    console.log(`  4. Record this UID for the reset preserve list: ${uid}`);
    console.log(`\n  npm run clean:preview -- --project ${plan.projectId} --database ${plan.databaseId} --env ${plan.environment} --preserve ${uid}`);
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
