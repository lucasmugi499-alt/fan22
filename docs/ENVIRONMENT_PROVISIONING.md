# Provisioning beta and production

**Status: beta is part-provisioned; production has no project.** The beta Firebase project
exists and its web config is wired in — see the section below for exactly what is done and what
is still owed. Production is still a `REPLACE_WITH_` placeholder.

Every remaining `REPLACE_WITH_` marker is a real blocker, and no amount of code closes them:
they need a Google account with billing and console access, which is why this is a runbook
rather than a script.

---

## Beta status — 30 August 2026

The beta Firebase project **exists**: `goalplace256-beta`. Its web app is registered and its
config is wired into the repo, so the repo side of steps 1, 3 and 4 is done for beta.

| Wired | Value |
|---|---|
| `.firebaserc` beta alias | `goalplace256-beta` |
| `config/environments.json` | `firebaseProjectId: goalplace256-beta` |
| Web API key, auth domain, project id, storage bucket, sender id, app id | filled in `apphosting.beta.yaml` |

`npm run environment:prepare:beta` **still refuses**, by design, on three placeholders:

| Placeholder | What produces it | Step |
|---|---|---|
| `REPLACE_WITH_BETA_APP_CHECK_SITE_KEY` | the reCAPTCHA site key from registering App Check on the beta web app | 6 |
| `REPLACE_WITH_BETA_SCHEDULER_AUDIENCE` | the App Hosting backend origin, so the backend has to exist first | 7, 9 |
| `REPLACE_WITH_BETA_SCHEDULER_SERVICE_ACCOUNT` | the scheduler service account email | 7 |

**Unverified from this repo.** The credentials in `.env.local` belong to the demo project and
are refused by beta with a 403, so none of the following has been confirmed and all of it is
still owed:

- that the **named `fg256` database** exists in beta (step 2). This is the one most likely to
  be missed and the most expensive to miss: nothing fails loudly, scripts just read an empty
  `(default)` and report success.
- that the storage bucket exists and rules are deployed to it;
- that an App Hosting backend exists for beta;
- that Firestore rules and indexes have been deployed to beta.

Beta is now a first-class environment in the destructive-command guards, so
`backup:firestore --project goalplace256-beta --env beta` works and the seed commands accept
`--confirm SEED-GOALPLACE-BETA`. Both were previously refused outright, which is how an
environment ends up with no backups.

Nothing has been deployed to or seeded into beta from here.

## What is already true

The environment architecture is built and the guards are live. What is missing is the two
projects the architecture describes.

| Piece | State |
|---|---|
| `apphosting.beta.yaml`, `apphosting.production.yaml` | Written, complete in shape, **10 placeholder lines each** |
| `config/environments.json` | Registry written, **2 placeholders** |
| `.firebaserc` | `beta` and `production` aliases declared, **both placeholders** |
| Readiness gate | `environment:prepare:beta` refuses on any `REPLACE_WITH_` marker |
| Deploy preflight | `deploy:preflight` refuses a target that disagrees with the registry |
| Build gate | The un-overlaid `apphosting.yaml` declares `unconfigured` and fails the build |

The guards mean a half-finished provisioning cannot ship. They do not do the provisioning.

---

## Order of work

Do these in order. Each step's output is the next step's input, and doing them out of order is
how a project id ends up in one file and not another.

### 0. Back up demo

Before anything else. Demo is 1,308 users and 540 sport-correct matches built by hand, and it
is not reproducible. Demo is never destroyed to launch beta — they are different projects, which
is the whole point — but a verified export with a tested restore costs an hour and removes the
question entirely.

```bash
npm run backup:firestore
```

### 1. Create the two Firebase projects

```bash
firebase projects:create goalplace256-beta --display-name "GoalPlace256 Beta"
```

```bash
firebase projects:create goalplace-prod --display-name "GoalPlace256"
```

Separate projects, not separate databases in one project. That separation is the entire
isolation story: separate auth, separate storage, separate functions, separate rules. Nothing
beta does can reach demo because they are different projects, and no configuration mistake can
change that.

Enable billing on both before the next step — App Hosting and Cloud Functions require it.

### 2. Create the named Firestore database in each

Every GoalPlace environment stores data in a **named** database, `fg256`. There is no
`(default)` database on the demo project and there must not be one here: `getFirestore()` with
no id asks for `(default)`, and a script that does so on a project that HAS an empty default
gets zero rows back and reports success. `scripts/lib/firestoreTarget.ts` documents that
failure at length.

```bash
firebase firestore:databases:create fg256 --project goalplace256-beta --location nam5
```

```bash
firebase firestore:databases:create fg256 --project goalplace-prod --location nam5
```

### 3. Register a web app in each, and read back its config

```bash
firebase apps:create WEB "GoalPlace256 Beta" --project goalplace256-beta
```

```bash
firebase apps:sdkconfig WEB --project goalplace256-beta
```

That output supplies five of the placeholders. Repeat for production.

### 4. Fill the placeholders

There are **24 value lines** across four files — 9 distinct values per environment, since the
project id appears twice in each overlay. `environment:prepare:beta` names any you miss, so run
it after each file rather than at the end.

**`apphosting.beta.yaml`** — 10 lines, 9 distinct values:

| Placeholder | Source |
|---|---|
| `REPLACE_WITH_BETA_WEB_API_KEY` | step 3 `apiKey` |
| `REPLACE_WITH_BETA_AUTH_DOMAIN` | step 3 `authDomain` |
| `REPLACE_WITH_BETA_PROJECT_ID` | `goalplace256-beta` (appears **twice** — public and admin) |
| `REPLACE_WITH_BETA_STORAGE_BUCKET` | step 3 `storageBucket` |
| `REPLACE_WITH_BETA_SENDER_ID` | step 3 `messagingSenderId` |
| `REPLACE_WITH_BETA_APP_ID` | step 3 `appId` |
| `REPLACE_WITH_BETA_APP_CHECK_SITE_KEY` | reCAPTCHA Enterprise key, step 6 |
| `REPLACE_WITH_BETA_SCHEDULER_AUDIENCE` | the App Hosting origin, step 7 |
| `REPLACE_WITH_BETA_SCHEDULER_SERVICE_ACCOUNT` | the scheduler service account email, step 7 |

**`apphosting.production.yaml`** — the same nine, production values.

**`config/environments.json`** — `beta.firebaseProjectId` and
`production.firebaseProjectId`.

**`.firebaserc`** — the `beta` and `production` aliases. The deploy preflight resolves
`--project beta` through this file and refuses if the result disagrees with the registry, so
these two must match `config/environments.json` exactly.

### 5. Declare the secrets

App Hosting reads these from Secret Manager, not from the config file.

```bash
firebase apphosting:secrets:set resendApiKey --project goalplace256-beta
```

```bash
firebase apphosting:secrets:set goalplaceFantasyScoringSecret --project goalplace256-beta
```

Also declare `GOALPLACE_RECONCILIATION_SECRET`, which is currently declared on the **calling**
side only — `functions/src/index.ts` binds it with `defineSecret`, and no App Hosting overlay
supplies it to the route that checks it. Half a shared credential. `/api/environment` now
reports which scheduler routes cannot authenticate, so read it back after deploying rather
than assuming.

### 6. App Check

Beta and production both set `GOALPLACE_REQUIRE_APP_CHECK: "true"`; demo has it off. **Beta
will therefore be the first environment where App Check is enforced**, which means the first
real test of whether the client attaches tokens happens with pilot users watching.

Do not let that be the test. Enable App Check on **demo** first, confirm mutations still
succeed there, and let beta inherit a proven configuration.

### 7. Cloud Scheduler identity

Beta and production use OIDC rather than a shared secret. Create a service account, grant it
`roles/run.invoker` on the backend, and use its email for
`GOALPLACE_SCHEDULER_SERVICE_ACCOUNT_EMAILS` and the backend origin for
`GOALPLACE_SCHEDULER_AUDIENCE`. An empty allowlist makes `verifySchedulerOidc` reject
everything, which is the same permanent-401 shape as a missing secret — and is reported by
`/api/environment` for the same reason.

### 8. Run the gates until they pass

```bash
npm run environment:prepare:beta
```

```bash
npm run deploy:preflight -- --environment=beta --project=beta
```

Both refuse while any placeholder remains, and the messages name what is missing.

### 9. Create the backend against the right overlay

```bash
firebase apphosting:backends:create --project goalplace256-beta --config apphosting.beta.yaml
```

**Naming the overlay is not optional.** A backend created without `--config` reads
`apphosting.yaml`, which now declares `GOALPLACE_ENVIRONMENT: unconfigured` and fails the
build with a message naming the overlays. That is deliberate: the default used to be a copy of
the demo config, so an un-overlaid beta backend came up as demo and wrote to the demo database.

### 10. Deploy rules and indexes, then seed

```bash
npm run deploy:preflight -- --environment=beta --project=beta && firebase deploy --project beta --only firestore:fg256
```

Then seed. Note that `scripts/seed-investor-demo.ts` currently hard-refuses any project but
staging; extending it to beta is a deliberate change to make with the beta dataset in hand, not
a flag to flip in passing.

---

## What to read back afterwards

Configuration you cannot observe is configuration nobody fixes. On the beta origin:

- `/api/health` → `status: ok`, `environment: beta`
- `/api/environment` → the beta project, `finalizerMode`, `teamAuthorityStage: retired`, and
  `schedulerAuth.unconfigured` empty

The last one is the check that catches a half-declared credential, which is the exact state
`GOALPLACE_RECONCILIATION_SECRET` is in on demo today.
