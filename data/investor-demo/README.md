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

## The calendar is applied at seed time

The package is a fixed world dated February to July 2026 and is never edited. Passing
`--rebase-calendar` shifts every timestamp at write time so each league lands mid-season on
the day the seed runs: results up to last weekend, a live matchday pinned to minutes ago, the
next fixtures this coming weekend, fantasy round 3 open. Without the flag the package is
written as dated, which is a calendar that ended months ago and every "Coming up" list empty.
`npm run demo:validate` prints how stale the package is as dated and the shift it would apply.

The seed also writes the world's authority — six league admins, sixty Club Operators
(ADR-005), two platform accounts — as `accessAssignments` and projected `accessIndex`
documents, so nobody needs a second tool before anyone can act.

## Demo reset

The importer binds `--environment` to `config/environments.json`, and the confirmation phrase
carries the environment name. Enter maintenance mode first; the protected controls in
`scripts/demo/data-lifecycle.ts --action=demo-reset` record the request.

```sh
FIREBASE_DEMO_PASSWORD='<shared demo password>' \
npx tsx scripts/seed-investor-demo.ts \
  --environment demo \
  --project manifest-quasar-479416-s7 \
  --database fg256 \
  --rebase-calendar \
  --confirm SEED-GOALPLACE-DEMO \
  --reset \
  --create-auth \
  --execute
```

Leave `--execute` off for a dry run that prints the plan and the counts.

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
