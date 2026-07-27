# Route Audit

Updated: July 26, 2026.

## Public Read-Only Discovery

- `/`
- `/discover`
- `/leagues` and `/leagues/[leagueId]`
- `/teams` and `/teams/[teamId]`
- `/athletes` and `/athletes/[athleteId]`
- `/matches` and `/matches/[matchId]`
- `/support`
- `/map`
- `/how-it-works`
- `/verification`
- `/sponsors`
- `/pilot`
- `/login`
- `/register`

Public visitors can browse sport records. Follow, save, support, comment, reminders, profile
management, and operational workspaces require authentication.

## Signed-In Shared Routes

- `/home`
- `/feed`
- `/awards`
- `/profile`
- `/settings`
- `/notifications`
- `/contributions`

`/wallet` is a compatibility redirect to `/contributions`; GoalPlace256 does not provide a
stored-value wallet.

## Athlete

- `/athlete-dashboard`

## Team Admin

- `/team-admin`
- `/team-admin/fixtures`
- `/team-admin/roster`
- `/team-admin/updates`
- `/team-admin/profile`
- `/invitations/team/[assignmentId]`

## League Admin

- `/league-admin`
- `/league-admin/fixtures`
- `/league-admin/teams`
- `/league-admin/verification`
- `/league-admin/reports`
- `/apply/league-admin`

## Platform Admin

- `/admin`
- `/admin/approvals`
- `/admin/trust`
- `/admin/reports`
- `/admin/sponsors`
- `/admin/finance`

Route access is defined in `src/lib/auth/permissions.ts`. Navigation is defined in
`src/lib/nav.ts`; there is no second role-navigation configuration.
