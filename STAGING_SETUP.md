# STAGING_SETUP

Staging must exist before production is touched. The `staging` alias in `.firebaserc` is
currently the placeholder `REPLACE-WITH-STAGING-PROJECT-ID`, and the cleanup guards ignore that
placeholder so it can never be targeted by accident.

These steps need your Google account and billing, so they are yours to run.

## 1. Create the project

```bash
npx firebase projects:create goalplace256-staging --display-name "GoalPlace256 Staging"
```

Or create it in the Firebase console. Record the real project ID; it may differ from the name
you requested if that ID is taken.

## 2. Create the named database

The database must be named `fg256`, not `(default)`, to match production.

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

## 4. Point the alias at it

Replace the placeholder in `.firebaserc`:

```json
{
  "projects": {
    "staging": "<STAGING_ID>",
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
npm run clean:preview -- --project <STAGING_ID> --database fg256 --env staging \
  --credentials ~/.secrets/goalplace-staging-sa.json
```

## 6. Deploy rules and functions to staging

```bash
GOALPLACE_STAGING_PROJECT=<STAGING_ID> npm run deploy:staging
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
npm run clean:preview -- --project <STAGING_ID> --database fg256 --env staging \
  --credentials ~/.secrets/goalplace-staging-sa.json
```

An empty staging project should report zero documents and zero accounts. Seeing production's
658 documents means the credentials or the alias are wrong: stop and fix that before going
further.
