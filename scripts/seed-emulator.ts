process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= '127.0.0.1:9199';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||= 'goalplace256-demo';

const { seedFirestoreFromMock } = await import('./seed-firestore');

seedFirestoreFromMock()
  .then(() => {
    console.log('Firestore emulator seed complete.');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('Firestore emulator seed failed:', error);
    process.exit(1);
  });

export {};
