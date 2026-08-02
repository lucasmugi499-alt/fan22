# Phase 1 Access Security Tracker

## Approved Identity Decision

GoalPlace256 now targets the fixed account-class model approved for Phase 1:

- `fan`: public registration, fantasy, support, feed activity, follows, discovery, and fan notifications.
- `athlete`: invitation or profile claim only, Career Passport, performance records, support needs, challenges, and athlete notifications.
- `organization_operator`: invitation or approved league-application onboarding only. This account class may hold multiple scoped league/team/staff assignments.
- `platform_operator`: hardened platform governance accounts for Platform Admin, Super Admin, trust, finance, support, and system operations.

Fan accounts cannot become Team Admin or League Admin accounts. Athlete accounts cannot become organization operators. Platform operators cannot participate in fan or ordinary organization experiences. The same human may hold separate accounts with different verified emails and an optional internal `personId`, but sessions, notifications, history, audit trails, and permissions remain separate security principals.

Within an Organization Operator account, scoped assignment switching is allowed. For example, one operator account may be League Admin for one league, Team Admin for one team, and Results Reporter for another team.

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
- Trusted context includes the resolved account class so clients can separate fan, athlete, organization operator, and platform operator experiences.

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
| Corrected account-class decision | Pass | Current slice updates docs/code/tests to fixed account classes. |
| Safe invitation preview | Pass | Current slice adds `/api/access/invitations/[invitationId]`, verified in `npm test` and production route map. |
| Super Admin direct write removal | Pass | Firestore and Storage catch-all writes now fail for Super Admin browser clients; `npm run test:rules` passed 83 tests with Java 21. |
| Immutable audit hardening | Pass | `adminAuditEvents` and legacy `adminLogs` are server-write-only; Super Admin browser update/delete attempts are covered by rules tests. |

## Remaining Phase 1 Work

- Invitation acceptance update so only Organization Operator accounts receive league/team scoped assignments.
- Assignment suspension, revocation, and expiry mutation APIs.
- Full compatibility report across existing demo and Firebase users.
