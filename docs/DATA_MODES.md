# Data Modes

GoalPlace256 runs with one data interface and two providers.

## Mock Mode

`NEXT_PUBLIC_DATA_MODE=mock` is the default. It reads from `src/data/mockDatabase.ts` and uses in-memory demo writes for support, pledges, wallet transactions, feed posts, comments, follows, saves, and verification updates. No real payment is created.

Run it with:

```bash
pnpm dev:mock
```

## Firebase Mode

`NEXT_PUBLIC_DATA_MODE=firebase` reads and writes Firestore through the same provider interface. If Firebase public env vars are missing, the app falls back to mock mode instead of crashing.

Run it with:

```bash
pnpm dev:firebase
```

Required public env vars:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
NEXT_PUBLIC_FIREBASE_DATABASE_ID=
NEXT_PUBLIC_FIREBASE_DATABASE_URL=
```

Admin scripts also need either Firebase Admin service account env vars or emulator hosts.

## Seed And Backup

Seed Firestore from the canonical mock database:

```bash
pnpm seed:firebase
```

Seed the local emulator:

```bash
pnpm seed:emulator
```

Export mock JSON:

```bash
pnpm export:mock
```

Back up Firestore collections:

```bash
pnpm backup:firestore
```

Seeded collections: `users`, `sports`, `leagues`, `teams`, `athletes`, `matches`, `challenges`, `supportPledges`, `walletTransactions`, `feedPosts`, `comments`, `sponsors`, `awards`, `verifications`, `reports`, and `notifications`.
