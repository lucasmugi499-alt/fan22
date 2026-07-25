/**
 * Read-only discovery of what a reset would touch.
 *
 * Nothing here writes. Collections are discovered from the live database with
 * `listCollections()` rather than a hardcoded list, because the previous reset script covered
 * 16 collections while the security rules already referenced 18 and the new schema adds more
 * again. A hardcoded list silently orphans data.
 */

import type { App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

export interface CollectionCount {
  path: string;
  documents: number;
  /** Subcollection paths discovered beneath this collection's documents. */
  subcollections: string[];
}

export interface AuthUserSummary {
  uid: string;
  email: string | null;
  disabled: boolean;
  claims: Record<string, unknown>;
  hasFirestoreProfile: boolean;
  role: string | null;
  preserved: boolean;
}

export interface StorageFolderSummary {
  prefix: string;
  objects: number;
  bytes: number;
}

export interface Inventory {
  projectId: string;
  databaseId: string;
  environment: string;
  takenAt: string;
  collections: CollectionCount[];
  totalDocuments: number;
  authUsers: AuthUserSummary[];
  orphanAuthUsers: string[];
  orphanFirestoreProfiles: string[];
  storage: StorageFolderSummary[];
  storageObjects: number;
  warnings: string[];
}

/** Walks a collection, counting documents and recording any subcollections found. */
async function walkCollection(
  db: ReturnType<typeof getFirestore>,
  path: string,
  warnings: string[]
): Promise<CollectionCount> {
  const found = new Set<string>();
  let documents = 0;

  try {
    const snapshot = await db.collection(path).get();
    documents = snapshot.size;

    // Subcollections are per-document in Firestore, so sample rather than scan everything:
    // a full scan of a large collection is slow and this is an inventory, not a migration.
    const sample = snapshot.docs.slice(0, 25);
    for (const doc of sample) {
      const subs = await doc.ref.listCollections();
      for (const sub of subs) found.add(`${path}/{id}/${sub.id}`);
    }
    if (snapshot.size > sample.length) {
      warnings.push(
        `${path}: sampled ${sample.length} of ${snapshot.size} documents for subcollection ` +
          'discovery. Deletion is recursive regardless.'
      );
    }
  } catch (cause) {
    warnings.push(`${path}: could not be read (${(cause as Error).message}).`);
  }

  return { path, documents, subcollections: [...found].sort() };
}

export async function buildInventory(
  app: App,
  opts: { projectId: string; databaseId: string; environment: string; preserveUids: string[] }
): Promise<Inventory> {
  const warnings: string[] = [];
  const db = getFirestore(app, opts.databaseId);
  const auth = getAuth(app);

  // --- Firestore -----------------------------------------------------------------
  const rootCollections = await db.listCollections();
  const collections: CollectionCount[] = [];
  for (const ref of rootCollections) {
    collections.push(await walkCollection(db, ref.id, warnings));
  }
  collections.sort((a, b) => a.path.localeCompare(b.path));
  const totalDocuments = collections.reduce((sum, c) => sum + c.documents, 0);

  // --- Firestore user profiles (to correlate with Auth) --------------------------
  const profileRoles = new Map<string, string | null>();
  if (rootCollections.some((c) => c.id === 'users')) {
    const users = await db.collection('users').get();
    for (const doc of users.docs) {
      profileRoles.set(doc.id, (doc.data().role as string) ?? null);
    }
  }

  // --- Firebase Authentication ---------------------------------------------------
  // Auth accounts are a separate system from users/{uid}: deleting the document does not
  // delete the login. Both are reported independently so neither is missed.
  const authUsers: AuthUserSummary[] = [];
  const preserve = new Set(opts.preserveUids);
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      authUsers.push({
        uid: user.uid,
        email: user.email ?? null,
        disabled: user.disabled,
        claims: user.customClaims ?? {},
        hasFirestoreProfile: profileRoles.has(user.uid),
        role: profileRoles.get(user.uid) ?? null,
        preserved: preserve.has(user.uid),
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);

  const authUids = new Set(authUsers.map((u) => u.uid));
  const orphanAuthUsers = authUsers.filter((u) => !u.hasFirestoreProfile).map((u) => u.uid);
  const orphanFirestoreProfiles = [...profileRoles.keys()].filter((uid) => !authUids.has(uid));

  // --- Storage -------------------------------------------------------------------
  const storage: StorageFolderSummary[] = [];
  let storageObjects = 0;
  try {
    const bucket = getStorage(app).bucket();
    const [files] = await bucket.getFiles();
    const byPrefix = new Map<string, { objects: number; bytes: number }>();
    for (const file of files) {
      const prefix = file.name.split('/')[0] || '(root)';
      const entry = byPrefix.get(prefix) ?? { objects: 0, bytes: 0 };
      entry.objects += 1;
      entry.bytes += Number(file.metadata.size ?? 0);
      byPrefix.set(prefix, entry);
      storageObjects += 1;
    }
    for (const [prefix, v] of byPrefix) storage.push({ prefix, ...v });
    storage.sort((a, b) => a.prefix.localeCompare(b.prefix));
  } catch (cause) {
    warnings.push(`Storage could not be inventoried (${(cause as Error).message}).`);
  }

  // --- Integrity warnings --------------------------------------------------------
  const admins = authUsers.filter(
    (u) => u.claims.role === 'platform_admin' || u.claims.role === 'super_admin' || u.role === 'platform_admin' || u.role === 'super_admin'
  );
  if (admins.length === 0) {
    warnings.push('No platform_admin or super_admin account was found. Create and verify one BEFORE deleting accounts.');
  }
  const survivingAdmins = admins.filter((u) => u.preserved);
  if (admins.length > 0 && survivingAdmins.length === 0) {
    warnings.push(
      `${admins.length} admin account(s) exist but none are in --preserve. Deleting every admin ` +
        'would lock you out of the platform.'
    );
  }
  if (orphanFirestoreProfiles.length) {
    warnings.push(`${orphanFirestoreProfiles.length} users/{uid} document(s) have no Auth account.`);
  }
  if (orphanAuthUsers.length) {
    warnings.push(`${orphanAuthUsers.length} Auth account(s) have no users/{uid} document.`);
  }

  return {
    projectId: opts.projectId,
    databaseId: opts.databaseId,
    environment: opts.environment,
    takenAt: new Date().toISOString(),
    collections,
    totalDocuments,
    authUsers,
    orphanAuthUsers,
    orphanFirestoreProfiles,
    storage,
    storageObjects,
    warnings,
  };
}

/** Human-readable report body, shared by the preview and execute scripts. */
export function renderInventory(inv: Inventory): string {
  const lines: string[] = [];
  const pad = (s: string, n: number) => s.padEnd(n);

  lines.push(`Project      : ${inv.projectId}`);
  lines.push(`Database     : ${inv.databaseId}`);
  lines.push(`Environment  : ${inv.environment.toUpperCase()}`);
  lines.push(`Taken at     : ${inv.takenAt}`);
  lines.push('');
  lines.push('FIRESTORE');
  if (inv.collections.length === 0) {
    lines.push('  (no root collections found)');
  } else {
    lines.push(`  ${pad('COLLECTION', 26)}DOCUMENTS`);
    for (const c of inv.collections) {
      lines.push(`  ${pad(c.path, 26)}${String(c.documents).padStart(9)}`);
      for (const sub of c.subcollections) lines.push(`    subcollection: ${sub}`);
    }
  }
  lines.push(`  TOTAL DOCUMENTS: ${inv.totalDocuments}`);
  lines.push('');
  lines.push('FIREBASE AUTHENTICATION');
  lines.push(`  Accounts total   : ${inv.authUsers.length}`);
  lines.push(`  To preserve      : ${inv.authUsers.filter((u) => u.preserved).length}`);
  lines.push(`  To delete        : ${inv.authUsers.filter((u) => !u.preserved).length}`);
  for (const u of inv.authUsers) {
    const flags = [
      u.preserved ? 'PRESERVE' : 'delete',
      u.role ?? (u.hasFirestoreProfile ? 'no-role' : 'no-profile'),
      u.disabled ? 'disabled' : '',
    ].filter(Boolean).join(' · ');
    lines.push(`    ${pad(u.email ?? '(no email)', 40)} ${pad(u.uid, 30)} ${flags}`);
  }
  lines.push('');
  lines.push('STORAGE');
  if (inv.storage.length === 0) lines.push('  (no objects found)');
  for (const s of inv.storage) {
    lines.push(`  ${pad(s.prefix, 26)}${String(s.objects).padStart(6)} objects  ${(s.bytes / 1024 / 1024).toFixed(2)} MB`);
  }
  lines.push(`  TOTAL OBJECTS: ${inv.storageObjects}`);
  if (inv.warnings.length) {
    lines.push('');
    lines.push('WARNINGS');
    for (const w of inv.warnings) lines.push(`  - ${w}`);
  }
  return lines.join('\n');
}
