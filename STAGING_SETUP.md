# STAGING_SETUP

Staging must exist before production is touched.

Status on 2026-07-26:

- Project exists: `studio-534174814-9df36`
- Named database exists: `fg256` in `nam5`
- `.firebaserc` points `staging` at `studio-534174814-9df36`
- Staging Web app exists: `1:1022620974291:web:a492881a24b43e450fe826`
- Candidate rules from `firestore.rules.next` are deployed to staging only
- The App Hosting managed identity has `roles/datastore.user` on staging so the
  authenticated server finalizer can transact against `fg256` without a downloaded key
- Safety guard verified: a staging preview using the production Admin credentials in
  `.env.local` is refused with a credential mismatch

Still needed:

- Verify or create the staging Storage bucket
- Re-run the investor seed after the daily Firestore quota resets so
  `resultSubmissionEvents` move into their nested subcollections
- Run the two-team submit → confirm → trusted finalizer smoke test

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

This key is still useful for destructive reset rehearsals. It is not used by the hosted
application: App Hosting uses its managed runtime identity and no private key is committed.

## 6. Deploy rules and functions to staging

```bash
npm run deploy:staging
```

Every firebase config in this repo — `firebase.json`, `firebase.staging.json` and
`firebase.production-candidate.json` — deploys `firestore.rules.next`. That ruleset was
promoted to staging and production on 2026-08-22; `firestore.rules` is the superseded
baseline, kept as a rollback artifact and deployed by nothing.

```bash
npm run test:rules
```

The project-local JDK under `.tools/` can run the suite. Cloud Functions remain optional
until staging moves to Blaze:

```bash
npm run deploy:staging:functions
```

On Spark, trusted finalization runs through the authenticated App Hosting route instead.

## 7. Verify

```bash
npm run clean:preview -- --project studio-534174814-9df36 --database fg256 --env staging \
  --credentials ~/.secrets/goalplace-staging-sa.json
```

An empty staging project should report zero documents and zero accounts. Seeing production's
658 documents means the credentials or the alias are wrong: stop and fix that before going
further.
