# Route Audit

| Path | Access Level | Allowed Roles | Visible in Nav | Direct URL Behavior | Status |
|------|-------------|---------------|----------------|---------------------|--------|
| `/` | Public | All | No | Renders Landing Page | Secure |
| `/home` | Protected | fan, athlete, league_admin, platform_admin | Yes | Renders Hub | Secure |
| `/feed` | Protected | fan, athlete, league_admin, platform_admin | Yes | Renders Feed (Filtered if ?league=) | Secure |
| `/matches` | Protected | fan, athlete, league_admin, platform_admin | Yes | Renders Matches (Filtered if ?league=) | Secure |
| `/athletes` | Protected | fan, athlete, league_admin, platform_admin | Yes (Role specific) | Renders Athletes (Filtered if ?league=) | Secure |
| `/teams` | Protected | fan, athlete, team_admin, league_admin, platform_admin | No | Renders Teams (Filtered if ?league=) | Secure |
| `/leagues` | Protected | fan, athlete, team_admin, league_admin, platform_admin | Yes (Role specific) | Renders Leagues | Secure |
| `/awards` | Protected | fan, athlete, team_admin, league_admin, platform_admin | Yes (Fan) | Renders Awards | Secure |
| `/wallet` | Protected | fan, athlete, team_admin, platform_admin | Yes (Fan, Athlete) | Renders Wallet | Secure |
| `/athlete-dashboard` | Protected | athlete, platform_admin | Yes (Athlete) | Renders Athlete Dashboard | Secure |
| `/league-admin` | Protected | team_admin, league_admin, platform_admin | Yes (League Admin) | Renders League Admin Ops | Secure |
| `/team-admin` | Protected | team_admin, league_admin, platform_admin | Yes (Team Admin) | Renders Team Admin Console | Secure |
| `/admin` | Protected | platform_admin | Yes (Platform Admin) | Renders Platform Admin Console | Secure |
| `/sponsor-dashboard`| Protected | platform_admin | Yes (Platform Admin) | Renders Sponsor Reporting | Secure |
| `/sponsors` | Public | All | Yes (Logged Out) | Renders Public Sponsor Inquiry | Secure |
| `/register` | Public | All | No | Renders Registration/Role Switcher | Secure |

## Permission Integrity
- `RoleGuard.tsx` correctly denies access to unauthorized roles.
- `canAccessSponsorDashboard` updated to restrict access exclusively to platform admins.
- No visible buttons lead unauthorized users to Restricted Area pages.
