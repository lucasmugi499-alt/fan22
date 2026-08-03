# Phase 1 Access Security Tracker

## Status Vocabulary

Every row below uses one of these levels. Nothing may be described as "complete".
A claim may only carry a level it has actually reached.

| Level | Meaning |
| --- | --- |
| `designed` | The approach is agreed and written down. No code. |
| `implemented` | Code exists. Nothing depends on it in a running path yet. |
| `connected` | Production code paths actually call it. |
| `tested` | Automated tests cover it locally (unit and/or emulator). |
| `deployed` | It is running in a deployed environment. |
| `verified` | Proven in the deployed environment by authenticated end-to-end evidence. |

A component can be `implemented` and still be authoritative over nothing. That is
precisely the condition Phase 1 exists to end, so the distinction is load-bearing.

## Approved Identity Decision

GoalPlace256 targets the fixed account-class model approved for Phase 1:

- `fan`: public registration, fantasy, support, feed activity, follows, discovery, and fan notifications.
- `athlete`: invitation or profile claim only, Career Passport, performance records, support needs, challenges, and athlete notifications.
- `organization_operator`: invitation or approved league-application onboarding only. This account class may hold multiple scoped league/team/staff assignments.
- `platform_operator`: hardened platform governance accounts for Platform Admin, Super Admin, trust, finance, support, and system operations.

Fan accounts cannot become Team Admin or League Admin accounts. Athlete accounts cannot become organization operators. Platform operators cannot participate in fan or ordinary organization experiences. The same human may hold separate accounts with different verified emails and an optional internal `personId`, but sessions, notifications, history, audit trails, and permissions remain separate security principals.

Within an Organization Operator account, scoped assignment switching is allowed. For example, one operator account may be League Admin for one league, Team Admin for one team, and Results Reporter for another team.

**Phase 1 does not change this model.** It is an authorization convergence project
*inside* the existing account classes. Fan and operator identities are never merged.

## Current Authority Reality

This is the honest state of the system as of the Build 31 audit.

| Concern | Level | Reality |
| --- | --- | --- |
| Canonical `accessAssignments` model | `implemented` | The model, capabilities and permission bundles exist and are correct. |
| Deterministic `accessIndex` projection | `implemented` | `buildAccessIndexDocuments` is deterministic and tested — but it is not the only writer. |
| Single projector owning every index write | `tested` | `src/server/access/projector.ts` is the sole writer. The three ad hoc write sites are gone. |
| Server resolver returns canonical access | `implemented` | Returns **legacy** in both `legacy` and `compare` modes. `compare` is the code default. |
| `GOALPLACE_ACCESS_ENGINE_MODE` set explicitly | `tested` | All four App Hosting configs pin it. Production preparation fails on missing/`legacy`/`compare`. |
| Divergence reporting | `tested` | Durable `securityEvents` records, deduplicated per (user, scope, capability, kind) with an occurrence count. |
| Firestore Rules use canonical access | `designed` | Rules authorize via `leagues/teams.adminUserIds`. `accessIndex` appears only as its own read rule. |
| Platform Admin access desk on canonical data | `designed` | `/admin/access` reads and revokes legacy `teamAssignments`. |
| Capability checks share one implementation | `tested` | `src/server/access/capabilities.ts`. The three duplicates are deleted. |
| Platform command capability gate | `connected` | `securePlatformCommand` does read canonical `accessIndex` capabilities. |
| Upload authorization capability gate | `connected` | `uploads/session` does read canonical `accessIndex` capabilities. |

**Consequence:** the platform presents a modern scoped-assignment architecture while
still authorizing most operations from legacy arrays. Revoking a canonical assignment
does not reliably remove access, and updating a legacy array does not reliably grant it.

## Approved Transition — Do Not Shortcut

A live `legacy OR canonical` rule was considered and **rejected**. It would prevent
lockouts but preserve stale privilege: a user whose canonical assignment was revoked
would stay authorized through an unsynchronized `adminUserIds` entry. Failing open on
revocation is worse than a visible migration error.

### Stage A — Legacy live, canonical shadow

- Firestore Rules keep the current authority.
- The server computes both legacy and canonical decisions.
- Every divergence is written to a durable server-owned `securityEvents` record.
- No canonical rule authorization yet.

### Stage B — Repair and verify

- One deterministic projector owns every `accessIndex` write.
- Every assignment mutation routes through it.
- Backfill canonical assignments and indexes; run drift detection; repair.
- Verify all demo users and organization scopes.
- Reach zero blocking divergence.
- Break-glass and repair paths must be operational **before** Stage C, because after
  cutover there is no legacy fallback.

### Stage C — Canonical cutover

- Server flips to `assignments` first (fastest rollback), then Rules flip to
  deterministic `accessIndex` lookups. Rollback runs in reverse.
- `adminUserIds` and `teamAssignments` become display/migration fields only.
- No authorization `OR` is retained.

### Stage D — Soak, then remove legacy

- Monitor denials, projection drift, invitation failures, cross-scope denials.
- Remove legacy authorization code only after the approved soak period.

### Required mode configuration

| Environment | Mode |
| --- | --- |
| Demo during migration | `compare` |
| Demo after approved cutover | `assignments` |
| Beta | `assignments` |
| Production | `assignments` |

Production deployment must **fail** if the mode is missing, `legacy` or `compare`.

## Rollback

1. Set `GOALPLACE_ACCESS_ENGINE_MODE=legacy`.
2. Redeploy the app.
3. The trusted endpoint returns existing `accessIndex` documents only.
4. Demo mode is unaffected because it does not call the trusted endpoint.

No destructive data migration is included in Phase 1A.

## Evidence

Evidence is only valid for the commit that produced it. Re-run before relying on a row.

### Re-verified in the current pass

Each command was run separately; results are its own, not inferred from another.

| Check | Level | Evidence |
| --- | --- | --- |
| Lint | `tested` | `npm run lint` — clean, 0 warnings. |
| Typecheck | `tested` | `npx tsc --noEmit` — 246 errors, all in `.test.ts`, identical to the pre-change baseline. 0 in production source. |
| Full unit suite | `tested` | `npx vitest run` — 80 files, 826 tests passed. |
| Firestore/storage rules | `tested` | `npm run test:rules` — 2 files, 87 tests, Java 21. |
| Functions typecheck / build | `tested` | Both exit 0. |
| App build | `tested` | `npm run build` — compiled successfully. |
| Demo validation | `tested` | `npm run demo:validate` passed. |
| Access compatibility | `tested` | `npm run access:compat` — 1,068 assignments, 1,068 indexes, 0 blockers, 0 warnings. |
| Projection migration dry-run (bundled) | `tested` | 1,068 scopes, 0 drift. Self-consistent by construction — proves only tool/runtime agreement. |
| Projection migration dry-run (**live demo**) | `verified` | `manifest-quasar-479416-s7/fg256` — 1,509 users, 1,068 assignments, 1,068 indexes, **0 drift** in all three kinds. |
| Legacy coverage (**live demo**) | `verified` | **50 legacy grants have no canonical assignment.** See below. |
| Live compatibility report | `verified` | 0 blockers, **350 warnings**: 120 `legacy_principal_without_assignment`, 200 `missing_account_class`, 30 `operator_missing_access_version`. |
| Combined release gate | `tested` | `npm run deploy:ready` — exit 0. |

### Recorded previously, NOT re-verified in the current pass

These were reported against an earlier commit. Treat as stale until re-run.

| Check | Level | Evidence |
| --- | --- | --- |
| Live manifest compatibility report | `verified` | Live report returned 0 blockers after the investor demo merge. Warnings limited to pre-existing partial demo records. |
| Live role smoke | `verified` | `reports/staging/role-auth-firestore-smoke-role_20260802224456_6ad0e51d.json`. |
| Live fantasy smoke | `verified` | `reports/staging/fantasy-auth-firestore-smoke-fantasy_20260802225113_a1b4f2fd.json`. |

### Stage A and Stage B — delivered

| Check | Level | Evidence |
| --- | --- | --- |
| Single projector owns all index writes | `tested` | 18 projector tests. No `accessIndex` write outside `projector.ts` remains. |
| Projection deletes rather than empties | `tested` | An empty document would still satisfy `exists()` in Rules. |
| Durable divergence records | `tested` | `securityEvents`, per scope and per capability, with `legacy_broader` called out. |
| One shared capability resolver | `tested` | 11 capability tests. |
| Explicit access mode per environment | `tested` | 8 environment tests; demo `compare`, beta/production `assignments`. |
| Production guard on access mode | `tested` | `assert-clean` and `environment:prepare:production` both reject non-`assignments`. |
| Migration dry-run / repair / drift tooling | `tested` | `npm run access:migrate:dry-run`; demo run reports 1,068 scopes, 0 drift. |

### Not yet evidenced

| Check | Level | Blocking |
| --- | --- | --- |
| **50 uncovered legacy grants closed** | `designed` | **Stage C blocker.** Each is a live lockout. |
| **200 users given an explicit `accountClass`** | `designed` | **Stage C blocker.** Account class is currently inferred from the legacy role being retired. |
| Break-glass path proven working | `designed` | **Stage C prerequisite.** After cutover there is no legacy fallback. |
| Canonical Platform Admin access desk | `designed` | Stage C |
| Rules authorize via `accessIndex` | `designed` | Stage C |
| Emulator denial matrix (revoked / suspended / expired / missing index / wrong scope / fan-as-operator) | `designed` | Stage C |
| `secureLeagueCommand` legacy arm removed | `designed` | Stage C |

## Remaining Phase 1 Work

**Phase 1 is not complete.** The previous revision of this document stated that the
Phase 1 audit blockers were complete while the resolver still returned legacy access,
Firestore Rules still authorized through `adminUserIds`, and the Platform Admin access
desk still managed legacy `teamAssignments`. That claim was wrong and has been removed.

Stage A and Stage B are built and tested locally. Outstanding before Stage C:

1. Run the migration dry-run against the live demo database and drive drift to zero.
2. Prove the break-glass and repair paths against live data — after cutover there is no
   legacy fallback, so these cannot be left until the soak.
3. Rebuild `/admin/access` on canonical assignments.
4. Add the emulator denial matrix, then switch Rules to deterministic `accessIndex`
   lookups.
5. Remove the legacy arm from `secureLeagueCommand`.

### Live measurement — Stage C would currently lock out 50 grants

The live demo database (`manifest-quasar-479416-s7/fg256`) holds **17 leagues and 100
teams**, but only **6 canonical `league_admin` and 60 canonical `team_admin`**
assignments. Measured on 2026-08-03:

| Direction | Result |
| --- | --- |
| Projection matches assignments (drift) | **0** — canonical side is internally clean |
| Legacy grants with no canonical assignment | **50** (10 league, 40 team, 23 distinct users) |

The drift report and the coverage report answer opposite questions, and only both
together gate the cutover:

- **Drift** finds privilege that should be gone but survives. Currently zero.
- **Coverage** finds privilege that should remain but has no canonical basis. Currently
  50 — every one an active operator who works today and stops working the moment Rules
  stop reading `adminUserIds`.

All 23 accounts exist and are active. None has an explicit `accountClass`; the resolver
infers it from the legacy `role` field, which is the field this migration retires. The
live compatibility report shows the same shape at wider scope: 200 users with no
`accountClass` and 120 operator principals with no assignment at all.

**`--apply` cannot fix this.** Repair rebuilds projections from assignments; where no
assignment exists there is nothing to project. The assignments must be created first,
which is a data decision, not a mechanical one.

An earlier revision of this tracker recorded the live compatibility report as "0
blockers ... warnings limited to pre-existing partial demo records". The blocker count
was accurate; the characterisation of the warnings was not.

### A live `legacy OR canonical` check already exists

`secureLeagueCommand` authorizes a league operator when **either** a legacy
`adminUserIds` entry **or** a canonical capability allows it. That is the pattern this
migration rejects, already running in production — server-side rather than in Rules, but
with the same failure mode: a revoked canonical assignment still authorizes through a
stale array. It is retained for Stage A only, and now records every disagreement. Its
`legacy_broader` events are the cutover gate. It must lose the legacy arm in Stage C.
