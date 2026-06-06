# Data Modes

GoalPlace256 runs through one data provider interface with mock, Firebase, and local emulator workflows.

## Mock Mode

`NEXT_PUBLIC_DATA_MODE=mock` is the default. It reads from `src/data/mockDatabase.ts` and uses in-memory demo writes for support, pledges, wallet transactions, feed posts, comments, follows, saves, and verification updates. No real payment is created.

Run it with:

```bash
pnpm dev:mock
```

Mock mode must not require Firebase environment variables.

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

Only the `NEXT_PUBLIC_` Firebase config belongs in browser code. Do not commit Firebase Admin service-account JSON, private keys, refresh tokens, `.env.local`, or any other server secret.

Admin scripts also need Firebase Admin service account env vars, or emulator hosts when seeding locally.

## Emulator Mode

The emulator uses the same mock seed source but writes to local Firebase emulators. Start the emulators in another terminal, then seed with:

```bash
pnpm seed:emulator
```

Typical emulator env vars:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
```

## Seed And Backup

Seed Firestore from the canonical mock database:

```bash
pnpm seed:firebase
```

The Firestore seed uses `src/data/mockDatabase.ts` as the central source and writes deterministic document IDs for core collections, including:

```text
users/user_fan_001
athletes/ath_football_001
teams/team_football_001
leagues/league_football_001
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
