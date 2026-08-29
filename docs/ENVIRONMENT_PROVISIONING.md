# Provisioning beta and production

**Status: not done.** Beta and production have no Firebase projects. Every `REPLACE_WITH_`
marker below is a real blocker, and no amount of code closes them — they need a Google account
with billing, which is why this is a runbook rather than a script.

This is the hard gate in front of every other beta task. Nothing else in the beta plan can
start until it is finished.

---

## What is already true

The environment architecture is built and the guards are live. What is missing is the two
projects the architecture describes.

| Piece | State |
|---|---|
| `apphosting.beta.yaml`, `apphosting.production.yaml` | Written, complete in shape, **11 placeholders each** |
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

### 1. Create the two Firebase projects

```bash
firebase projects:create goalplace-beta --display-name "GoalPlace256 Beta"
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
firebase firestore:databases:create fg256 --project goalplace-beta --location nam5
```

```bash
firebase firestore:databases:create fg256 --project goalplace-prod --location nam5
```

### 3. Register a web app in each, and read back its config

```bash
firebase apps:create WEB "GoalPlace256 Beta" --project goalplace-beta
```

```bash
firebase apps:sdkconfig WEB --project goalplace-beta
```

That output supplies five of the placeholders. Repeat for production.

### 4. Fill the placeholders

There are **24 value lines** across four files — 9 distinct values per environment, since the
project id appears twice in each overlay. `environment:prepare:beta` names any you miss, so run
it after each file rather than at the end.

**`apphosting.beta.yaml`** — 11:

| Placeholder | Source |
|---|---|
| `REPLACE_WITH_BETA_WEB_API_KEY` | step 3 `apiKey` |
| `REPLACE_WITH_BETA_AUTH_DOMAIN` | step 3 `authDomain` |
| `REPLACE_WITH_BETA_PROJECT_ID` | `goalplace-beta` (appears **twice** — public and admin) |
| `REPLACE_WITH_BETA_STORAGE_BUCKET` | step 3 `storageBucket` |
| `REPLACE_WITH_BETA_SENDER_ID` | step 3 `messagingSenderId` |
| `REPLACE_WITH_BETA_APP_ID` | step 3 `appId` |
| `REPLACE_WITH_BETA_APP_CHECK_SITE_KEY` | reCAPTCHA Enterprise key, step 6 |
| `REPLACE_WITH_BETA_SCHEDULER_AUDIENCE` | the App Hosting origin, step 7 |
| `REPLACE_WITH_BETA_SCHEDULER_SERVICE_ACCOUNT` | the scheduler service account email, step 7 |

**`apphosting.production.yaml`** — the same 11, production values.

**`config/environments.json`** — `beta.firebaseProjectId` and
`production.firebaseProjectId`.

**`.firebaserc`** — the `beta` and `production` aliases. The deploy preflight resolves
`--project beta` through this file and refuses if the result disagrees with the registry, so
these two must match `config/environments.json` exactly.

### 5. Declare the secrets

App Hosting reads these from Secret Manager, not from the config file.

```bash
firebase apphosting:secrets:set resendApiKey --project goalplace-beta
```

```bash
firebase apphosting:secrets:set goalplaceFantasyScoringSecret --project goalplace-beta
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
firebase apphosting:backends:create --project goalplace-beta --config apphosting.beta.yaml
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

### 11. Back up demo first

Before any of this, take a Firestore export of demo. It is 1,308 users and 540 sport-correct
matches built by hand, and it is not reproducible. Demo is never destroyed to launch beta —
they are different projects — but a verified export with a tested restore costs an hour and
removes the question entirely.

---

## What to read back afterwards

Configuration you cannot observe is configuration nobody fixes. On the beta origin:

- `/api/health` → `status: ok`, `environment: beta`
- `/api/environment` → the beta project, `finalizerMode`, `teamAuthorityStage: retired`, and
  `schedulerAuth.unconfigured` empty

The last one is the check that catches a half-declared credential, which is the exact state
`GOALPLACE_RECONCILIATION_SECRET` is in on demo today.
