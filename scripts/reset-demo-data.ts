import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { seedDemoData } from './seed-demo.ts';

const collections = [
  'users',
  'athletes',
  'teams',
  'leagues',
  'matches',
  'challenges',
  'supportPledges',
  'walletTransactions',
  'feedPosts',
  'comments',
  'notifications',
  'sponsors',
  'awards',
  'verifications',
  'reports',
  'adminLogs',
];

function credential() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return cert({ projectId, clientEmail, privateKey });
  }

  return applicationDefault();
}

function initAdmin() {
  if (getApps().length > 0) return;
  initializeApp({
    credential: credential(),
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

async function deleteCollection(name: string) {
  const db = getFirestore();
  const snapshot = await db.collection(name).get();

  for (let index = 0; index < snapshot.docs.length; index += 400) {
    const batch = db.batch();
    for (const document of snapshot.docs.slice(index, index + 400)) {
      batch.delete(document.ref);
    }
    await batch.commit();
  }
}

async function main() {
  initAdmin();
  for (const collection of collections) {
    await deleteCollection(collection);
  }
  await seedDemoData();
  console.log('GoalPlace256 demo data reset complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
