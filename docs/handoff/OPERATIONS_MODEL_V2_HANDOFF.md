# GoalPlace Operations Model V2: Handoff

**Purpose.** If the agent working on this stops mid-migration, another one picks it up from
this file alone. It records what is done, what is left, how to do it, and the traps.

**Last updated:** 2026-08-29
**Head:** `5a9e121`+, on `main`, pushed.
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

## 1. The migration, field capture canary and staleness sweep are done

Steps 1 to 8 all ran against the real Demo environment (`manifest-quasar-479416-s7`, database
`fg256`) on 2026-08-26. The migration gates exit 0, the clean field capture canary finalized
exactly once, both trigger replays were inert, and the contradictory canary produced exactly
one blocking review exception with no official records. Field capture was then deployed in
`enabled` mode on Demo. The separately-scoped staleness sweep was corrected, released and
cloud-verified afterwards without writing sporting truth.

### What ran, with its numbers

| Gate | Result |
|---|---|
| V1 drain, before | 264 submissions. **18** awaiting a team answer, 6 league-resolvable, 100 active team assignments, 0 pending invitations. Safe to retire: **NO** |
| Straggler migration | **18 migrated**, one command at a time, each with a reason |
| V1 drain, after | **0** awaiting a team answer, 24 league-resolvable, 0 pending invitations. Safe to retire: **YES** |
| Team authority stage | **`retired`**, on both runtimes that build projections |
| Projection rebuild | **1123 repaired.** 1123 stale before, 0 after. 0 missing, 0 orphan, 0 coverage gaps |
| `access:migrate:gate` | **exit 0** |
| `access:sunset-invariants` | **exit 0**, against stored documents |
| `acceptedSpellings()` shim | **deleted**, server and Rules together |
| `npm run deploy:ready` | **exit 0.** 1444 unit, 155 rules, 29 integration |
| Field capture clean canary | `match_eurdl_18_03`: **one** result version, **3** canonical events, **2** evidence-supported athlete projections; the derived standings builder counts its canonical match document once |
| Field capture replay | contemporaneously observed: versions +0, events +0, athlete stats +0, audit side effects +0. Standings have no write path, so no standings delta is claimed |
| Field capture bad canary | `match_eurdl_18_04`: attested 2-1, reconstructed 3-1; **0** official records, **1** deterministic blocking exception; replay stayed at one |
| Unreported sweep, before canary | **578** past-cutoff matches scanned, **0** eligible, **0** would open |
| Unreported sweep canary | `canary_unreported_20260826`: first deployed delivery opened **1** deterministic case and wrote **0** official records; direct replay and an actual Cloud Scheduler dispatch both stayed at one |

All three migration gates and `release:canary` were re-run **after** the final enabled-mode
Functions deploy and still pass.

Evidence: the newest `docs/evidence/operations-model-v2-*.json`. It carries forward across
commits and records `carriedFrom`, so the newest file is always the live record. Every count above is in it.

### What the 18 migrations did

Every one was 111 to 140 days past a three-day confirmation deadline: nobody was ever going
to answer them. Each moved `pending_confirmation` or `confirmation_overdue` to `disputed`,
which routes it to the league's existing resolution workflow. **No claim's scores, parties or
history were rewritten.** Migration changed the governance route and decided no sporting truth.

```
match_kmcfl_09_01  _09_02  _09_04      match_eurdl_09_01  _09_02  _09_04
match_kcrc_09_01   _09_02  _09_04      match_nerdl_09_01  _09_02  _09_04
match_kmbl_09_01   _09_02  _09_04      match_nucbl_09_01  _09_02  _09_04
```

### What the rebuild did, by scope

| Scope | Stored | Change |
|---|---|---|
| team | 100 | **emptied to zero capabilities.** The assignment records survive: retire authority, preserve history |
| league | 16 | re-spelled to the ADR-003 canonical names |
| athlete | 1000 | re-spelled |
| platform | 7 | re-spelled |

---

## 2. Deployed planes on demo, verified through 2026-08-27

| Plane | State |
|---|---|
| App Hosting | **`build-2026-08-27-002`**, rolled out from exact commit `5a9e121`. The live origin reports `environmentVersion: fan22-build-2026-08-27-002` **and `teamAuthorityStage: retired`**, so both the build and the stage are read back rather than inferred. It removes the dead stored-standings read, contains the typed clock adapter, and emits the versioned 2.1.0 event provenance payload from its trusted finalization routes. Rollouts are `apphosting:rollouts:create`; automatic rollouts from GitHub do not work on this backend. |
| Firestore Rules | **released 2026-08-26** to `fg256`, with indexes. `hasLeagueOperatorCapability` narrowed to canonical spellings only. |
| Storage Rules | unchanged since the 2026-08-26 release; not re-released this session |
| Cloud Functions | **9 live.** `sweepUnreportedMatches` is the ninth and was released separately. `onMatchReportWritten` is ACTIVE on source hash `aa616e99290e892836730957ea5131c2333a31bd`; the separately deployed sweep remains ACTIVE on `4e1e62e95598aaa84050246bd4d4a50e76bb3dc8`. The Firebase CLI reads their deployed environment directly. The legacy V1 trigger was not redeployed. |
| `reconcileResultSubmissions` | **not deployed**, matching its pre-existing state |
| `reconcilePaymentIntents`, `lockFantasyLineups` | not deployed, and must stay that way |

### Activation gates, per source

The single `GOALPLACE_FINALIZER_MODE` was split on 2026-08-26. See section 5.

| Source | Variable | Demo value | Proven? |
|---|---|---|---|
| Bilateral V1 | `GOALPLACE_FINALIZER_MODE` | `enabled` | cloud-verified 2026-08-08 |
| Field capture | `GOALPLACE_FIELD_CAPTURE_MODE` | **`enabled`** | **clean, replay, contradictory and contradictory replay cloud-verified 2026-08-26** |
| League post-match | `GOALPLACE_LEAGUE_ENTRY_MODE` | `off` | never |

The canary deployment allowlisted only `match_eurdl_18_03`. The contradictory fixture stopped
at ingress before activation could matter, exactly as designed. Only after the clean proof,
clean replay, contradiction and contradiction replay passed was the Demo value changed to
`enabled` and `onMatchReportWritten` targeted again. The canary allowlist is now empty. A direct
`firebase functions:list --json` reading shows field capture `enabled`, V1 `enabled`, league
entry `off` and authority `retired` on both Functions deployed this session.

---

## 3. Credentials

**They were on the machine the whole time.** The previous session reported none and was
wrong about the cause: `.env.local` sets
`GOOGLE_APPLICATION_CREDENTIALS=/Users/beno1017/.config/goalplace256/staging-admin.json`,
a service account for `manifest-quasar-479416-s7` — but the migration scripts run as bare
`tsx script.ts` with no `--env-file`, so that variable was never in the process environment.

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/Users/beno1017/.config/goalplace256/staging-admin.json
export GOALPLACE_FIRESTORE_DATABASE_ID=fg256
export GOALPLACE_ADMIN_PROJECT_ID=manifest-quasar-479416-s7
export GOALPLACE_TEAM_AUTHORITY_STAGE=retired
```

Set all four. The last one matters for anything that rebuilds or compares projections: the
same assignments produce different desired projections at `frozen` and at `retired`.

The local unit suite deliberately tests the unset default (`frozen`). Remove only
`GOALPLACE_TEAM_AUTHORITY_STAGE` from the `deploy:ready` process, then restore it before any
Demo projection or migration command. Running Vitest with the live `retired` value is a
different test configuration and makes the frozen-default assertions fail by design.

Datastore User is enough for drain, migration, rebuild and invariants. Deploys use the
Firebase CLI, which is separately logged in as `lucasmugi499@gmail.com`.

---

## 4. What is left

At a glance. The migration and both Demo canaries are complete. What remains is promotion
policy and non-blocking housekeeping.

| | Item | Status |
|---|---|---|
| **Completed 2026-08-26** | Field capture canary, replay, bad canary and bad replay | **cloud-verified** — §4.1 |
| **Completed 2026-08-26** | `sweepUnreportedMatches` | corrected, deployed separately and cloud-verified — §4.2 |
| Decide before promoting | `apphosting.beta.yaml` / `apphosting.production.yaml` declare no authority stage | §4.3 |
| Housekeeping | 6 of 9 Functions on older generations; Storage rules not re-released; one untracked Firestore index | §4.3 |
| **Closed 2026-08-26** | Functions runtime values | read back directly with the Firebase CLI — §4.4 |

Nothing in the migration itself is outstanding. Steps 1 to 7 all ran, all gates exit 0, and
all three were re-run after every deploy.

### 4.1 The field capture canary — completed and proven

Two Eastern football fixtures were controlled before any report existed. Both had complete
18-player registered squads, no official result, no result submission, no competing source,
and no fantasy competition. Because every unused Demo fixture was historical and outside the
Field Manager access window, only their schedule fields were moved into the current window
before capture: clean `match_eurdl_18_03` to 21:00Z and contradictory
`match_eurdl_18_04` to 21:15Z. No score or sporting truth was set by that control step.

The clean fixture was allowlisted and `onMatchReportWritten` alone was deployed in `canary`
mode. Every real, deployed authenticated Field Manager route was driven manually, one
transition at a time, through link, PIN, check-in, immutable lineup, clock, three goal events,
half time, second half, full time and 2-1 attestation. This was an endpoint-level manual canary,
not a browser/phone UI run; the client UI orchestration is therefore not independently proven
by this evidence. Persisted proof:

- report `official`, `reportVersion=1`, declared and reconstructed 2-1, 3 events, digest
  `40a9ca56337bd4c0a3c200fc5987d8e5cd14893ad1d86460c8ec242c639960f1`;
- candidate `field_capture:match_eurdl_18_03:v1`, `source=field_capture`,
  `workflow=result_engine_v2`, with a `match_ops_session` source principal;
- exactly one finalization ledger and `OfficialResultVersion`, three canonical goal events,
  one public provenance record and one valid official reconciliation. There is no standings
  write path: `buildLeagueStandings` derives the table from canonical match documents, and
  this verified/completed 2-1 match is structurally included exactly once;
- exactly two athlete projections, one for each scorer. No lineup-only athlete received a
  projection without event evidence;
- forced trigger replay contemporaneously changed versions +0, events +0, athlete stats +0,
  provenance +0, reconciliation +0, exceptions +0, outbox +0 and audit side effects +0.
  Present cardinalities remain consistent with that observation, but cannot reconstruct the
  historical before/after instant. No standings-write delta is claimed because none exists.

The contradictory fixture was then driven through the same real workflow with four goal
events reconstructing 3-1 and an attested score of 2-1. Its report is `league_review` with
`declared_score_mismatch`; the match stayed pending and unscored. It has zero finalization
ledgers, official result versions, official events, athlete stats, provenance, reconciliation,
outbox or audit effects, and exactly one deterministic blocking record in
`matchOperationalExceptions`. There is deliberately no finalizer-level
`reconciliationExceptions` record: ingress blocks the contradiction before a candidate can
reach sports-truth reconciliation. Replaying the trigger kept every official count at zero
and the operational exception at exactly one with unchanged content.

`npm run release:canary -- --match match_eurdl_18_03 --bad-match match_eurdl_18_04` passed
before and after the final Functions deploy. Only then was Demo field capture changed to
`enabled` and only `onMatchReportWritten` deployed. V1 remained enabled and untouched.

### 4.2 `sweepUnreportedMatches` — completed and proven

The original implementation was not wired because it was unsafe: its first 200-row page
would have opened five false cases, four over active league adjudication and one over a live
match. A complete measurement later found **288** past scheduled/pending legacy fixtures with
no source; retroactively imposing the new reporting obligation would have flooded the queue.

The corrected domain rule is in `CONTEXT.md` and the pure predicate:

- a postponed fixture remains `scheduled` at a revised future `scheduledAt`;
- called-off or abandoned without a result is `cancelled`;
- only a **governed fixture** with a valid capture policy bound no later than kickoff can be
  classified as unreported, so pre-policy Demo history is not retroactively governed;
- lifecycle must be `scheduled` or `completed`, verification must still be `pending`, the
  grace period must have passed, and there must be no field report, bilateral submission or
  official result;
- disputed, verified, rejected, live and cancelled fixtures are ineligible.

The runner moved to `src/server/finalization/unreportedSweep.ts`, paginates the entire query,
batches secondary reads only for governed possibilities, defaults to dry-run in the release
script, caps writes per invocation, and transactionally re-reads the match, report, submission
and deterministic exception before creating anything. It writes only
`matchOperationalExceptions`; there is no finalizer call or score inference.

Live Demo proof, in order:

1. Before the controlled fixture existed: scanned 578 past-cutoff matches, eligible 0,
   would-open 0.
2. Deployed only `functions:sweepUnreportedMatches`; it is ACTIVE in `us-central1` on source
   hash `4e1e62e95598aaa84050246bd4d4a50e76bb3dc8`.
3. Created controlled fixture `canary_unreported_20260826` with a bound
   `FIELD_REQUIRED` policy, two registered teams, no report, submission or official record.
4. First authenticated invocation of the deployed handler opened exactly one deterministic
   `result_never_reported` case. Match stayed completed/pending and null-null, with zero
   finalizations, official events, athlete stats, provenance or reconciliation.
5. Second deployed invocation kept the exception at exactly one. The follow-up dry-run read
   eligible 1, already-open 1, would-open 0, opened 0.
6. Invoked the Firebase-created Cloud Scheduler job itself through the Scheduler API. The
   request returned 200, `lastAttemptTime` advanced to `2026-08-27T00:50:53.291470Z` with no
   error status, and post-dispatch verification still found one exception and zero official
   records. This proves Scheduler delivery, not only the deployed HTTP handler.

Commands: `release:unreported-sweep` (dry-run unless `--apply`) and
`release:unreported-canary -- --prepare|--verify`.

### 4.3 Smaller things

- ~~**`apphosting.beta.yaml` and `apphosting.production.yaml` do not declare
  `GOALPLACE_TEAM_AUTHORITY_STAGE`.**~~ **Closed 2026-08-29.** Both now declare it explicitly,
  along with the three finalizer gates and the gateway secret flag, rather than inheriting
  them from a base named for no environment. `scripts/lib/deploymentPlanes.test.ts` covers all
  three overlays instead of demo alone. The base `apphosting.yaml` was also emptied of project
  identity and now declares `GOALPLACE_ENVIRONMENT: unconfigured`, which
  `assertSafeProductionEnvironment()` rejects at build — see §10.
- Storage rules were not re-released this session. They are unchanged, so this is
  bookkeeping, not a gap.
- Six of the nine deployed Functions carry older source/environment generations. None consumes
  the field-capture gate or team-authority stage, so this does not undermine the migration.
  Do not align them with an unrestricted `--only functions` deploy: the payment and fantasy
  schedulers remain intentionally absent.
- Firestore reports one index present in the project that is not in `firestore.indexes.json`.
  Pre-existing, not touched, and removing it needs `--force`.

### 4.4 Functions runtime values — now read back

The earlier handoff said the Firebase CLI could not show deployed Functions environment
variables. That was wrong. `firebase functions:list --json` includes them. After the final two
targeted deployments it read both `onMatchReportWritten` and `sweepUnreportedMatches` as:

```
GOALPLACE_FINALIZER_MODE=enabled
GOALPLACE_FIELD_CAPTURE_MODE=enabled
GOALPLACE_FIELD_CAPTURE_CANARY_MATCH_IDS=
GOALPLACE_LEAGUE_ENTRY_MODE=off
GOALPLACE_TEAM_AUTHORITY_STAGE=retired
```

This closes the Functions configuration plane directly. The field canary remains the stronger
behavioural proof that the gate actually governs ingress, and the sunset invariants remain the
stored-data proof that team authority is not being rebuilt. These are complementary readings,
not substitutes for one another.

---

## 5. The gate split, and why

Until 2026-08-26 a single `GOALPLACE_FINALIZER_MODE` governed all three intake paths. It read
`enabled` because the bilateral V1 finalizer had been cloud-verified on demo since
2026-08-08 — and `onMatchReportWritten` was then deployed under that same word, arming a
pipeline that had never once run against real data. The next ordinary field report anybody
wrote would have become an official result, with standings, athlete projections and Fantasy
points behind it, and no human step anywhere.

Turning the shared flag down to `canary` would have protected field capture by degrading a
finalizer that had been working for weeks. **The flag was not wrong. It stopped matching the
shape of the thing it governs.** Two pipelines at two maturities need two switches.

Three rules came out of it, and they hold:

- **No inheritance.** An unset `GOALPLACE_FIELD_CAPTURE_MODE` means `off`, even on a
  deployment whose legacy flag says `enabled`. Falling back would let a new source arrive
  already armed by a switch flipped for a different pipeline on the strength of a canary that
  tested something else.
- **The gate stays at ingress.** `onMatchReportWritten` already branched on source to pick a
  loader; it now resolves the activation in the same place and hands the planner a decision it
  cannot trace back to a source. **No source checks in the planner.**
- **The source field narrows, never grants.** `activationSourceForReport` sends anything that
  is not exactly `league_post_match` to field capture, so a malformed client value can never
  select whichever gate happens to be open.

---

## 6. Traps that have already bitten

Each of these was a real bug on this branch, not a hypothetical.

| Trap | What happened |
|---|---|
| Firestore rejects `undefined` | Field capture events carry no `submittedByUserId`; the builders assigned it explicitly, so every real write would have thrown. The fake-db unit suite passed throughout. Omit keys, never assign undefined. |
| Path alias in the Functions bundle | `verify:bundle` fails the build. Everything under `src/kernel/**` and the shared server modules compile into Functions: **relative imports only.** |
| Score comparison is not enough | A goal reattributed between attestation and finalization leaves the total identical and changes whose career record it lands on. Hence the content digest. |
| Wrong rules file | `firebase.json` points at `firestore.rules.next` (1188 lines), not `firestore.rules` (302). |
| Guard budgets are shrink-only | `access:guard` fails when a budget is too high **or** too low. |
| Stale `functions/lib` | `verify:bundle` reads emitted output. `rm -rf functions/lib` before rebuilding after a tsconfig change. |
| Evidence that resets itself | The first generator overwrote its file on every run. It now merges. `--reset` is deliberate. |
| **Evidence that resets itself, again** | The merge only looked for a file with the identical commit sha, so the first commit *after* a gate ran produced a blank template and printed `Ready to push: NO` with every gate blocking. Nothing had regressed — the migration had been proven hours earlier and a documentation commit erased the record of it. Evidence now carries forward from the most recent file and records `carriedFrom`, so a reader can see which tree a gate was actually proven against. |
| **One switch, three sources** | See section 5. A global flag armed an unproven pipeline. |
| **`getFirestore()` with no database id** | The drain, the straggler migration, the sunset invariants and the field capture canary all asked for `(default)`. **No GoalPlace project has a `(default)` database.** Here that fails loudly with `5 NOT_FOUND`; anywhere with an empty `(default)` every count reads zero and the drain prints `Safe to retire: YES`. A gate that passes by measuring nothing. Now resolved through `scripts/lib/firestoreTarget.ts`, and every script prints `project/database` beside its counts. |
| **The stage must be set on every runtime that projects** | `projectScopeIndex` reads `GOALPLACE_TEAM_AUTHORITY_STAGE` at the moment a projection is **built**, and two runtimes build them: the Next server on any assignment change, `convergeLifecycle` hourly. Rebuilding to `retired` while either still read `frozen` would have written team capabilities back one user at a time. `access:sunset-invariants` would have passed on the day and failed a week later with nothing having changed. Guarded by `scripts/lib/deploymentPlanes.test.ts`. |
| **Migration left the match record behind** | `matches.verificationStatus` is derived from the claim's status and every other transition carries it across. The straggler migration moved the claim to `disputed` and left the match reading `pending` — so the league was asked to adjudicate while every club, every table and the league's own queue was still told the result was merely awaiting an opponent. Found by inspecting the 18 real claims before migrating any of them, not by a test. |
| **The coverage gate could never pass** | `findLegacyCoverageGaps` asks whether the canonical model grants an operator anything. At `retired` every team bundle grants nothing, so all 60 legacy team assignments became permanent gaps and `--strict` failed by construction. The league loop above it already carried this exact reasoning and excluded team scope; the team loop did not. Worse than noisy: the report sent the operator to `backfill-assignments.ts`, which would have created canonical team assignments granting nothing — new issuance during a sunset, to close a hole that is the point of the sunset. |
| **The staleness sweep would raise false cases** | See section 4.2. It would call four matches under active league adjudication "never reported". |
| **A new obligation was about to be applied to old fixtures** | The full Demo measurement found 288 past scheduled/pending fixtures with no source and no bound capture policy. Status/source guards alone would still have flooded the queue. Eligibility now requires a valid policy binding no later than kickoff; governance is not retroactive. |
| **The App Hosting overlay silently omitted the stage** | `apphosting.yaml` is the base and `apphosting.<environment>.yaml` overrides it when a backend is built with an environment name — and which file a backend reads is not visible from the CLI. `apphosting.demo.yaml` had no `GOALPLACE_TEAM_AUTHORITY_STAGE` at all, so "it is set in `apphosting.yaml`" was not a statement about what the runtime received. Both now declare it, the guard test requires agreement, and `/api/environment` reports the stage so it can be read back instead of reasoned about. |
| **The clock route and clock kernel spoke different action vocabularies** | The route validated `{ action: "start" }` and passed that object directly to a kernel that dispatches on `{ type: "start" }`. The real Field Manager workflow reached it and returned 409 while route validation and clock unit tests both looked green in isolation. The route now adapts the validated API shape explicitly, with a route-level regression test. |
| **`as never` erased the clock seam** | Even after the runtime bug was fixed, the adapter cast its result to `never`, so TypeScript could not stop the same discriminator mismatch returning. The route now performs an exhaustive, typed `ClockRequest` → `ClockAction` translation. |
| **Clearing a clock anchor wrote `undefined` to Firestore** | Half time correctly cleared `periodStartedAt` in the state machine, but the route spread the resulting `undefined` into the Firestore transaction. The fake route database accepted it; the live Demo database rejected the first half-time transition. Optional clock fields are now omitted at the persistence boundary, with a route-level regression test. |
| **Canonical events claimed every source was a result submission** | Shared event builders hardcoded `payload.source=result_submission_*`, including for field reports with zero `resultSubmissions`. The corrected emitter uses event schema 2.1.0: `payload.sourceType` carries exact ingress provenance and `derivation` separately names reconciliation construction. Historical 1.0.0/2.0.0 events remain immutable. App Hosting build 002 and the redeployed field/league trigger emit 2.1.0; the untouched legacy V1 trigger retains its prior bundle and semantics. |
| **A stale standings collection looked authoritative** | Nothing writes the stored `standings` documents and no component renders them, but every general data load fetched them. Current tables derive from verified matches. The provider/read path is removed and stored documents are preserved as history. |
| **Functions environment was declared unreadable when it was not** | `firebase functions:list --json` exposes deployed environment variables. The final release reads the field/V1/league gates, empty canary list and authority stage directly instead of relying on deploy logs. |

---

## 7. Architectural rules that must not be broken

- **Never manufacture a synthetic `ResultSubmission` for field capture.** A fake submission
  moves the coupling from storage into memory; it does not remove it.
- **Everything before `FinalizationCandidate` is source-specific. Everything after it is
  source-agnostic.** No source checks in the planner. The activation gate is resolved at
  ingress and passed in, which is why the planner cannot tell which source produced it.
- **`actor`, `source`, `workflow` and `dataQuality` are four fields, not one.**
- **Data quality is computed at finalization and stored on the immutable version.**
- **Retire authority, preserve history.** Historical team assignments, invitations, V1
  submissions and audit records stay readable forever and keep their V1 provenance labels.
  Team access indexes were **emptied, not deleted**, for exactly this reason. An `AuditEvent`
  that says `league.team.create` still says it — the compatibility *alias* was removed, not
  the vocabulary's history.
- **`ready_for_finalization` is not `auto_finalized`.**
- **Compatibility code needs a deletion condition, and then needs deleting.**
  `acceptedSpellings()` had one, met it, and is gone. `src/server/access/spellingSunset.test.ts`
  fails if it or the deprecated spellings return to live authorization code — including if
  Rules and the server are ever re-widened separately, which is the half-migration that
  already happened once.

---

## 8. Commands

| Command | Purpose |
|---|---|
| `env -u GOALPLACE_TEAM_AUTHORITY_STAGE npm run deploy:ready` | All 12 local gates; the suite exercises the unset/frozen default |
| `npm test` | 1444 unit tests |
| `npm run test:rules` | 155 rules tests, needs emulator |
| `npm run test:integration` | 29 Firestore integration tests |
| `npm run access:v1-drain` | The migration gate. Now prints the stranded ids and their age |
| `npm run access:migrate-v1` | Governed straggler migration. No bulk mode, on purpose |
| `npm run access:migrate:dry-run` / `:apply` / `:gate` | Projection rebuild |
| `npm run access:sunset-invariants` | Post-migration proof against stored documents |
| `npm run release:evidence` | Accumulating migration evidence, and the push gate |
| `npm run release:canary` | Verifies a field capture canary end to end, and the bad-report case |
| `npm run release:unreported-sweep` | Full Demo dry-run; add `-- --apply` only for a governed release |
| `npm run release:unreported-canary -- --prepare\|--verify` | Creates/verifies the Demo-only controlled missing-report fixture |

---

## 9. Session log

| Date | Head | What changed |
|---|---|---|
| 2026-08-24 | `e9b080c` | Phases A0 to F built |
| 2026-08-24 | `f5eff3a` | Report gate and staleness sweep |
| 2026-08-25 | `4e59652` | Workstream A: candidate convergence, lifecycle adapters, emulator suite |
| 2026-08-25 | `83c6cfa` | Workstream B: staged team authority, drain inventory, migration, invariants |
| 2026-08-25 | `6167529` | Milestone runbook |
| 2026-08-25 | `b067eaa` | W1: report immutability, event digest, candidate versioning |
| 2026-08-25 | `1e1db74` | W3/W4: provenance as four facts |
| 2026-08-25 | `8ef1e1a` | W7: last Team Admin issuance path closed |
| 2026-08-25 | `ae46f61` | W5: canonical planner regression suite |
| 2026-08-25 | `a84ad65` | W2: league report loader, third source complete |
| 2026-08-25 | `aba00ee` | W14: evidence generator; merged to main and pushed |
| 2026-08-25 | `9e8346c` | W17: canary verifier, proven against the emulator |
| 2026-08-26 | `de4af7c` | Capability spelling shim; Rules, indexes, Storage, App Hosting deployed |
| 2026-08-26 | `0ee0d29` | Deployment recorded |
| 2026-08-26 | `3153ece` | Cloud Functions deployed; field capture became operational |
| 2026-08-26 | `99dced6` | **Gate split.** Field capture and league entry get their own activation switches. Deployed to `onMatchReportWritten` |
| 2026-08-26 | `833acfe` | **Migration scripts pointed at `fg256`.** Four of them were asking for a database that does not exist |
| 2026-08-26 | `9cd6904` | Straggler migration now carries the match record across with the claim |
| 2026-08-26 | `af84135` | Drain report prints the stranded ids and their age |
| 2026-08-26 | `df3bf83` | **Team authority retired**, on both runtimes that build projections |
| 2026-08-26 | `725321a` | Coverage gate made stage-aware; it could not otherwise pass |
| 2026-08-26 | `e4c36f1` | **Spelling shim deleted**, server and Rules together. Pushed |
| 2026-08-26 | `85db6d6` | Handoff, pickup prompt, runbook and evidence recorded |
| 2026-08-26 | `c119d68` | `/api/environment` reports the authority stage; demo overlay declares it. **The overlay had been missing it entirely** |
| 2026-08-26 | `6245b4f` | Live canary found the clock API/kernel action mismatch; route adapter fixed, tested, pushed and deployed as App Hosting build 005 |
| 2026-08-26 | `b3c89ff` | Live half-time found Firestore `undefined` clock persistence; optional fields omitted, tested, pushed and deployed as App Hosting build 006 |
| 2026-08-26 | `06383e5` | Unreported-match eligibility corrected around governed fixtures, every result source, lifecycle/adjudication state and policy cutover; paginated transactional runner wired with release tools |
| 2026-08-26 | `faf2d00` | Official event payloads now carry exact ingress `sourceType`; clock API-to-kernel translation is exhaustively typed |
| 2026-08-26 | `e09e362` | Dead stored-standings provider/read path removed; historical documents preserved; field canary allowlist cleared |
| 2026-08-26 | `68376f5` | Sweep core deepened into the shared server module, all 1440/155/29 tests green, four commits pushed; sweep and `onMatchReportWritten` deployed separately; sweep clean/replay proven; App Hosting build 2026-08-27-001 live |
| 2026-08-27 | `5a9e121` | Final two-axis review closed: Cloud Scheduler delivery observed directly; event payload shape published and enforced as schema 2.1.0; `onMatchReportWritten` and App Hosting redeployed from exact commit; V1 trigger untouched; all 1444/155/29 readiness tests and live gates green |
| 2026-08-28 | `e6e7dfe`, deployed to Demo | **League Operations System released to Demo.** App Hosting rollout `build-2026-08-28-002` pinned to the exact commit, preceded by three new `fg256` composite indexes (matches by league and kickoff window; athletes by league and verification; athletes by league and claim state) — the Command read model queries all three and would have failed at read time without them. This slice did not touch the finalizer, `src/server/matchOps`, permission bundles or any capability: the League Admin authority model was already correct, and the work was closing the gap between capabilities the bundle grants and surfaces that could reach them. `league.field_manager.manage` now has an interface for the first time. Team creation stopped writing `adminUserIds` and the deprecated standings aggregates, and those fields are now optional on `Team`. Live origin verified serving the eight League destinations, the three folded routes redirecting, and `/api/league/command` guarded at 401. Unit gate 1672/1672; full readiness gate exit 0. |
| 2026-08-28 | `7238fbb`, deployed to Demo | **Platform Console V2 and Fantasy V1 released to Demo, one plane at a time.** Firestore indexes for `fg256` (adds `matchOperationalExceptions` on matchId+status; rules unchanged and skipped), then Cloud Functions, then App Hosting `fan22` rollout `build-2026-08-28-001` pinned to the exact commit. Each plane's own revision was read back rather than inferred from another: index confirmed present on the live database, Functions logs clear of any module-load failure, and the live origin serving the new routes (`/fantasy/.../pick5` 200, `/admin/network` 200, `POST /api/fantasy/pick5` 401 as its hardening contract requires). The Functions deploy **created** three functions that had never been deployed to Demo before: `lockFantasyLineups`, `reconcileResultSubmissions`, `reconcilePaymentIntents`. One data change: `fantasyCompetitions/fantasy_basketball_kampala_2026` gained `gameMode: pick5` and `budgetMode: budget_free`, because the stored document predated both fields and Demo reads competitions from Firestore rather than the seed file. Beta and Production remain a separate decision. |
| 2026-08-28 | `7238fbb` | **Three defects caught by reading a real exit code.** The readiness gate had been run through a pipe, so its status was `tail`'s and a failing chain read as green. Read properly it failed at `functions:build`: the derivation module imported the sport catalogue through the `@/` alias, which `tsc` emits verbatim into the Functions bundle and Node cannot resolve at require time. `verify-bundle` had been carrying that check the whole time. Also fixed: the fairness gate's exceptions query had no composite index and swallowed its own failure, which would have scored a fixture as having no open exceptions; and the deprecated-field guard correctly blocked a bare `athlete.name`/`position` read on the breakout board, a `leaguePoints`/`pointsFor` reuse in the mini-league table, and an unbridged athlete-name fallback in the palette. Full gate then green end to end: 1603 unit, 155 rules, 29 integration, bundle verified, demo validate, access and data guards, security audit, production build. |
| 2026-08-28 | Fantasy V1 working tree | **Finalizer touched, additively.** `officialAthleteMatchStats.stats` now carries derived `clean_sheet` and `goals_conceded`, computed in `src/lib/fantasy/derivation.ts` from the canonical official events plus the athlete's on-pitch window. No field manager taps these; deriving them is what makes football fantasy rich without adding touchline work. A stat line that carries either key explicitly still wins, so derivation fills a gap rather than overruling an observation, and an athlete the events cannot place on the field contributes no key at all rather than a zero that would read as a recorded fact. This slice wrote no official result, event, standing or data-quality tier, touched nothing under `src/server/matchOps`, and changed no capability or bundle. A source-level test now forbids the capture surface from importing or naming anything fantasy, so a Field Manager can never see ownership or points while recording. Unit gate: 1603/1603 green. |
| 2026-08-28 | `4733b6e`, deployed to Demo as `build-2026-08-28-008` | **Two defects found by signing in and doing the thing.** Assigning a Field Manager destroyed the credentials it had just minted: the sheet showed the access link and the PIN on success and the caller reloaded the page the moment the write landed, so the operator never saw either. They are issued once, stored only as `bootstrapTokenHash`/`pinHash`/`pinSalt`, and are not retrievable, so the reload lost the only copy and the sole recovery was to assign again. The refresh now happens on sheet close. Second, the match page denied the assignment had happened: it built its row from the match document alone, and assignments are not client-readable, so a fixture just assigned still read "Nobody is assigned to record this match." `/api/matches/[matchId]/history` now returns the assignment alongside the schedule changes and the row is built from both. What held under the same run: a fixture created through the real UI landed in `fg256` with its capture policy bound at creation (`POST_MATCH_ALLOWED`), and the assignment wrote an access window of two hours before to five hours after kickoff with no plaintext credential anywhere. |
| 2026-08-28 | mobile pass working tree | **Interaction pass at 320/375/390/430/768/1024.** Four layout defects, all of them narrow-width or role-specific and none visible at desktop. At 320 the Teams header could not fit its title and both actions on one line and nothing could shrink, so **Add team**, the primary action on the screen, ran off the right edge unreachable; it wraps now. Match rows truncated the fixture beside a `shrink-0` state chip, leaving "Gulu Warriors v G…" — the away side, half of what identifies a match, was the part cut; the title wraps to two lines instead. The schedule format `<select>` clipped its own value mid-word because the explanation lived inside the option text; the labels are short now and the explanation sits under the control. The desktop rail rendered an `ACCOUNT` group header with nothing under it on every League screen, because that group alone was not guarded on emptiness. Separately, the Field Manager affiliation field asked for "team ids, comma separated": declaring a conflict of interest required knowing Firestore document ids, and a declaration that hard to make does not get made — it is a tap list of the league's clubs now. User-visible em dashes were removed across League, Platform and athlete copy per the approved direction. Verified locally at 320 against the real code; **not verified on the deployed Demo origin**, because a cookie-only demo role stalls on the data load there (Firebase Auth's `apis.google.com` helper is not in the enforced `script-src`, see `next.config.ts:51`) and the supported entry needs the demo password typed into the sign-in form. |
| 2026-08-28 | Platform Console mobile pass | **`apis.google.com` added to `script-src`, and the People directory made usable on a phone.** The enforced CSP allowed the Firebase Auth iframe under `frame-src` while blocking the script that creates it, so live page loads carried the violation. Separately, the People directory gave every account three wrapped lifecycle buttons, which stacked at phone width into roughly 390px per account and a page some 31,000px long, and dragged a red **Disable** past the thumb once per row on the way down. `size="sm"` carries `px-4` plus a leading icon and needs about 105px, more than a third of a 320px screen, so a three-column grid alone made the buttons overlap instead of shrink; the icon now waits for `sm:`. One row of controls per account, page down to 22,950px, desktop unchanged (icons and padding verified restored at 1024). The audit-reason gate already refuses an action without a typed reason, so a stray tap was bounded rather than free, but the reason stays armed until it is spent. |
| 2026-08-27 | Platform Console V2 working tree | Added Platform application risk triage and observable invitation delivery attempts/resend/revoke/bulk operations. Initial invitation state is now `queued` and advances only from the provider/user event observed. Approval retries reuse the existing organization, league and invitation. This slice did not broaden assignment authority, change permission bundles, mutate the finalizer, or write anything under `src/server/matchOps`; Integrity only reads V2 provenance/quality and invokes the existing fenced takeover boundary. Unit gate: 1484/1484 green before release readiness. |

### Field capture canary session, in order

Re-ran drain, projection gate and sunset invariants against Demo, all green → selected two
controlled, disjoint, complete-squad/no-result/no-fantasy fixtures before any report existed →
moved only their schedules into the current Field Manager window → allowlisted the clean
fixture and targeted `onMatchReportWritten` in canary mode → drove the real link/PIN/check-in/
lineup/clock/event/attestation workflow → the live workflow exposed two App Hosting clock-route
defects, each fixed test-first, pushed and rolled out separately → completed the clean 2-1
report → inspected every persisted cardinality and principal → forced trigger replay, all
deltas zero → completed the contradictory 2-1/3-1 report, zero official records and exactly
one operational exception → forced bad replay, exception stayed one → `release:canary` passed →
set Demo field capture to `enabled` and targeted `onMatchReportWritten` only → re-ran all three
migration gates and `release:canary`, still green → ran the complete `deploy:ready` suite,
1430 unit / 155 Rules / 26 integration, green → two-axis review found no standards violations
and recorded the two literal proof boundaries: endpoint-level rather than browser-UI operation,
and an ingress operational exception rather than a downstream reconciliation exception.

### Unreported-match sweep session, in order

Measured all 580 Demo matches and found 288 past scheduled/pending legacy fixtures that a
status-only rule would retroactively govern → recorded the governed/postponed/cancelled/
unreported vocabulary in `CONTEXT.md` → drove eligibility test-first across live, disputed,
verified, reported, submitted, official, cancelled, legacy, malformed and retroactively bound
states → paginated the whole query and made exception creation transactionally race-safe and
idempotent → initial live dry-run scanned 578 past-cutoff matches with zero eligible → pushed
four implementation commits → `deploy:ready` passed with 1440 unit / 155 Rules / 29 integration
→ deployed only `sweepUnreportedMatches` → created one controlled governed fixture → deployed
handler opened exactly one exception and no sporting truth → duplicate delivery stayed at one
→ separately deployed only `onMatchReportWritten` to clear the ignored canary residue →
Functions env read back directly → App Hosting exact-commit rollout completed as build
2026-08-27-001 and live origin read back → final review identified the missing Scheduler-delivery
observation and unversioned payload shape → invoked the real Cloud Scheduler job and observed a
successful attempt with cardinality still one → published/enforced event schema 2.1.0 test-first
→ pushed exact commit `5a9e121` → redeployed only `onMatchReportWritten` plus the affected App
Hosting routes as build 2026-08-27-002; V1 trigger untouched → all three migration gates plus
both release verifiers remained green.

**Next action:** none for the Operations Model V2 Demo migration. Promotion to Beta or
Production remains a separate decision: set the authority stage deliberately for that
environment, rerun its drain/migration gates, and do not infer readiness from Demo. League
post-match entry is still `off` and needs its own future canary if it is to be enabled.


---

## 10. Production audit remediation, 2026-08-29

A separate adversarial audit of the whole product ran at commit `a41e2f5` and produced 24
findings, `GP-01` to `GP-24`. It found **no P0**: no privilege escalation, no tenant bleed, no
client-authored official result, no role-claim bypass. What it found instead was interface and
configuration defects. This section records what that pass changed **in this repo only** —
nothing below has been deployed to any plane, and none of it has been cloud-verified.

Status vocabulary from §0 applies. Everything here is **implemented** and **tested**. Nothing
is migrated, deployed, enabled or cloud-verified.

### What changed

| Finding | Change |
|---|---|
| `GP-01`, `GP-10` | Standings became a server projection. `standings/{seasonId}_{teamId}` is rebuilt from scratch from the season's official results after every finalization, and every table surface reads it. The browser previously computed the published table from at most 120 loaded matches, replacing the 240 the server had sent — so past ~120 fixtures the table was built from an arbitrary subset, and anonymous and signed-in visitors saw different tables of the same league. The projection runs **after** the finalization transaction, never inside it: that transaction is write-budgeted and already refuses oversized submissions. |
| `GP-03` | The club console no longer renders write controls the authority model refuses. A sunset banner existed at the layout level and the screens beneath it kept every Save button, so the page said read-only and then offered one. Controls now gate on the projected capability index rather than the role claim, which also means a league operator holding `league.team.manage` still sees them. |
| `GP-04` | Both result sheets resolve on any terminal outcome or a 20-second timeout, and render "sent for review" and "still processing" distinctly. They previously cleared `busy` only on a thrown error, so every non-official outcome the finalizer legitimately produces left the sheet hanging — with the decision already saved. |
| `GP-05` | The GoalPlace Index is computed hourly in `convergeLifecycle` from four measured ratios, and the league page shows the counts behind each. It was a stored constant; every league the platform created got the literal `45`, and the seeded leagues carried 797 to 882 in +17 steps. |
| `GP-06` | `server/notifications/notify.ts` is the one writer, with deterministic ids so a retried trigger is a no-op. Wired to finalization, reconciliation exceptions and confirmation-overdue escalation. Both fantasy `.add()` calls migrated. |
| `GP-07` | `awardedResult` provenance on a match and a season-scoped `pointsAdjustments` collection, both behind `league.result.enter` with a required reason and an audit entry. Applied as a final term after every match is counted, so the standings computation stays order independent. |
| `GP-08`, `GP-09` | `assertConfigMatchesProject()` refuses a build whose configuration names a different project than the one it is running against — see §11 for the first attempt at this and why it was wrong. Every deploy preflights its resolved project against `config/environments.json`. The reset scripts assert the same way. |
| `GP-11` | A missing scheduler credential returns 503 and logs, rather than a 401 indistinguishable from a bad secret. `/api/environment` reports which routes cannot authenticate. |
| `GP-12`, `GP-13` | Every function declares `maxInstances`; the payment callbacks are rate limited by IP and by intent id. |
| Phase 5 (part) | `readCollection` applies a default 500-document ceiling when a caller names none. `getLeagues`, `getSeasons`, `getFinalizations`, `getVerifications` and `getSponsors` took no limit at all, so each was a full-collection scan on every page view. A backstop, not a page size — paginating the surfaces that need it is separate work. |
| `GP-14`, `GP-15`, `GP-17` to `GP-22` | Scoring duplication removed, `uuid` pinned under `firebase-admin` and `gaxios` (prod audit clean), `firestore.rules` renamed `.superseded`, dead client writers deleted, the stale `athletePayees` comment corrected, the demo password env var de-prefixed with a guard test, `proxy.ts` compares in constant time. |

### Where the audit was wrong, and it matters

Three findings did not survive checking. Recorded because the report will be read again:

- **`GP-03`** said no sunset notice existed anywhere in the console. One did, at
  `src/app/team-admin/layout.tsx`, wrapping every page. The auditor checked
  `TeamConsoleHome.tsx`. The real defect was worse than described: the banner said read-only
  and the screens still rendered every write control.
- **`GP-11`** listed three routes as permanently unauthenticated-out. Only
  `/api/payments/reconcile` is — the two fantasy routes authenticate with
  `GOALPLACE_FANTASY_SCORING_SECRET`, which every deployed overlay backs with a Secret Manager
  reference. And `reconcilePaymentIntents` is deliberately undeployed, so nothing is currently
  broken by it.
- **`GP-21`** reported zero `aria-live` regions and reduced-motion honoured once. `sonner`
  renders `aria-live="polite"` for every toast, and `globals.css` has a comprehensive
  `prefers-reduced-motion` block. The focus-visible count missed a global rule in `@layer base`.

### The trap this pass hit

**Relative imports, again.** `leagueModel.ts`, `matchRecord.ts`, `status.ts` and `season.ts`
had never been in the Functions bundle. The standings projection pulled them in, and
`verify-bundle` failed the build on `require("@/lib/status")`. This is the same trap §6 already
records; it now applies to four more files, and the note is on each of them.

### Not done, and not doable from here

**`GP-02` — beta and production have no Firebase projects.** 24 `REPLACE_WITH_` value lines
remain across the two overlays, `config/environments.json` and `.firebaserc`. This needs a Google
account with billing. `docs/ENVIRONMENT_PROVISIONING.md` is the runbook; the readiness gate and
the deploy preflight both refuse until it is done, so a half-finished provisioning cannot ship.

Also still open: `GP-16` (enable App Check on demo first, so beta inherits a proven config
rather than being the first environment to enforce it), `GP-23` (image optimization awaits a
patched `sharp`), `GP-24` (unified audit read model), and Phase 5's bounded collection reads.

### Verification

`tsc` clean, `eslint` 0 errors and the same 8 pre-existing warnings, **1877 unit** tests
across 189 files (up from 1735/179), **166 Rules** (up from 155) and **29 integration**,
functions typecheck and build with no unresolved aliases, `npm audit --omit=dev` 0 findings,
`demo:validate` passing against a recomputed checksum.

`next build` also compiles: 124 static pages, no errors. The audit declined to run it rather
than overwrite an existing 2.4 GB `.next` during a read-only pass, which was the right call for
an audit and the wrong one for a change of this size.

One caveat worth recording: `src/rules/storage.rules.test.ts` has a case that uploads 16 MB to
the Storage emulator, and it timed out once inside a full `deploy:ready` chain while passing in
6.7s on its own, twice. It is timing-sensitive under load, pre-existing, and untouched by this
work — but a `deploy:ready` that fails there is very likely that flake rather than a
regression.

The audit could not run the Rules and integration suites — its environment could not reach the
emulator jar. This machine can: Java 21 and both jars are in `~/.cache/firebase/emulators`, so
`npm run test:rules` and `npm run test:integration` work here and both were run. The eleven new
Rules cases cover the two collections this pass added — that `standings` and `pointsAdjustments`
are publicly readable, and that neither a club nor its governing league can write, rescind or
delete either from a browser.


---

## 11. Demo rollout, 2026-08-29

The remediation in §10 was deployed to Demo. Three planes, each verified on its own revision.

| Plane | State |
|---|---|
| Firestore Rules | **Released** to `fg256` from `firestore.rules.next`, with indexes. Adds the `pointsAdjustments` block. One pre-existing index in the project is still absent from `firestore.indexes.json`; untouched, as before. |
| Cloud Functions | **All 12 updated.** Read back with `functions:list --json`: every one reports `TEAM_AUTHORITY_STAGE=retired`, `FINALIZER_MODE=enabled`, `FIELD_CAPTURE_MODE=enabled`, `LEAGUE_ENTRY_MODE=off`. |
| App Hosting | **`build-2026-08-30-003`**, from exact commit `68c44d2`. The live origin reports `environment: demo`, `finalizerMode: enabled`, `teamAuthorityStage: retired`. Two earlier attempts: `-002` succeeded, and the first failed — see below. |
| Standings projection | **Backfilled.** 8 seasons, **61 rows written, 60 stale removed**. |
| League index | **Recomputed.** 18 leagues, 12 correctly unrated (no fixtures). |

### The rollout that failed, and what it proved

The first `apphosting:rollouts:create` **failed at build**, on a commit whose `next build` passed
locally. The cause was this repo's own new gate: `apphosting.yaml` had been made a refusal
sentinel declaring `GOALPLACE_ENVIRONMENT: unconfigured`, and `next.config.ts` threw on it.

**The demo backend is itself un-overlaid.** It builds from `apphosting.yaml`. So the sentinel
failed the one backend that legitimately depends on the default.

This is worth recording rather than quietly fixing, because it *confirmed* GP-08's premise
while refuting its remedy. The audit was right that an un-overlaid backend inherits whatever
the base says — the demo backend is proof. It was wrong to conclude that the base should
therefore refuse to build, because "names no overlay" is not the same thing as "is
misconfigured", and the only backend that exists is in the first category.

What replaced it is narrower and catches more: `assertConfigMatchesProject()` refuses when the
project named by the configuration in force disagrees with the project the build is running
against. A beta backend inheriting demo's config declares `manifest-quasar-479416-s7` while
Cloud Build reports `goalplace-beta`, and the build stops — whether or not an overlay was
named. It skips when no ambient project is discoverable, because `GCLOUD_PROJECT` is absent for
`next dev`, a local build and CI, and failing closed there would break every build not running
on Google infrastructure.

`apphosting.yaml` is demo's configuration again, and a test now asserts the base and the demo
overlay agree on every declared variable.

### Two things the failure did not do

**No outage.** A failed App Hosting rollout leaves the previous build serving. `/api/health`
returned 200 throughout and `/api/environment` continued reporting
`fan22-build-2026-08-29-001`.

**No partial state.** Rules and Functions had already deployed successfully and are independent
of the App Hosting build. Nothing needed rolling back.

### Also fixed en route

`backup:firestore` could not back up demo. `demo` had been added to `Environment`, to
`CONFIRM_PHRASES` and to `buildProjectMap`, but `validate()` still hardcoded `staging` or
`production` — so the demo project could be MAPPED and never NAMED. That is why the most recent
backup was from 5 August: the safe operation was the one that did not work. The accepted list
is now derived from `CONFIRM_PHRASES`, so an environment cannot be accepted without a
confirmation phrase. Verified by taking the backup it unblocked: **13,124 documents, 328
collection files**, in `backups/firestore/demo/`.


### What the backfill found

`standings:rebuild:apply` wrote 61 rows and removed 60. The extra row is the point:
`season_football_01_2026` has **11 clubs on demo and 10 rows in the seeded standings**. A club
named *Samy* had been registered to the league after the seed was written, and the seeded
projection — maintained by nothing, which is GP-10 exactly — never gained a row for it. It now
sits at rank 11 with P0 Pts0, and the other ten reproduce the seeded values exactly.

The live league page reads `82 / 100` where the seed file computes `84`. Also correct: demo has
91 fixtures and 11 clubs against the seed's 90 and 10, so `rosterConfirmation` is 10 of 11
rather than 10 of 10. The number differs because the data differs, which is what a computed
index is supposed to do.

### One defect this rollout introduced, and closed

Between the App Hosting rollout and the index recomputation, the league page rendered three
blank rows under the GoalPlace Index heading. League documents are rewritten by the hourly
pass rather than by the deploy, so they still carried the old seven-key `indexSignals` shape,
and the new keys read as `undefined`.

`getGoalPlaceIndexSignals` now returns all four signals or none, so a partially-migrated league
shows no breakdown instead of a misleading one. `npm run league-index:rebuild` closes the
window directly rather than waiting up to an hour.

### Read back on the live origin

`/api/environment` now reports `schedulerAuth`, and it immediately earned its place:
`payment_reconciliation` reads **`configured: false`, `missingVariable:
GOALPLACE_RECONCILIATION_SECRET`**. That is GP-11 visible on the running deployment instead of
silent — the credential is declared on the calling side (`functions/src/index.ts`
`defineSecret`) and on no App Hosting overlay. `reconcilePaymentIntents` is deployed and will
keep getting 503s from that route until the secret is declared.

**Correction to §2 of this handoff.** It records `reconcileResultSubmissions` as "not deployed"
and `reconcilePaymentIntents` / `lockFantasyLineups` as "not deployed, and must stay that way".
All three were already live before this session — `functions:list` shows 12 functions, and has
since at least 2026-08-28. The document had drifted from the plane it describes, which is the
failure its own §0 warns about. This deploy updated all 12 rather than introducing any.
