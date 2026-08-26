# GoalPlace Operations Model V2: Handoff

**Purpose.** If the agent working on this stops mid-migration, another one picks it up from
this file alone. It records what is done, what is left, how to do it, and the traps.

**Last updated:** 2026-08-26
**Head:** `c119d68`, on `main`, pushed.
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

## 1. The migration is done. The canary is not.

Steps 1 to 7 of the method below all ran against the real Demo database
(`manifest-quasar-479416-s7`, database `fg256`) on 2026-08-26, and every gate exits 0.
**Step 8, the field capture canary, has not run.** That is the whole of what is left, plus
one scheduled function that must be fixed before it is wired.

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
| `npm run deploy:ready` | **exit 0.** 1423 unit, 155 rules, 26 integration |

All three gates were re-run **after** the deploys and still exit 0.

Evidence: `docs/evidence/operations-model-v2-c119d68.json`. Every count above is in it.

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

## 2. Deployed planes on demo, verified 2026-08-26

| Plane | State |
|---|---|
| App Hosting | **`build-2026-08-26-004`**, rolled out from `main` at `c119d68`. The live origin reports `environmentVersion: fan22-build-2026-08-26-004` **and `teamAuthorityStage: retired`**, so both the build and the stage are read back rather than inferred. Rollouts are `apphosting:rollouts:create --git-branch main`; automatic rollouts from GitHub do not work on this backend. |
| Firestore Rules | **released 2026-08-26** to `fg256`, with indexes. `hasLeagueOperatorCapability` narrowed to canonical spellings only. |
| Storage Rules | unchanged since the 2026-08-26 release; not re-released this session |
| Cloud Functions | **8 live.** `onMatchReportWritten` and `convergeLifecycle` both updated 2026-08-26. |
| `reconcileResultSubmissions` | **not deployed**, matching its pre-existing state |
| `reconcilePaymentIntents`, `lockFantasyLineups` | not deployed, and must stay that way |

### Activation gates, per source

The single `GOALPLACE_FINALIZER_MODE` was split on 2026-08-26. See section 5.

| Source | Variable | Demo value | Proven? |
|---|---|---|---|
| Bilateral V1 | `GOALPLACE_FINALIZER_MODE` | `enabled` | cloud-verified 2026-08-08 |
| Field capture | `GOALPLACE_FIELD_CAPTURE_MODE` | **`canary`, empty allowlist** | **never** |
| League post-match | `GOALPLACE_LEAGUE_ENTRY_MODE` | `off` | never |

`canary` with an empty allowlist refuses every match id. Field capture is **provably inert**
right now, which is why nothing can finalize by accident and also why the canary is still
outstanding.

> **Not independently read back.** The deployed function's environment variables were not
> queried. `gcloud` has no credentialed account on this machine and the Firebase CLI cannot
> show function env. The deploy log records that `functions/.env.manifest-quasar-479416-s7`
> was loaded and the update succeeded. **Behavioural proof waits on the canary.**

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

Datastore User is enough for drain, migration, rebuild and invariants. Deploys use the
Firebase CLI, which is separately logged in as `lucasmugi499@gmail.com`.

---

## 4. What is left

### 4.1 The field capture canary — the main outstanding item

`matchReports` is **empty on demo. Zero documents.** No field report has ever existed, so the
previously-armed trigger never fired and the hazard never landed. The first one anybody
creates is still the first one, and the gate is now closed around it.

Do it in this order:

1. **Choose two controlled fixtures before creating any report.** One clean, one deliberately
   contradictory. They need: complete registered squads, no existing official result, no
   competing result submission, and no fantasy competition — the first proof must not
   accidentally become a test of field capture plus legacy coexistence plus fantasy plus
   correction all at once.
2. **Allowlist the clean one:**
   ```
   GOALPLACE_FIELD_CAPTURE_CANARY_MATCH_IDS=<matchId>
   ```
   in `functions/.env.manifest-quasar-479416-s7`, then deploy **only**
   `firebase deploy --only functions:onMatchReportWritten`. Do not disturb the working V1
   finalizer.
3. **Drive the whole Field Manager workflow by hand:** link, PIN, check-in, lineup, clock,
   events, half time, second half, full time, attestation.
4. **Verify:** `npm run release:canary -- --match <id> --bad-match <id>`.
   Do not treat the exit code as the proof. Check the persisted graph: report `finalized`
   with the expected `reportVersion` and `eventDigest`; candidate with `source=field_capture`
   and `workflow=result_engine_v2`; **exactly one** `OfficialResultVersion`; the expected
   canonical event count; **exactly one** standings change; athlete projections only where
   evidence supports them; the Field Match Ops principal in the audit, not a synthetic user.
5. **Replay the trigger and re-run.** Every count must be identical: versions +0, events +0,
   standings +0, athlete stats +0, audit side effects +0. Idempotency must be *observed*, not
   merely unit-tested.
6. **Then the bad canary**, on a report that contradicts itself (attested 2-1, events
   reconstructing 3-1). Expect zero official records of any kind, one reconciliation
   exception, report status blocked. Repeat the bad trigger: still **one** exception, not two.
7. **Only then** set `GOALPLACE_FIELD_CAPTURE_MODE=enabled`. Demo only.

### 4.2 `sweepUnreportedMatches` — still not wired, and would be wrong if it were

It is written in `functions/src/matchReports.ts` and never exported from
`functions/src/index.ts`, so the staleness sweep does not run and `result_never_reported` is
never raised.

**Do not simply wire it. It was modelled against the real demo data on 2026-08-26 and it is
wrong.** Its only eligibility guard is `verificationStatus === 'verified'`. In the first page
of 200 matches alone it would have opened **5 false cases**:

- **4 matches in `disputed`** — including the very claims migrated in step 2 of this session.
  They were reported. They are in league adjudication right now. Calling them "never
  reported" is straightforwardly false, and it would bury the queue the case is meant to make
  readable.
- **1 match with `status: live`** — a fixture still in progress.

`MatchStatus` is `scheduled | live | completed | cancelled`. There is no `postponed` or
`abandoned` in the vocabulary at all, so "the match was called off" cannot currently be
expressed, and eligibility cannot be written correctly without deciding that first.

Before wiring, `isUnreportedAndStale` in `src/server/finalization/escalation.ts` needs to
answer: is this match in a state where completion was expected, has its grace window passed,
is there genuinely no report **and no other live result source**, and has it not been called
off. Also note `effectiveCapturePolicy` is `undefined` on every demo match, so the
`FIELD_REQUIRED` 3-day threshold is never taken and everything falls to the 7-day branch.

Its job is to **detect and surface**. It must never finalize anything or guess a score.

Wire it and deploy it as its **own** release, after the canary. Not bundled with it.

### 4.3 Smaller things

- **`apphosting.beta.yaml` and `apphosting.production.yaml` do not declare
  `GOALPLACE_TEAM_AUTHORITY_STAGE`,** so both would run at the `frozen` default. That is the
  correct state for environments that have not drained, and it must be a decision rather than
  an oversight when either is promoted. `apphosting.demo.yaml` was in the same position and
  was fixed: it is now declared in both demo files, and
  `scripts/lib/deploymentPlanes.test.ts` fails if they disagree.
- Storage rules were not re-released this session. They are unchanged, so this is
  bookkeeping, not a gap.
- Six of the eight deployed Functions still carry an older environment generation; only
  `onMatchReportWritten` and `convergeLifecycle` were redeployed. Neither builds projections
  nor finalizes, so this is drift rather than a defect — but a full `--only functions` deploy
  would align them.
- Firestore reports one index present in the project that is not in `firestore.indexes.json`.
  Pre-existing, not touched, and removing it needs `--force`.

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

Each of these was a real bug on this branch, not a hypothetical. The last five were found
this session.

| Trap | What happened |
|---|---|
| Firestore rejects `undefined` | Field capture events carry no `submittedByUserId`; the builders assigned it explicitly, so every real write would have thrown. The fake-db unit suite passed throughout. Omit keys, never assign undefined. |
| Path alias in the Functions bundle | `verify:bundle` fails the build. Everything under `src/kernel/**` and the shared server modules compile into Functions: **relative imports only.** |
| Score comparison is not enough | A goal reattributed between attestation and finalization leaves the total identical and changes whose career record it lands on. Hence the content digest. |
| Wrong rules file | `firebase.json` points at `firestore.rules.next` (1188 lines), not `firestore.rules` (302). |
| Guard budgets are shrink-only | `access:guard` fails when a budget is too high **or** too low. |
| Stale `functions/lib` | `verify:bundle` reads emitted output. `rm -rf functions/lib` before rebuilding after a tsconfig change. |
| Evidence that resets itself | The first generator overwrote its file on every run. It now merges. `--reset` is deliberate. |
| **One switch, three sources** | See section 5. A global flag armed an unproven pipeline. |
| **`getFirestore()` with no database id** | The drain, the straggler migration, the sunset invariants and the field capture canary all asked for `(default)`. **No GoalPlace project has a `(default)` database.** Here that fails loudly with `5 NOT_FOUND`; anywhere with an empty `(default)` every count reads zero and the drain prints `Safe to retire: YES`. A gate that passes by measuring nothing. Now resolved through `scripts/lib/firestoreTarget.ts`, and every script prints `project/database` beside its counts. |
| **The stage must be set on every runtime that projects** | `projectScopeIndex` reads `GOALPLACE_TEAM_AUTHORITY_STAGE` at the moment a projection is **built**, and two runtimes build them: the Next server on any assignment change, `convergeLifecycle` hourly. Rebuilding to `retired` while either still read `frozen` would have written team capabilities back one user at a time. `access:sunset-invariants` would have passed on the day and failed a week later with nothing having changed. Guarded by `scripts/lib/deploymentPlanes.test.ts`. |
| **Migration left the match record behind** | `matches.verificationStatus` is derived from the claim's status and every other transition carries it across. The straggler migration moved the claim to `disputed` and left the match reading `pending` — so the league was asked to adjudicate while every club, every table and the league's own queue was still told the result was merely awaiting an opponent. Found by inspecting the 18 real claims before migrating any of them, not by a test. |
| **The coverage gate could never pass** | `findLegacyCoverageGaps` asks whether the canonical model grants an operator anything. At `retired` every team bundle grants nothing, so all 60 legacy team assignments became permanent gaps and `--strict` failed by construction. The league loop above it already carried this exact reasoning and excluded team scope; the team loop did not. Worse than noisy: the report sent the operator to `backfill-assignments.ts`, which would have created canonical team assignments granting nothing — new issuance during a sunset, to close a hole that is the point of the sunset. |
| **The staleness sweep would raise false cases** | See section 4.2. It would call four matches under active league adjudication "never reported". |
| **The App Hosting overlay silently omitted the stage** | `apphosting.yaml` is the base and `apphosting.<environment>.yaml` overrides it when a backend is built with an environment name — and which file a backend reads is not visible from the CLI. `apphosting.demo.yaml` had no `GOALPLACE_TEAM_AUTHORITY_STAGE` at all, so "it is set in `apphosting.yaml`" was not a statement about what the runtime received. Both now declare it, the guard test requires agreement, and `/api/environment` reports the stage so it can be read back instead of reasoned about. |

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
| `npm run deploy:ready` | All 12 local gates |
| `npm test` | 1423 unit tests |
| `npm run test:rules` | 155 rules tests, needs emulator |
| `npm run test:integration` | 26 finalization tests against real Firestore |
| `npm run access:v1-drain` | The migration gate. Now prints the stranded ids and their age |
| `npm run access:migrate-v1` | Governed straggler migration. No bulk mode, on purpose |
| `npm run access:migrate:dry-run` / `:apply` / `:gate` | Projection rebuild |
| `npm run access:sunset-invariants` | Post-migration proof against stored documents |
| `npm run release:evidence` | Accumulating migration evidence, and the push gate |
| `npm run release:canary` | Verifies a field capture canary end to end, and the bad-report case |

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

### This session, in order

Ran the credentialed drain for the first time (18 blocking) → migrated all 18 stragglers one
at a time → drain to zero → retired team authority on both runtimes → rebuilt 1123
projections → sunset invariants green → deleted the compatibility shim → `deploy:ready` exit
0 → pushed → deployed Rules, Functions and App Hosting → re-ran all three gates against the
live database, still green.

**Next action:** the field capture canary. Section 4.1.

> Nothing about the canary has been proven. Field capture is inert, not verified. Those are
> different sentences and only one of them is true.
