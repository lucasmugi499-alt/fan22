# GoalPlace Operations Model V2: Handoff

**Purpose.** If the agent working on this stops mid-migration, another one picks it up from
this file alone. It records what is done, what is left, how to do it, and the traps.

**Last updated:** 2026-08-25
**Branch:** `handbook-v2`, local only, not pushed
**Head:** `b067eaa`
**Contract:** `docs/RESULT_ENGINE_V2_MILESTONE.md` is the deploy runbook. The Handbook is the
architectural contract. This file is the state of the work.

---

## 0. Read this first

Six statuses, never collapsed into each other. Most mistakes on this migration come from
treating one as another.

| Status | Means |
|---|---|
| implemented | code exists on the branch |
| tested | local suites prove it |
| migrated | real environment data has been moved |
| deployed | a specific execution plane is running it |
| enabled | reachable by real users |
| cloud-verified | proven end to end against the live environment |

**Something existing in Git is not deployed. App Hosting deploying is not Functions
deploying.** State which plane, always.

---

## 1. Where the work stands

### Engineering (local)

| Item | Status |
|---|---|
| A0 actor + event schema 2.0.0 | implemented, tested |
| A league capabilities, bundles, last-admin rule, conflict detection, capture policy | implemented, tested |
| B0 athlete `legalName` / `registeredPosition` | implemented, tested |
| B athlete persona, posts, backings, stat issue | implemented, tested |
| B′ PWA shell, offline queue | implemented, tested |
| C field capture, Match Ops principal, clock, fencing, attestation | implemented, tested |
| D candidate convergence, lifecycle adapters, quality | implemented, tested |
| E propose/ratify, post-match entry, escalation, staleness | implemented, tested |
| F basketball and rugby palettes, box score | implemented, tested |
| W1 report immutability, event digest, candidate versioning | implemented, tested |

### Operations (real environment)

| Item | Status | Blocked by |
|---|---|---|
| Real V1 inventory | **not run** | credentials |
| V1 drain = zero | **not proven** | credentials |
| Straggler migration | **not run** | drain first |
| Team authority retirement | **not done** | drain = zero |
| Access projection rebuild | **not done** | retirement |
| Sunset invariants | **not proven** | rebuild |
| Push | **held deliberately** | gates above |
| Functions deploy | **not done** | push |
| Field capture canary | **not done** | deploy |

### Deployed planes on `demo` (`manifest-quasar-479416-s7`), queried 2026-08-25

| Plane | State |
|---|---|
| App Hosting | backend `fan22`, updated 2026-08-23, **automatic builds enabled** |
| Cloud Functions | 7 live: `convergeLifecycle`, `onOfficialResultFinalized`, `onResultSubmissionWritten`, 4 search indexers |
| `onMatchReportWritten` | **not deployed**. Field capture is not live |
| `reconcilePaymentIntents` | not deployed, and must stay that way for this milestone |

---

## 2. What blocks progress right now

**Credentials.** `gcloud` has no credentialed accounts and there is no
`GOOGLE_APPLICATION_CREDENTIALS_JSON` in the environment. Every migration script initializes
with `applicationDefault()`, so none of them can run. The Firebase CLI is authenticated
(`lucasmugi499@gmail.com`), which is why read-only plane queries work.

To unblock:

```bash
export GOOGLE_APPLICATION_CREDENTIALS_JSON='<service account JSON for manifest-quasar-479416-s7>'
```

Datastore User is enough for drain, migration, rebuild and invariants. Deploys need more.

---

## 3. The method, in order

Do not reorder these. Each step's failure mode is the reason the next one comes after it.

### Step 1: inventory

```bash
npm run access:v1-drain
```

Five counts. Two block retirement:

- claims awaiting a **team** answer
- open team invitations

Two do not, deliberately:

- open but league-resolvable (league capability is untouched by retirement)
- active team assignments (inventory; requiring zero would make the gate unreachable in any
  league that ever had a Team Admin)

Record the actual numbers. Do not summarise to "drain passed".

### Step 2: migrate stragglers, one at a time

Preferred: let the original parties finish. For the ones that never will (folded club,
departed admin, three-month-old fixture):

```bash
npm run access:migrate-v1 -- --match <matchId> --reason "<why>"        # dry run
npm run access:migrate-v1 -- --match <matchId> --reason "<why>" --apply
```

**Migration changes the governance route. It never decides sporting truth.**
`pending_confirmation → disputed` is correct. `pending_confirmation → official` is not, and
nothing in the tool can do it. Writes a `result.workflow.migrated` audit event.

There is no bulk mode on purpose: one command clearing the whole gate would silently convert
live negotiations into decisions one party never got to contest.

### Step 3: re-run the drain

Blocking counts must be zero. Do not proceed otherwise.

### Step 4: retire team authority

```bash
export GOALPLACE_TEAM_AUTHORITY_STAGE=retired
```

Three stages, and the distinction matters:

| Stage | New grants | Existing grants |
|---|---|---|
| `active` | allowed | work |
| `frozen` (default) | prohibited | work |
| `retired` | prohibited | grant nothing |

The default is `frozen` because a deploy that retired authority would strand every open V1
workflow the moment a team scope rebuilt. The two-sided guard on `resultSubmissions` fails on
**both** its terms at once, so the opponent cannot answer either.

### Step 5: rebuild projections

```bash
npm run access:migrate:dry-run
npm run access:migrate:apply
npm run access:migrate:gate
```

Changing the capability catalogue does **not** rewrite stored projections. Until this runs,
retirement has happened in the code and not in the database.

### Step 6: prove it against stored documents

```bash
npm run access:sunset-invariants
```

Must exit 0. Enforces: no team capabilities in live indexes, no acceptable team invitations,
no V1 claim awaiting a team. Permits all history to remain.

> A green `access:compat` against the demo dataset proves nothing here. That dataset contains
> no team-scoped assignments: a bridge load-tested with zero trucks.

### Step 7: push, then deploy planes separately

Only when steps 1 to 6 are green **and** `npm run deploy:ready` is green.

Order: Firestore Rules → Storage Rules → App Hosting → the field capture Functions only.
Do not deploy scheduled Functions as a group. Do not deploy `reconcilePaymentIntents`.

### Step 8: canary

One league, one fixture, two demo teams with full squads, one Field Manager session. Full
workflow through to officialization. Then replay the trigger and confirm nothing changes.
Then submit one deliberately bad report and confirm an exception with zero official writes.

---

## 4. Traps that have already bitten

Each of these was a real bug on this branch, not a hypothetical.

| Trap | What happened |
|---|---|
| Firestore rejects `undefined` | Field capture events carry no `submittedByUserId`; the builders assigned it explicitly, so every real write would have thrown. The fake-db unit suite passed throughout. Omit keys, never assign undefined. |
| Path alias in the Functions bundle | `verify:bundle` fails the build. Everything under `src/kernel/**` and the shared server modules compile into Functions: **relative imports only.** Test files must be excluded from that tsconfig. |
| Score comparison is not enough | A goal reattributed between attestation and finalization leaves the total identical and changes whose career record it lands on. Hence the content digest. |
| Zeroing bundles in code | Retirement is an operation, not a deploy. See step 4. |
| Wrong rules file | `firebase.json` points at `firestore.rules.next` (1188 lines), not `firestore.rules` (302). Editing the wrong one deploys nothing and fails nothing. |
| Guard budgets are shrink-only | `access:guard` fails when a budget is too high **or** too low. Lower it in the same commit as the fix. |
| Stale `functions/lib` | `verify:bundle` reads emitted output. After changing the tsconfig include/exclude, `rm -rf functions/lib` before rebuilding. |

---

## 5. Architectural rules that must not be broken

- **Never manufacture a synthetic `ResultSubmission` for field capture.** The whole point of
  `FinalizationCandidate` is that the engine stops depending on the old source type. A fake
  submission moves that coupling from storage into memory; it does not remove it.
- **Everything before the candidate is source-specific. Everything after it is
  source-agnostic.** No source checks in the planner. Source-specific persistence goes in a
  `SourceLifecycleAdapter`.
- **`actor`, `source`, `workflow` and `dataQuality` are four fields, not one.** Do not let
  `source` accumulate unrelated meaning.
- **Data quality is computed at finalization and stored on the immutable version.** No route
  can set it.
- **Retire authority, preserve history.** Historical team assignments, invitations, V1
  submissions and audit records stay readable forever, and keep their V1 provenance labels. Do
  not normalize history into V2 terminology.
- **`ready_for_finalization` is not `auto_finalized`.** The first means nothing blocks; the
  second would claim an official record exists.

---

## 6. Commands

| Command | Purpose |
|---|---|
| `npm run deploy:ready` | All 12 local gates |
| `npm test` | 1328 unit tests |
| `npm run test:rules` | 155 rules tests, needs emulator |
| `npm run test:integration` | 16 finalization tests against real Firestore |
| `npm run access:v1-drain` | The migration gate |
| `npm run access:migrate-v1` | Governed straggler migration |
| `npm run access:migrate:*` | Projection rebuild: dry-run, apply, gate |
| `npm run access:sunset-invariants` | Post-migration proof |

---

## 7. Session log

| Date | Head | What changed |
|---|---|---|
| 2026-08-24 | `e9b080c` | Phases A0 to F built |
| 2026-08-24 | `f5eff3a` | Report gate and staleness sweep; stopped short of candidate convergence |
| 2026-08-25 | `4e59652` | Workstream A: candidate convergence, lifecycle adapters, emulator suite |
| 2026-08-25 | `83c6cfa` | Workstream B: staged team authority, drain inventory, migration, invariants |
| 2026-08-25 | `6167529` | Milestone runbook |
| 2026-08-25 | `b067eaa` | W1: report immutability, event digest, candidate versioning |

**Next action:** supply credentials, then run step 1.
