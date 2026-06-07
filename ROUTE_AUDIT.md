# Route Access Audit

**Generated For:** Investor Demo QA
**Status:** ALL SECURE ✅

## Public Routes (Logged Out Access)
The following routes are explicitly whitelisted for non-authenticated access.
- `/` (Landing Page)
- `/about`
- `/how-it-works`
- `/sponsors` (Informational, NOT the dashboard)
- `/pilot`
- `/login`
- `/register`

## Protected Route Matrices
Access is gated by `RoleGuard` and `ProtectedRoute` using the `AppRole` enum. Unauthorized roles are redirected to a fallback access denied screen or their default dashboard.

### `fan` (Fan)
- **Allowed:** `/home`, `/feed`, `/athletes/[id]`, `/teams/[id]`, `/leagues/[id]`, `/wallet`, `/settings`
- **Denied:** `/admin`, `/league-admin`, `/sponsor-dashboard`, `/team-admin`

### `athlete` (Athlete)
- **Allowed:** `/home`, `/feed`, `/athlete-dashboard`, `/athletes/[id]`, `/teams/[id]`, `/leagues/[id]`, `/wallet`, `/settings`
- **Denied:** `/admin`, `/league-admin`, `/sponsor-dashboard`, `/team-admin`

### `league_admin` (League Admin)
- **Allowed:** `/home`, `/feed`, `/league-admin`, `/team-admin`, `/athletes/[id]`, `/teams/[id]`, `/leagues/[id]`, `/settings`
- **Denied:** `/admin`, `/sponsor-dashboard`, `/athlete-dashboard`, `/wallet`

### `platform_admin` & `super_admin` (Platform / Super Admin)
- **Allowed:** **ALL ROUTES** including `/admin`, `/sponsor-dashboard`, `/league-admin`, `/team-admin`, `/athlete-dashboard`, `/wallet`
- **Denied:** None. (Note: Registration for this role is disabled and invite-only).

## Notes
- "Sponsor" accounts are intentionally omitted from public login/registration as per demo requirements.
- The `team_admin` role is an internal mapping to `league_admin` for the MVP phase.
