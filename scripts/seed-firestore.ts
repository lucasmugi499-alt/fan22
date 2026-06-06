import { adminDb } from '../src/lib/firebase/admin';
import { mockDatabase } from '../src/data/mockDatabase';

type SeedItem = { id: string; [key: string]: unknown };
type SeedCollection = { name: string; data: SeedItem[] };

function seedData<T extends { id: string }>(data: T[]): SeedItem[] {
  return data as unknown as SeedItem[];
}

export const seedCollections: SeedCollection[] = [
  { name: 'users', data: seedData(mockDatabase.users) },
  { name: 'sports', data: seedData(mockDatabase.sports) },
  { name: 'leagues', data: seedData(mockDatabase.leagues) },
  { name: 'teams', data: seedData(mockDatabase.teams) },
  { name: 'athletes', data: seedData(mockDatabase.athletes) },
  { name: 'matches', data: seedData(mockDatabase.matches) },
  { name: 'challenges', data: seedData(mockDatabase.challenges) },
  { name: 'supportPledges', data: seedData(mockDatabase.supportPledges) },
  { name: 'walletTransactions', data: seedData(mockDatabase.walletTransactions) },
  { name: 'feedPosts', data: seedData(mockDatabase.feedPosts) },
  { name: 'comments', data: seedData(mockDatabase.comments) },
  { name: 'sponsors', data: seedData(mockDatabase.sponsors) },
  { name: 'awards', data: seedData(mockDatabase.awards) },
  { name: 'verifications', data: seedData(mockDatabase.verifications) },
  { name: 'reports', data: seedData(mockDatabase.reports) },
  { name: 'notifications', data: seedData(mockDatabase.notifications) },
];

function firestoreSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function seedFirestoreFromMock() {
  console.log('Seeding Firestore from src/data/mockDatabase.ts...');

  for (const collection of seedCollections) {
    if (!collection.data.length) continue;
    console.log(`Writing ${collection.data.length} ${collection.name} docs`);

    for (let index = 0; index < collection.data.length; index += 500) {
      const batch = adminDb.batch();
      const chunk = collection.data.slice(index, index + 500);

      for (const item of chunk) {
        batch.set(adminDb.collection(collection.name).doc(item.id), firestoreSafe(item), { merge: true });
      }

      await batch.commit();
    }
  }

  console.log('Firestore seed complete.');
}

async function main() {
  try {
    await seedFirestoreFromMock();
    process.exit(0);
  } catch (error) {
    console.error('Firestore seed failed:', error);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('seed-firestore.ts')) {
  main();
}
