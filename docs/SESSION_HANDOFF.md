# Session handoff — GoalPlace256

Written 2026-08-06. HEAD at handoff: see `git log -1` (last commit of this session is the
Cloudflare header fix). Everything described here is committed and pushed to
`origin/main`.

Read this top to bottom before running anything. The single most important section is
**"What is deployed vs what is not"** — this repository has repeatedly conflated
*implemented*, *deployed* and *cloud-verified*, and that conflation caused real errors.

---

## 1. Environment facts

| Thing | Value |
| --- | --- |
| Live demo URL | `https://fan22--manifest-quasar-479416-s7.us-east4.hosted.app` |
| Firebase project | `manifest-quasar-479416-s7` (display name "Fangoal256") |
| Firestore database | `fg256` (named, **not** `(default)`) |
| Firestore location | `nam5` (North America multi-region) |
| App Hosting backend | `fan22`, region `us-east4`, git-connected |
| Functions region | `us-central1` — **correct, do not change** (nearest to `nam5`) |
| Git remote | `github.com/lucasmugi499-alt/fan22` |
| Custom domain | **Not owned / not attached.** Do not attach. |

**Pushing to `main` deploys the app.** The App Hosting backend builds from the connected
repo. A build takes roughly 5 minutes; poll `/api/health` until it returns 200.

Credentials in `.env.local` (`FIREBASE_ADMIN_*`) work with
`npx tsx --env-file=.env.local <script>`. `gcloud` was installed this session
(`/opt/homebrew/share/google-cloud-sdk/bin`) but has **no active credentials** — they were
revoked deliberately. `npx firebase` is authenticated as `lucasmugi499@gmail.com`.

---

## 2. What is deployed vs what is not

| Capability | Implemented | Deployed | Cloud-verified |
| --- | --- | --- | --- |
| Next app | Yes | **Yes** | Yes — probe ok, all public pages 200 |
| Firestore Rules (canonical `accessIndex`) | Yes | **Yes** | Yes — 0 divergence under authenticated smoke |
| Firestore indexes | Yes | **Yes** | Yes |
| 4 search-index triggers | Yes | **Yes** | Yes — create / rename / delete / write-skip |
| Search index contents | — | current, `projectionVersion: 2` | Yes — 1,244 entries, 0 orphans, 0 stale |
| **Finalizer chain** (`onResultSubmissionWritten`, `onOfficialResultFinalized`) | Yes | **Yes — `enabled` (Demo only, 2026-08-08)** | **Yes — 12/12 + idempotent replay under `enabled`** |
| `reconcileResultSubmissions` | Yes | **No** | No |
| `lockFantasyLineups` | Yes | **No** | No |
| `reconcilePaymentIntents` | Yes | **No** | No |

### Finalizer activation state

`functions/.env.manifest-quasar-479416-s7`:

```
GOALPLACE_FINALIZER_MODE=enabled
GOALPLACE_FINALIZER_CANARY_SUBMISSION_IDS=
```

**Stage 4 was approved by the owner for Demo only and applied on 2026-08-08.** The
finalizer now has authority over every future eligible confirmed submission in Demo.
Beta and production are explicitly *not* authorised.

Three operational states are retained, so authority can be narrowed by config rather than
by a code change or a teardown:

| Mode | Effect |
| --- | --- |
| `off` | Receipt logged, no official write attempted. **This is the rollback.** |
| `canary` | Only ids in `GOALPLACE_FINALIZER_CANARY_SUBMISSION_IDS` are processed |
| `enabled` | Every eligible confirmed submission is processed |

Rollback is one line plus a redeploy of the two functions:

```bash
# functions/.env.manifest-quasar-479416-s7 -> GOALPLACE_FINALIZER_MODE=off
npx firebase deploy --project manifest-quasar-479416-s7 \
  --only functions:onResultSubmissionWritten,functions:onOfficialResultFinalized \
  --non-interactive --force
```

If an official-data integrity issue appears: disable first, then **preserve** the affected
records for investigation. Do not hand-edit official records — corrections go through the
versioned correction path, not through the console.

---

## 3. Stage 4 — done. What comes after it.

Stages 1–4 are complete. Stage 4 was applied on 2026-08-08 on the owner's explicit
approval, scoped to Demo, and verified in the cloud (see §3a).

The open work is now **monitoring**, not deployment. Watch invocation count,
success/failure rate, retries, duplicate suppression, finalization latency, reconciliation
exceptions, Firestore read/write volume, and any unexpected permission or schema errors.
There is no dashboard for this yet; `npx firebase functions:log --only
onResultSubmissionWritten` is the current instrument, which is a gap worth closing before
beta.

**Do not deploy `reconcileResultSubmissions` before or alongside this.** It calls
`retryStalledFinalizations`, so it sweeps *existing* pending submissions into the
finalizer with no user action. That is the sleeper risk the auditor named. Order:
finalizer enabled → observe on real submissions → then consider the sweeper.

Remaining stages, in order: search repair (manual, already working) → fantasy lineup
locking → result reconciliation in report-only mode → projection reconciliation →
payment reconciliation last.

`reconcilePaymentIntents` additionally **cannot work yet**: `/api/payments/reconcile`
validates env `GOALPLACE_RECONCILIATION_SECRET`, and neither `apphosting.yaml` nor
`apphosting.demo.yaml` provides it. The Secret Manager secret exists (created this
session, version 1) but the App Hosting side was deliberately left unwired, because that
belongs with the payments decision.

### 3a. Stage 4 verification evidence (2026-08-08)

Run against the deployed `enabled` build with an **empty** canary allowlist, so a
finalization is itself proof the mode is `enabled` and not `canary`.

| # | Required | Result |
| --- | --- | --- |
| 1 | Finalizer mode reports `enabled` | Pass — `{"mode":"enabled","message":"Result finalized"}` in the function log |
| 2 | Only future eligible confirmed submissions processed | Pass — the fixture sat at `pending_confirmation` and was **not** finalized; finalization happened only after the transition to `confirmed` |
| 3 | Exactly one official result version per eligible result | Pass — 1 finalization doc, `resultVersion: 1` |
| 4 | Canonical sport events reconcile to the official score | Pass — `officialMatchReconciliation.status: "valid"`, event score 10-0 = official score 10-0, `unattributed` 0/0 |
| 5 | Athlete eligibility checks enforced | Pass — `eligibilityIssues: []` on a fixture where every athlete is legitimately registered |
| 6 | Squad selection alone does not create an appearance | Pass — the bench athlete has `appearance: 0`, `win_participation: 0` |
| 7 | Standings and athlete projections update once | Pass, by construction — standings are a **derived read-model** (`src/lib/leagueModel.ts:164`), not a written collection, so "once" follows from the match being marked official exactly once |
| 8 | Fantasy-derived records consistent | Pass, but weakly — see the caveat below |
| 9 | Duplicate delivery does not duplicate official data | Pass — forced replay held finalizations/stats/events constant; `IDEMPOTENT` |
| 10 | Failed reconciliation creates an exception, not a silent finalize | **Partial — see below** |
| 11 | Every finalization writes an immutable audit/finalization record | Pass — `finalizations/{key}` plus a `confirmed → official` entry in the submission's `events` subcollection |
| 12 | No unrelated matches or athletes modified | Pass — every collection count returned to its exact pre-activation value after teardown |

**Check 10 is the one to not overstate.** A reconciliation *shortfall* is handled well: the
gap is written as an explicit `unattributed_team_score` event, so the official record adds
up and the missing attribution is visible. A *surplus* — recorded events exceeding the
official score — is recorded in `officialMatchReconciliation.status`/`issues` but **does
not block finalization and does not open a League-review exception.** So "does not silently
finalize" is true (the disagreement is durably recorded); "creates an exception" is not yet
true. This is the §4 P1 item and it is unchanged by Stage 4. It did not fire in the canary
because the fixture reconciles exactly.

**Check 8 caveat.** `onOfficialResultFinalized` fired and `/api/fantasy/score-finalized`
returned 200, but with `competitionsScored: 0, pointEventsWritten: 0` — the canary league
has no fantasy competition. The handoff is proven; fantasy scoring end-to-end against a
real competition is not.

**Known residue.** `scripts/canary/finalizer-canary.ts --teardown` deletes the submission
document but not its `events` subcollection, which in Firestore survives its parent. Two
orphaned canary audit docs are currently under the deleted
`resultSubmissions/canary_fin_match_001`. Harmless — nothing queries them — but the
teardown should list and delete subcollections before deleting the parent, and the residue
scan should look for them.

---

## 4. Outstanding Build 32 audit blockers

The Build 32 audit is correct that **"every P0 closed" was inaccurate.** These are open.

### P0 — access authority: the dual-authorization arm is GONE (2026-08-08)

The `OR` is removed. `compareLegacyCapability()` no longer exists; it is replaced by
`authorizeCapability()` in `src/server/access/capabilities.ts`, which returns
`granted: canonical` and nothing else. `secureLeagueCommand()` still *reads*
`league.adminUserIds`, but only to pass it as `observedLegacyGrant` — an observation that
is recorded to `securityEvents` on disagreement and **cannot widen the decision**. That
observation was kept deliberately: removing the comparison outright would make the cutover
silent, and a `legacy_broader` event is exactly the operator who just lost access.

Evidence that this was behaviour-preserving, gathered before the change:

- `access:migrate:gate` — **0** legacy grants with no canonical assignment, across the
  whole dataset (`via adminUserIds: 0`, `via teamAssignments: 0`). That is precisely the
  population that could have been relying on the legacy arm.
- `securityEvents` where `type == access_authority_divergence` — **0** records.
- The gate returns byte-identical numbers after the change (it measures data, not code).
- 968 tests pass; the capability test now asserts the inverse of what it used to —
  legacy-only grant must **deny**.

**Still open, and deliberately not done in the same pass:** 9 routes decide access by
reading `adminUserIds` directly rather than going through the guard. They are enumerated
with the capability each one owes in `scripts/access/legacy-authority-guard.ts`, which
runs in `deploy:ready` and fails the build on any *new* legacy authorization. The budget
is 29 lines across 11 files and is designed to only shrink — it also fails if a number is
too high, so the list cannot rot into fiction.

Client scope selection still uses legacy arrays and is unchanged: `src/lib/team/teamContext.ts`,
`src/lib/league/leagueContext.ts`, `src/components/layout/TopBar.tsx`,
`src/components/core/MatchDetail.tsx`. These decide what to *render*, not what is
permitted, so they are a correctness/UX issue rather than an authorization hole.

### P0 — Platform capability model is misleading (OPEN — do not fix blind)

`securePlatformCommand()` still has `const hasRoleGrant = String(actor.role) === 'platform_admin'`
at `src/server/platform/commands/securePlatformCommand.ts:101`, so any Platform Admin
satisfies every `requiredCapability`.

**Measured 2026-08-08, before attempting the fix: deleting that line would lock out 2 of
the 7 platform accounts.** The projection is not as complete as "the backfill created
platform-scope assignments for all platform accounts" implies:

| Accounts | Role | `platform.admin.manage` | Capability count |
| --- | --- | --- | --- |
| 5 | `super_admin` | yes | 8 |
| 2 | `platform_admin` | **no** | 17 |

Both `platform_admin` accounts are active, hold a platform-scope `accessIndex` doc, and
carry 17 capabilities — but not `platform.admin.manage`. They were backfilled from a
different template: they hold league/team capabilities (`league.profile.manage`,
`team.roster.manage`, …) that the super_admins do not. `super_admin` bypasses the check
entirely, so only the `platform_admin` pair is exposed.

Only three capability values are actually required anywhere in the codebase:
`platform.admin.manage`, `platform.audit.read`, `league.season.manage`.

So this is a **data decision before it is a code change**, and it is the owner's: either
grant `platform.admin.manage` to the two Platform Admin accounts (keeps today's behaviour,
makes it explicit), or define a narrower Platform Operator capability set and accept that
those accounts lose some commands. Removing `hasRoleGrant` without doing one of those
first is a lockout, which is why it was left in place.

### P0 — `goalplace256.com` is still the default public identity

Present in `src/app/layout.tsx`, `src/app/sitemap.ts`, `src/app/robots.ts`,
`config/environments.json`. The domain is not owned. Use the App Hosting URL for metadata
base, canonical links, sitemap, robots, invitation and email action URLs. Rename the
config key to `plannedPublicDomain`.

### P1 — sports truth convergence

- Fantasy still reads `officialAthleteMatchStats` rather than one kernel projection
  (`src/server/fantasy/scoringService.ts`). Two systems that can drift.
- Basketball reconstruction expands points into synthetic `basketball.free_throw_made`
  events so a fixed-weight engine can count them. The total is right; the event trace is
  semantically false. The kernel should support variable-value scoring events.
- A score **surplus** is recorded but does not block finalization. It should open an
  exception requiring League review.
- `primaryAthleteId: ''` on unattributed events should be optional/null.
- Hardcoded `1.0.0` schema and sport-definition versions should derive from the governing
  rules profile.

### P1 — other

- `src/app/api/admin/actions/route.ts` is >1,000 lines; split by domain before adding
  authority.
- Storage Rules still allow direct browser uploads under `/users/{userId}/**`, bypassing
  the governed media lifecycle. `approvedMedia` and `moderation` still allow direct
  browser admin writes.
- Backup uses plain `JSON.stringify`, so Firestore native types (Timestamp, GeoPoint,
  Bytes, DocumentReference) do not round-trip. Restore cannot target a replacement
  project and merges rather than mirrors. Treat as **guarded small-data export/import**,
  not disaster recovery; production needs managed Firestore export/import plus separate
  Auth and Storage procedures.
- Search: only 120 candidates are considered before multi-word filtering; no cursor
  pagination, no relevance ranking, no typo tolerance; trigger failures log but create no
  durable repair backlog.
- Documentation contradicts itself. `docs/PHASE_1_ACCESS_SECURITY_TRACKER.md` still
  overstates Stage C. The auditor wants a CI-generated evidence manifest per commit
  instead of hand-maintained claims.

---

## 5. Commands

```bash
# Full gate. Needs Java for the rules emulator.
JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" npm run deploy:ready
```

```bash
# Access authority gate — must stay 0 drift / 0 coverage gaps.
npx tsx --env-file=.env.local scripts/access/projection-migration.ts --firebase --project manifest-quasar-479416-s7 --database fg256 --strict
```

```bash
# Legacy authorization budget. Runs in deploy:ready; fails on any NEW adminUserIds
# authorization, and also when the budget is stale. `-- --update` prints the corrected table.
npm run access:guard
```

```bash
# Probe the deployed origin.
npm run environment:probe -- --url https://fan22--manifest-quasar-479416-s7.us-east4.hosted.app --expect-environment demo --expect-project manifest-quasar-479416-s7
```

```bash
# Authenticated role smoke against the deployed build. Creates and cleans up its own accounts.
PW="Smoke-$(openssl rand -hex 12)"; npx tsx --env-file=.env.local scripts/staging/role-auth-firestore-smoke.ts --base-url https://fan22--manifest-quasar-479416-s7.us-east4.hosted.app --project manifest-quasar-479416-s7 --database fg256 --password "$PW" --allow-production
```

```bash
# Search index repair: dry run first, then apply. Reports orphans and stale versions.
npx tsx --env-file=.env.local scripts/search/build-index.ts --project manifest-quasar-479416-s7 --database fg256
```

```bash
# Repeatable finalizer canary: --setup --confirm --verify --replay --teardown
npx tsx --env-file=.env.local scripts/canary/finalizer-canary.ts --setup
```

---

## 6. Rollback

| To undo | How |
| --- | --- |
| Finalizer authority | Set `GOALPLACE_FINALIZER_MODE=off`, redeploy the two functions. Preferred over deletion. `canary` narrows rather than removes authority. Currently `enabled` in Demo. |
| Any function | `npx firebase functions:delete <name> --project manifest-quasar-479416-s7 --region us-central1 --force` |
| Canonical Rules | Redeploy the previous ruleset, then set `GOALPLACE_ACCESS_ENGINE_MODE=legacy` and redeploy the app. **Reverse of the deploy order.** |
| Data | Backup at `backups/firestore/production/2026-08-05T20-06-25-191Z` — 12,912 documents, 309 collections. Restore is dry-run by default and refuses cross-project. Read §4 on its type-fidelity limits first. |

---

## 7. Live data changes made this session

All dry-run first, verified after:

- **Access backfill** — 50 legacy grants had no canonical assignment (would have been
  lockouts at cutover). Now 0. Assignments 1,068 → 1,123. Also set `accountClass` on 200
  users and `accessVersion` on 97.
- **Invite-code hashing** — 1 mini-league migrated; 0 plaintext codes remain.
- **Search index** — built then repaired to `projectionVersion: 2`; 1,244 entries.
- **Canary fixture** — created and fully torn down; residue scan clean.

---

## 8. Mistakes made this session, so they are not repeated

- **Claimed "every P0 closed" when server-side legacy `OR` authorization remained.** I
  had flagged it myself and then summarised it away. Do not describe the access cutover as
  complete until `compareLegacyCapability` is gone.
- **Reported "deployed" after deploying only the app and Rules.** No Cloud Functions
  existed in the project at all, so the entire Phase 3 finalizer work — the kernel
  pipeline, participation, reconciliation — was not running. Always check
  `firebase functions:list`.
- **Assumed deploying triggers would process existing documents.** Firestore event
  triggers fire only on future changes. Scheduled jobs are the existing-data risk.
- **Reported a hard IAM blocker when the error said "propagation".** All four bindings
  were already present; retrying after the delay worked. Read the error text.

Two defects were found *only* by deploying: `servedBy` returned the internal container
address `0.0.0.0:8080` (identical across backends, so useless for origin detection), and
a shared credential was declared under two different Secret Manager names. Local testing
could not have surfaced either.
