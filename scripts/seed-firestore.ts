import { adminDb } from '../src/lib/firebase/admin';
import { mockDatabase } from '../src/data/mockDatabase';

type SeedItem = { id: string; [key: string]: unknown };
type SeedCollection = {
  name: string;
  data: SeedItem[];
  documentIdFor: (item: SeedItem) => string;
};

function seedData<T extends { id: string }>(data: T[]): SeedItem[] {
  return data as unknown as SeedItem[];
}

function normalizeSegment(value: unknown, fallback: string) {
  const segment = String(value ?? fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return segment || fallback;
}

function numberedId(prefix: string, counters: Map<string, number>) {
  const next = (counters.get(prefix) ?? 0) + 1;
  counters.set(prefix, next);
  return `${prefix}_${String(next).padStart(3, '0')}`;
}

function stableDocumentId(collectionName: string, item: SeedItem, counters: Map<string, number>) {
  if (collectionName === 'users') {
    return numberedId(`user_${normalizeSegment(item.role, 'member')}`, counters);
  }

  if (collectionName === 'leagues') {
    return numberedId(`league_${normalizeSegment(item.sport, 'sport')}`, counters);
  }

  if (collectionName === 'teams') {
    return numberedId(`team_${normalizeSegment(item.sport, 'sport')}`, counters);
  }

  if (collectionName === 'athletes') {
    return numberedId(`ath_${normalizeSegment(item.sport, 'sport')}`, counters);
  }

  return item.id;
}

function seedCollection(name: string, data: SeedItem[]): SeedCollection {
  const counters = new Map<string, number>();
  const documentIds = new Map<string, string>();

  for (const item of data) {
    documentIds.set(item.id, stableDocumentId(name, item, counters));
  }

  return {
    name,
    data,
    documentIdFor: (item) => documentIds.get(item.id) ?? item.id,
  };
}

export const seedCollections: SeedCollection[] = [
  seedCollection('users', seedData(mockDatabase.users)),
  seedCollection('sports', seedData(mockDatabase.sports)),
  seedCollection('leagues', seedData(mockDatabase.leagues)),
  seedCollection('teams', seedData(mockDatabase.teams)),
  seedCollection('athletes', seedData(mockDatabase.athletes)),
  seedCollection('matches', seedData(mockDatabase.matches)),
  seedCollection('challenges', seedData(mockDatabase.challenges)),
  seedCollection('supportPledges', seedData(mockDatabase.supportPledges)),
  seedCollection('walletTransactions', seedData(mockDatabase.walletTransactions)),
  seedCollection('feedPosts', seedData(mockDatabase.feedPosts)),
  seedCollection('comments', seedData(mockDatabase.comments)),
  seedCollection('sponsors', seedData(mockDatabase.sponsors)),
  seedCollection('awards', seedData(mockDatabase.awards)),
  seedCollection('verifications', seedData(mockDatabase.verifications)),
  seedCollection('reports', seedData(mockDatabase.reports)),
  seedCollection('notifications', seedData(mockDatabase.notifications)),
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
        batch.set(adminDb.collection(collection.name).doc(collection.documentIdFor(item)), firestoreSafe(item), { merge: true });
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
