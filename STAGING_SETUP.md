# STAGING_SETUP

Staging must exist before production is touched.

Status on 2026-07-26:

- Project exists: `studio-534174814-9df36`
- Named database exists: `fg256` in `nam5`
- `.firebaserc` points `staging` at `studio-534174814-9df36`
- Staging Web app exists: `1:1022620974291:web:a492881a24b43e450fe826`
- Safety guard verified: a staging preview using the production Admin credentials in
  `.env.local` is refused with a credential mismatch

Still needed before any staging reset rehearsal:

- Download a staging Admin service-account key to a path outside the repository
- Verify Email/Password Authentication is enabled in the staging console
- Verify or create the staging Storage bucket
- Run a staging preview with the staging service-account key
- Create and verify a staging owner account, then rehearse the reset

## 1. Create the project

Done: `studio-534174814-9df36`.

```bash
npx firebase projects:create goalplace256-staging --display-name "GoalPlace256 Staging"
```

Or create it in the Firebase console. Record the real project ID; it may differ from the name
you requested if that ID is taken.

## 2. Create the named database

The database must be named `fg256`, not `(default)`, to match production.

Done and verified:

```text
projects/studio-534174814-9df36/databases/fg256
```

```bash
npx firebase firestore:databases:create fg256 \
  --project <STAGING_ID> \
  --location nam5
```

## 3. Enable the services

In the Firebase console for the staging project:

- Authentication → enable Email/Password
- Storage → create a bucket
- Firestore → confirm `fg256` exists

Firestore is confirmed. Authentication and Storage still need console verification.

## 4. Point the alias at it

Done. `.firebaserc` now contains:

```json
{
  "projects": {
    "staging": "studio-534174814-9df36",
    "prod": "manifest-quasar-479416-s7"
  }
}
```

The guards read this file to decide which environment a project belongs to, so a wrong value
here is a real risk. Double-check it.

## 5. Get staging credentials

Console → Project settings → Service accounts → Generate new private key.

Save it **outside this repository** (for example `~/.secrets/goalplace-staging-sa.json`).
`*-sa.json` and `service-account*.json` are gitignored, but keeping keys out of the repo
entirely is safer.

Pass it explicitly so staging commands never fall back to the production credentials in
`.env.local`:

```bash
npm run clean:preview -- --project studio-534174814-9df36 --database fg256 --env staging \
  --credentials ~/.secrets/goalplace-staging-sa.json
```

This remains the current blocker. Without the staging key, the guard correctly refuses to use
the production credentials from `.env.local`.

## 6. Deploy rules and functions to staging

```bash
GOALPLACE_STAGING_PROJECT=studio-534174814-9df36 npm run deploy:staging
```

Note that `firebase.json` deploys `firestore.rules`, while the season and result-submission
rules live in `firestore.rules.next` and have never been promoted. Decide deliberately which
file staging should carry, and validate with the emulator before promoting anything:

```bash
npm run test:rules
```

The rules emulator needs Java. Install it first if `test:rules` fails to start.

## 7. Verify

```bash
npm run clean:preview -- --project studio-534174814-9df36 --database fg256 --env staging \
  --credentials ~/.secrets/goalplace-staging-sa.json
```

An empty staging project should report zero documents and zero accounts. Seeing production's
658 documents means the credentials or the alias are wrong: stop and fix that before going
further.
