# Button Audit

| Label | Page | Visible to Roles | Expected Behavior | Actual Behavior | Status |
|-------|------|------------------|-------------------|-----------------|--------|
| Support Athletes | `/leagues/[leagueId]` | `fan` | Navigate to `/athletes?league=leagueId` | Navigates correctly to filtered athletes page | Verified |
| View Athletes | `/leagues/[leagueId]` | `athlete` | Navigate to `/athletes?league=leagueId` | Navigates correctly to filtered athletes page | Verified |
| Follow League | `/leagues/[leagueId]` | `fan`, `athlete` | Trigger local toast notification | Triggers local toast correctly | Verified |
| Manage League | `/leagues/[leagueId]` | `league_admin` | Navigate to `/league-admin?league=leagueId` | Navigates to league admin dashboard pre-selecting league | Verified |
| Open League Ops | `/leagues/[leagueId]` | `platform_admin` | Navigate to `/league-admin?league=leagueId` | Navigates to league admin ops for that league | Verified |
| Review League | `/leagues/[leagueId]` | `platform_admin` | Navigate to `/admin?tab=Leagues&league=leagueId` | Navigates to platform admin with tab and league selected | Verified |
| Create Fixture | `/league-admin` | `league_admin`, `platform_admin` | Open Create Fixture Modal | Opens modal with league default pre-selected | Verified |
| Submit Result | `/league-admin` | `league_admin`, `platform_admin` | Open Submit Result Modal | Opens modal with league matches pre-selected | Verified |
| Add Team | `/league-admin` | `league_admin`, `platform_admin` | Open Add Team Modal | Opens modal with league default pre-selected | Verified |
| Add Athlete | `/league-admin` | `league_admin`, `platform_admin` | Open Add Athlete Modal | Opens modal with league teams pre-selected | Verified |
| Create Challenge | `/league-admin` | `league_admin`, `platform_admin` | Open Create Challenge Modal | Opens modal with league athletes pre-selected | Verified |
| Verify Result | `/league-admin`, `/admin` | `league_admin`, `platform_admin` | Open Verify Result Modal | Opens modal, updating local match persistence overrides on submit | Verified |
| Invite Team Admin | `/league-admin` | `league_admin`, `platform_admin` | Open Invite Team Admin Modal | Opens modal | Verified |
| Open Console | `/league-admin` | `league_admin`, `platform_admin` | Navigate to `/team-admin?team=teamId` | Navigates correctly to Team Admin console | Verified |
| Add Athlete | `/team-admin` | `team_admin`, `league_admin`, `platform_admin` | Open Add Athlete Modal | Opens modal | Verified |
| Submit Result | `/team-admin` | `team_admin`, `league_admin`, `platform_admin` | Open Submit Result Modal | Opens modal | Verified |

## Summary
- Duplicate/ambiguous "Admin Dashboard" button has been removed from league detail view.
- No buttons trigger Access Denied for standard roles.
- All demo modals update `demoMatchOverrides` or `demoChallengeOverrides` ensuring visible persistence across views.
