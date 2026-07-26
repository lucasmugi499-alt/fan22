# GoalPlace256 investor demo data

This directory contains the canonical synthetic dataset used by the isolated staging
environment.

Every league, team, athlete, sponsor, fixture, result, pledge, report, and account is
fictional. The data may be used for product demonstrations and testing, but it must never
be presented as live traction or as an official historical record.

## Contents

- `database.json`: Firestore collections for the complete demonstration network.
- `demo-accounts.json`: staging account identities and roles. Passwords are deliberately
  excluded and must be supplied through `FIREBASE_DEMO_PASSWORD` when seeding.
- `public/demo/assets/`: synthetic league, team, and avatar SVG assets referenced by the
  database records.

## Staging seed

Preview and validate without credentials:

```sh
npx tsx scripts/seed-investor-demo.ts \
  --project studio-534174814-9df36 \
  --database fg256
```

Execute a full staging replacement:

```sh
FIREBASE_DEMO_PASSWORD='<staging password>' \
npx tsx scripts/seed-investor-demo.ts \
  --project studio-534174814-9df36 \
  --database fg256 \
  --confirm SEED-GOALPLACE-STAGING \
  --reset \
  --create-auth \
  --execute
```

The execute path verifies the staging alias, exports Auth, backs up Firestore, recursively
clears the staging database, writes the canonical collections, replaces staging Auth users,
and verifies all resulting counts.
