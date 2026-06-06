# Route Audit

## Public Routes Only
- `/`
- `/about`
- `/how-it-works`
- `/sponsors`
- `/login`
- `/register`

## Protected App Routes (Logged-in access required)
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
- `/athlete-dashboard` -> `athlete`, `platform_admin`
- `/league-admin` -> `league_admin`, `platform_admin`
- `/admin` -> `platform_admin`

## Future / Internal Routes
- `/team-admin` -> future module or redirect to `/league-admin`
- `/sponsor-dashboard` -> future module or redirect to `/sponsors`
