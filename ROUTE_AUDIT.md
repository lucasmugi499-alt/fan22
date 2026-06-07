# Route Audit

| Route | Expected Role(s) | Verified working? | Notes |
|-------|-----------------|------------------|-------|
| `/` | Public/All | Yes | Landing page |
| `/home` | fan, athlete, league_admin, platform_admin | Yes | Main hub |
| `/feed` | fan, athlete, league_admin, platform_admin | Yes | Contextual feed filtering |
| `/matches` | fan, athlete, league_admin, platform_admin | Yes | Match listing |
| `/athletes` | fan, athlete, league_admin, platform_admin | Yes | Athlete listing |
| `/teams` | fan, athlete, league_admin, platform_admin | Yes | Team listing |
| `/leagues` | fan, athlete, league_admin, platform_admin | Yes | League listing |
| `/awards` | fan, athlete, league_admin, platform_admin | Yes | Awards page |
| `/wallet` | fan, athlete, platform_admin | Yes | Added back link to `/` |
| `/athlete-dashboard` | athlete, platform_admin | Yes | Athlete-specific management |
| `/league-admin` | league_admin, platform_admin | Yes | League operations with `?league=` query param support |
| `/admin` | platform_admin | Yes | Platform oversight with `?tab=` and `?league=` support |
| `/sponsor-dashboard`| platform_admin | Yes | Sponsor dashboard for platform admins |
| `/register` | Public | Yes | Role preview/registration with `?role=` query support |

## Permission Integrity
- `RoleGuard.tsx` correctly denies access to unauthorized roles.
- Restricted Area UX improved to specify allowed roles vs current role.
- `getDefaultRouteForRole` handles dynamic redirect after role change.
