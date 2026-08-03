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
| Single projector owning every index write | `designed` | **Does not exist.** Index documents are written ad hoc in at least three routes. |
| Server resolver returns canonical access | `implemented` | Returns **legacy** in both `legacy` and `compare` modes. `compare` is the code default. |
| `GOALPLACE_ACCESS_ENGINE_MODE` set explicitly | `designed` | No `apphosting.*.yaml` sets it. Every environment falls through to the `compare` default. |
| Divergence reporting | `implemented` | `console.warn` only. Not durable, not reviewable, not alertable. |
| Firestore Rules use canonical access | `designed` | Rules authorize via `leagues/teams.adminUserIds`. `accessIndex` appears only as its own read rule. |
| Platform Admin access desk on canonical data | `designed` | `/admin/access` reads and revokes legacy `teamAssignments`. |
| Capability checks share one implementation | `designed` | Two separate `hasCapability` implementations exist in unrelated files. |
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

| Check | Level | Evidence |
| --- | --- | --- |
| Full unit suite | `tested` | `npx vitest run` — 76 files, 772 tests passed. |

### Recorded previously, NOT re-verified in the current pass

These were reported against an earlier commit. Treat as stale until re-run.

| Check | Level | Evidence |
| --- | --- | --- |
| Deterministic projection tests | `tested` | Access, resolver and context route tests passed (9 tests). |
| Lint | `tested` | `npm run lint` passed. |
| Firestore/storage rules | `tested` | `npm run test:rules` passed 2 files, 83 tests, under Java 21. |
| Functions typecheck / build | `tested` | `npm run functions:typecheck` and `functions:build` passed. |
| App build | `tested` | `npm run build` passed, including `/api/access/context`. |
| Demo validation | `tested` | `npm run demo:validate` passed. |
| Security audit gate | `tested` | `npm run security:audit` passed with registered temporary exceptions. |
| Combined release gate | `tested` | `npm run deploy:ready` passed. |
| Demo compatibility report | `tested` | `npm run access:compat` — 1,068 assignments, 1,068 indexes, 0 blockers, 0 warnings. |
| Live manifest compatibility report | `verified` | Live report returned 0 blockers after the investor demo merge. Warnings limited to pre-existing partial demo records. |
| Live role smoke | `verified` | `reports/staging/role-auth-firestore-smoke-role_20260802224456_6ad0e51d.json`. |
| Live fantasy smoke | `verified` | `reports/staging/fantasy-auth-firestore-smoke-fantasy_20260802225113_a1b4f2fd.json`. |

### Not yet evidenced

| Check | Level | Blocking |
| --- | --- | --- |
| Single projector owns all index writes | `designed` | Stage B |
| Durable divergence records | `designed` | Stage A |
| Explicit access mode per environment | `designed` | Stage A |
| Canonical Platform Admin access desk | `designed` | Stage C |
| Rules authorize via `accessIndex` | `designed` | Stage C |
| Emulator denial matrix (revoked / suspended / expired / missing index / wrong scope / fan-as-operator) | `designed` | Stage C |
| Production startup guard on access mode | `designed` | Stage C |

## Remaining Phase 1 Work

**Phase 1 is not complete.** The previous revision of this document stated that the
Phase 1 audit blockers were complete while the resolver still returned legacy access,
Firestore Rules still authorized through `adminUserIds`, and the Platform Admin access
desk still managed legacy `teamAssignments`. That claim was wrong and has been removed.

Outstanding, in order: build the projector, route every mutation through it, persist
divergence, backfill and verify, then cut over Rules and server together per Stage C.
