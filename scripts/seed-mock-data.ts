import { adminAuth, adminDb } from '../src/lib/firebase/admin';
import { mockDatabase } from '../src/data/mockDatabase';

async function seedAuth() {
  console.log("Seeding Auth Users...");
  const { users } = mockDatabase;
  let created = 0;
  let updated = 0;

  for (const user of users) {
    try {
      await adminAuth.createUser({
        uid: user.id,
        email: user.email,
        displayName: user.displayName,
        password: "Password123!", // Dummy password for all
      });
      created++;
    } catch (error: any) {
      if (error.code === "auth/email-already-exists" || error.code === "auth/uid-already-exists") {
        await adminAuth.updateUser(user.id, {
          displayName: user.displayName,
        });
        updated++;
      } else {
        console.error(`Failed to create user ${user.id}:`, error.message);
      }
    }
  }

  console.log(`Auth Seed Complete: ${created} created, ${updated} updated.`);
}

async function seedFirestore() {
  console.log("Seeding Firestore Collections...");
  
  const collections = [
    { name: 'users', data: mockDatabase.users },
    { name: 'sports', data: mockDatabase.sports },
    { name: 'leagues', data: mockDatabase.leagues },
    { name: 'teams', data: mockDatabase.teams },
    { name: 'athletes', data: mockDatabase.athletes },
    { name: 'matches', data: mockDatabase.matches },
    { name: 'challenges', data: mockDatabase.challenges },
    { name: 'supportPledges', data: mockDatabase.supportPledges },
    { name: 'walletTransactions', data: mockDatabase.walletTransactions },
    { name: 'feedPosts', data: mockDatabase.feedPosts },
    { name: 'sponsors', data: mockDatabase.sponsors },
    { name: 'awards', data: mockDatabase.awards },
    { name: 'verifications', data: mockDatabase.verifications },
  ];

  for (const collection of collections) {
    const { name, data } = collection;
    if (!data || data.length === 0) continue;

    console.log(`Writing ${data.length} docs to collection '${name}'...`);
    
    // Batch writes (max 500 per batch)
    for (let i = 0; i < data.length; i += 500) {
      const batch = adminDb.batch();
      const chunk = data.slice(i, i + 500);

      for (const item of chunk) {
        const docRef = adminDb.collection(name).doc(item.id);
        batch.set(docRef, item, { merge: true });
      }

      await batch.commit();
    }
  }

  console.log("Firestore Seed Complete!");
}

async function main() {
  try {
    console.log("Starting Data Seed...");
    await seedAuth();
    await seedFirestore();
    console.log("All data successfully seeded to Firebase!");
    process.exit(0);
  } catch (error) {
    console.error("Error during seed:", error);
    process.exit(1);
  }
}

main();
