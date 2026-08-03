import { createHash } from 'node:crypto';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

/**
 * Replaces stored plaintext mini-league invite codes with their hash.
 *
 * A plaintext code is a bearer credential sitting in a readable document. Existing
 * leagues keep working — the hash is derived from the code already stored, so the codes
 * people already hold remain valid — but the plaintext copy is removed so a database
 * read can no longer hand anyone a working code.
 *
 * Dry-run by default.
 *
 *   npx tsx --env-file=.env.local scripts/fantasy/hash-invite-codes.ts --project X --database fg256
 *   ... --apply
 */

const INVITE_CODE_TTL_DAYS = 30;

function inviteCodeHash(code: string) {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

function valueAfter(argv: string[], flag: string) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const projectId = valueAfter(argv, '--project') ?? process.env.FIREBASE_ADMIN_PROJECT_ID;
  const databaseId = valueAfter(argv, '--database') ?? process.env.GOALPLACE_FIRESTORE_DATABASE_ID ?? 'fg256';

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const app = getApps()[0] ?? initializeApp({
    credential: projectId && clientEmail && privateKey
      ? cert({ projectId, clientEmail, privateKey })
      : applicationDefault(),
    projectId,
  });
  const db = getFirestore(app, databaseId);

  const snapshot = await db.collection('fantasyMiniLeagues').get();
  const pending = snapshot.docs.filter((document) => typeof document.data().inviteCode === 'string');

  console.log('GoalPlace256 mini-league invite code hashing');
  console.log(`Source: ${projectId}/${databaseId}`);
  console.log(`Mode: ${apply ? 'APPLY (writes)' : 'dry run (no writes)'}`);
  console.log(`Mini-leagues: ${snapshot.size}`);
  console.log(`Carrying a plaintext code: ${pending.length}`);

  if (!apply || !pending.length) {
    if (pending.length) console.log('Re-run with --apply to hash and remove the plaintext codes.');
    return;
  }

  const expiresAt = new Date(Date.now() + INVITE_CODE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  for (let offset = 0; offset < pending.length; offset += 300) {
    const batch = db.batch();
    for (const document of pending.slice(offset, offset + 300)) {
      const code = String(document.data().inviteCode);
      batch.set(document.ref, {
        inviteCodeHash: inviteCodeHash(code),
        // Existing codes were issued without an expiry; give them one from now rather
        // than leaving them valid forever.
        inviteCodeExpiresAt: document.data().inviteCodeExpiresAt ?? expiresAt,
        inviteCode: FieldValue.delete(),
      }, { merge: true });
    }
    await batch.commit();
  }

  console.log(`Hashed ${pending.length} invite code(s) and removed the plaintext copies.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
