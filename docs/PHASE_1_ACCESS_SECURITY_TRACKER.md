# Phase 1 Access Security Tracker

## Approved Identity Decision

GoalPlace256 now targets the hybrid identity model approved for Phase 1:

- A normal human account keeps fan capability by default.
- League, team, athlete, and guardian authority comes from scoped assignments.
- `primaryPersona` is a navigation preference only.
- Platform Admin and Super Admin remain dedicated hardened operator accounts.

This means fan behavior must survive when a person also receives a league, team, or athlete assignment. Assignment records decide authority; the profile role must not be treated as the source of scoped power.

## Phase 1 Rollout Modes

`GOALPLACE_ACCESS_ENGINE_MODE` controls the migration:

- `legacy`: return the existing `accessIndex` projection.
- `compare`: compute assignment-derived access and legacy projection, log divergences, but return legacy projection.
- `assignments`: return assignment-derived access.

Default mode is `compare`. In compare mode, the system deliberately avoids granting additional access from assignment disagreements until projections are validated.

## Phase 1A Scope

This slice implements the first migration footing:

- Server-side trusted access resolver.
- `GET /api/access/context` for authenticated users.
- Real client sessions load scoped access from the trusted endpoint.
- Demo sessions continue using local mock access indexes.
- Deterministic assignment projection with sorted indexes, roles, capabilities, and assignment IDs.
- Divergence logging between legacy and assignment projections in compare mode.

## Rollback

If Phase 1A causes an access-context issue:

1. Set `GOALPLACE_ACCESS_ENGINE_MODE=legacy`.
2. Redeploy the app.
3. The trusted endpoint will return existing `accessIndex` documents only.
4. Demo mode is unaffected because it does not call the trusted endpoint.

No destructive data migration is included in Phase 1A.

## Evidence

| Check | Status | Evidence |
| --- | --- | --- |
| Deterministic projection tests | Pass | `npm test -- src/lib/auth/access.test.ts src/server/access/resolver.test.ts src/app/api/access/context/route.test.ts` passed 9 tests. |
| Trusted context route tests | Pass | `npm test -- src/lib/auth/access.test.ts src/server/access/resolver.test.ts src/app/api/access/context/route.test.ts` passed 9 tests. |
| Full unit suite | Pass | `npm test` passed 60 files and 695 tests. |
| Lint | Pass | `npm run lint` passed. |
| Firestore/storage rules | Pass | `JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" npm run test:rules` passed 2 files and 81 tests. |
| Functions typecheck | Pass | `npm run functions:typecheck` passed. |
| Functions build | Pass | `npm run functions:build` passed. |
| App build | Pass | `npm run build` passed, including `/api/access/context` in the production route map. |
| Demo validation | Pass | `npm run demo:validate` passed. |
| Security audit gate | Pass | `npm run security:audit` passed with registered temporary exceptions. |
| Combined release gate | Pass | `JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" npm run deploy:ready` passed. |

## Remaining Phase 1 Work

- Safe invitation preview.
- Invitation acceptance update so normal human accounts keep fan identity while receiving scoped assignments.
- Assignment suspension, revocation, and expiry mutation APIs.
- Server-only immutable audit enforcement and rules hardening.
- Removal of Super Admin direct browser writes.
- Full compatibility report across existing demo and Firebase users.
