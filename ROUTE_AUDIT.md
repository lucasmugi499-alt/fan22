# Route and Role Audit

Last updated: 2026-07-26

## Public discovery

Visitors can browse the public sports graph without an account:

| Route | Guest behavior |
| --- | --- |
| `/` | Fan-facing landing page |
| `/leagues` and `/leagues/[leagueId]` | Read-only league directory and competition hub |
| `/teams` and `/teams/[teamId]` | Read-only team directory and public team profile |
| `/athletes` and `/athletes/[athleteId]` | Read-only athlete directory and career profile |
| `/matches` and `/matches/[matchId]` | Read-only fixtures, results, and match detail |
| `/how-it-works`, `/verification`, `/sponsors`, `/pilot` | Public product and trust pages |
| `/login` | Account sign-in |

Guest navigation is defined in `src/lib/nav.ts`. It exposes only public destinations and
Sign in. Public profile pages do not display a local-only Follow toggle. Support, follow,
comment, save, account, and workspace actions require authentication.

## Protected shared routes

`/home`, `/feed`, `/awards`, `/notifications`, `/profile`, and `/settings` require a signed-in
profile. `/wallet` is limited to Fan, Athlete, Platform Admin, and Super Admin.

## Operational workspaces

| Workspace | Allowed roles |
| --- | --- |
| `/athlete-dashboard` | Athlete, Platform Admin, Super Admin |
| `/team-admin` and nested routes | Team Admin, League Admin, Platform Admin, Super Admin |
| `/league-admin` and nested routes | League Admin, Platform Admin, Super Admin |
| `/admin` and nested routes | Platform Admin, Super Admin |

There is no `/register` route and no public `/sponsor-dashboard`. Fan self-registration is
the only client-created account type. Athlete, Team Admin, League Admin, Platform Admin,
and Super Admin access must come from a trusted invitation or approval process.

## Navigation source of truth

`src/lib/nav.ts` is the only role-navigation configuration. `src/lib/auth/permissions.ts`
is the only route and capability policy. Role landing routes are defined there through
`getDefaultRouteForRole()`.

## Result trust boundary

The active rules allow league managers to maintain fixture presentation fields such as
date, venue, city, public notes, and lifecycle status. Client credentials cannot change
scores, verification state, official result versions, or finalization metadata.

`firestore.rules.next` contains the pending result-submission authorization matrix. Its
emulator suite passes, but it must not replace the active rules until the full two-team
submission, finalizer, duplicate-trigger, stale-version, and standings workflow passes in
staging.

Firebase mode also fails closed when its public client configuration is incomplete. Mock
data is used only when `NEXT_PUBLIC_DATA_MODE=mock` is selected explicitly.

## Verification

On 2026-07-26:

- Permission unit suite: 87 passing
- Candidate Firestore rules: 30 passing
- Active Firestore hardening checks: 10 passing
- TypeScript: passing
