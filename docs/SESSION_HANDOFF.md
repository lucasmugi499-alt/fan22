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
| **Finalizer chain** (`onResultSubmissionWritten`, `onOfficialResultFinalized`) | Yes | **Yes — INERT** | **Yes — canary passed** |
| `reconcileResultSubmissions` | Yes | **No** | No |
| `lockFantasyLineups` | Yes | **No** | No |
| `reconcilePaymentIntents` | Yes | **No** | No |

### Finalizer activation state

`functions/.env.manifest-quasar-479416-s7`:

```
GOALPLACE_FINALIZER_MODE=canary
GOALPLACE_FINALIZER_CANARY_SUBMISSION_IDS=
```

Mode `canary` with an **empty allowlist** means deployed and provably writing nothing.
Proven, not assumed: a submission was moved to `confirmed` with the allowlist empty and
produced zero finalizations plus an explicit
`"Finalization suppressed by activation mode" / "not_in_canary_allowlist"` log line.

---

## 3. The immediate next step: Stage 4

The auditor approved a staged activation. Stages 1–3 are done. **Stage 4 requires the
owner's explicit go-ahead** and had not been given at handoff.

Stage 4 is:

```bash
# edit functions/.env.manifest-quasar-479416-s7 -> GOALPLACE_FINALIZER_MODE=enabled
npx firebase deploy --project manifest-quasar-479416-s7 \
  --only functions:onResultSubmissionWritten,functions:onOfficialResultFinalized \
  --non-interactive --force
```

Then monitor invocations, failures, retries, finalization latency and reconciliation
exceptions.

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

---

## 4. Outstanding Build 32 audit blockers

The Build 32 audit is correct that **"every P0 closed" was inaccurate.** These are open.

### P0 — access authority is still split (external-beta blocker)

Firestore Rules are canonical. **Server routes are not.** Because they use the Admin SDK,
Rules cannot correct them.

- `src/server/access/capabilities.ts` — `compareLegacyCapability()` returns
  `granted: input.legacyGranted || canonical`. That is live dual authorization. It was
  built deliberately as the Stage A shadow mechanism and never removed.
- `src/server/platform/commands/securePlatformCommand.ts` — `secureLeagueCommand()`
  reads `league.adminUserIds` and feeds it to the above.
- Legacy checks also remain in: attendance-token creation, result corrections, challenge
  transitions, support-need completion, support-need review, athlete creation, fantasy
  admin, parts of `admin/actions`.
- Client scope selection still uses legacy arrays: `src/lib/team/teamContext.ts`,
  `src/lib/league/leagueContext.ts`, `src/components/layout/TopBar.tsx`,
  `src/components/core/MatchDetail.tsx`.

**Fix:** delete `compareLegacyCapability` from live authorization; make every server
decision `account class + active canonical assignment + exact scope + capability`;
`adminUserIds` keeps zero authority. Add a CI rule failing on new authorization use of
legacy fields.

Useful context: divergence has measured **0** on live data since the backfill, so removing
the legacy arm should be behaviour-preserving. Verify with `npm run access:migrate:gate`
before and after.

### P0 — Platform capability model is misleading

`securePlatformCommand()` has `const hasRoleGrant = String(actor.role) === 'platform_admin'`,
so any Platform Admin satisfies every `requiredCapability`. Pick one honest model —
capability-scoped Platform Operators (recommended) or a documented broad role — and
implement it.

Note: this session's backfill already created platform-scope `accessAssignments` for all
platform accounts, so the capability projection exists to enforce against.

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
| Finalizer authority | Set `GOALPLACE_FINALIZER_MODE=off`, redeploy the two functions. Preferred over deletion. |
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
