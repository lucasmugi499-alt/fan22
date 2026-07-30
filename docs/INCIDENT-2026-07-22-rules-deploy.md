# Incident: unreviewed Firestore rules deployed to production

**Date:** 2026-07-22
**Severity:** Low impact, high process significance
**Status:** Rolled back and verified

## Summary

An untested Firestore security ruleset was deployed to the production project while
verifying whether a bare `firebase deploy` would fail safe. It did not fail safe — it
deployed. The change was rolled back the same session, before any data existed in the
affected collections.

## Timeline

| | |
|---|---|
| Deployed commit | `ae340b6` (working tree, `firestore` config converted to array form) |
| Deployed by | `firebase deploy --only firestore:fg256` — **no `--project` flag** |
| Affected project | `manifest-quasar-479416-s7` (production, tagged `Prod`) |
| Affected database | `fg256` (named, not `(default)`) |
| Detected | Immediately, on the follow-up run reporting *"already up to date, skipping upload"* |
| Rollback commit | rules restored from `593706a`, the last commit before any of this work |
| Rollback command | `firebase deploy --project manifest-quasar-479416-s7 --only firestore:fg256` |
| Functions deployed | **No.** No functions were deployed at any point. |

## Cause

`.firebaserc` had been reduced to a single `prod` alias on the assumption that removing
`default` would force explicit project selection. That assumption was wrong: with exactly
one alias defined, the Firebase CLI resolves it implicitly, so a bare deploy targeted
production.

Verified afterwards: with **two** aliases defined, the same command fails with
`Error: No project active, but project aliases are available.` One alias is not a guard;
two are.

## Impact

The deployed ruleset added access to two collections and changed nothing else.

- `seasons` — from super-admin-only (via the catch-all) to publicly readable, writable by
  the owning league's admins.
- `resultSubmissions` and its `events` subcollection — same transition.
- Five helper functions, which grant no access on their own.

Verified by block-level comparison against the baseline: **every pre-existing collection
rule was byte-identical** — `users`, `athletes`, `teams`, `leagues`, `matches`,
`challenges`, `supportPledges`, `walletTransactions`, `notifications`, `sponsors`,
`awards`, `verifications`, `reports`, `adminLogs`, `comments`, `feedPosts`, `sports`. The
`match /{document=**}` catch-all was unchanged.

Confirmed empty in production before rollback, via the Admin SDK against `fg256`:

```
seasons              0 document(s)
resultSubmissions    0 document(s)
finalizations        0 document(s)
events (group)       0 document(s)
versions (group)     0 document(s)
--- control ---
leagues              has data
matches              has data
```

The control reads confirm the check ran against the correct database rather than an empty
one. No documents existed under the widened rules at any point, and no application code
reads or writes those collections yet.

## Resolution

1. Confirmed all affected collections empty (above).
2. Restored `firestore.rules` from `593706a` — verified byte-identical to the baseline.
3. Deployed with an explicit project id, firestore only.
4. Confirmed rollback by re-running the deploy: *"latest version of firestore.rules already
   up to date, skipping upload"* proves the live ruleset matches the local baseline.

## Preventive measures

- **`.firebaserc` now defines two aliases** (`staging`, `prod`), which removes the implicit
  fallback. A bare deploy refuses. Verified.
- **`firebase.json` now references `firestore.rules.next`.** The candidate authorization
  matrix has passed behavioral tests and is the normal deploy target.
- **The rules suite targets `firestore.rules.next` plus `storage.rules`**, so both database
  and media authorization boundaries stay under test before deployment.

## What compilation did and did not prove

`✔ cloud.firestore: rules file firestore.rules compiled successfully` was returned for the
new matrix. That is genuine server-side syntactic and semantic validation, and it closes
the "never compiled" gap.

It proves nothing about behaviour. No allow/deny path was exercised. The negative
assertions that matter — that no client can write `official`, that a team admin cannot
write the match record, that the audit trail is append-only — remain unverified until
`npm run test:rules` passes against the emulators.

## Re-promotion criteria

The matrix returns to production only after all of:

1. A JDK is installed and `npm run test:rules` passes against `firestore.rules.next` and
   `storage.rules`.
2. A staging project exists with a named `fg256` database and the alias is filled in.
3. The full Team Admin A → Team Admin B → finalizer → standings workflow runs in staging,
   including duplicate-trigger and stale-version cases.
4. Deployed with an explicit `--project`.

## Follow-up: 2026-07-26

- A JDK is required for local and CI rules verification.
- `npm run test:rules` passes the Firestore and Storage emulator suites.
- The active rules include focused profile, assignment, official-result integrity, and
  scoped-media authorization tests.
- The staging project and named `fg256` database now exist.
- The candidate matrix is deployed to staging only through `firebase.staging.json`.
- The Team and League Admin interfaces now persist the submission workflow, and App Hosting
  provides trusted finalization while staging remains on Spark.
- The full two-team submission, trusted finalizer, duplicate-trigger, stale-version, and
  standings workflow still requires hosted staging evidence before production activation.
