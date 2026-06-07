# Route Audit

## Public Routes

- `/`
- `/about`
- `/how-it-works`
- `/sponsors`
- `/login`
- `/register`

## Logged-In App Routes

These require authentication and are available to the visible MVP roles unless a role guard below applies.

- `/home`
- `/feed`
- `/sports`
- `/matches`
- `/matches/[matchId]`
- `/athletes`
- `/athletes/[athleteId]`
- `/teams`
- `/teams/[teamId]`
- `/leagues`
- `/leagues/[leagueId]`
- `/awards`
- `/wallet`
- `/notifications`
- `/profile`
- `/settings`

## Role-Protected Routes

- `/athlete-dashboard` -> `athlete`, `platform_admin`, `super_admin`
- `/league-admin` -> `league_admin`, `platform_admin`, `super_admin`
- `/admin` -> `platform_admin`, `super_admin`

## Future Modules

- `/team-admin` -> visible only to `league_admin`, `platform_admin`, `super_admin`; polished placeholder with CTA to `/league-admin`
- `/sponsor-dashboard` -> logged-in placeholder with CTA to `/sponsors`

## Visible MVP Roles

- `fan`
- `athlete`
- `league_admin`
- `platform_admin`

Internal legacy roles may remain in types/mock records for compatibility, but they are hidden from login, registration, and primary navigation.
