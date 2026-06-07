# Button Audit

| Page | Button | Action / Route | Verified Working? | Role Constraints |
|------|--------|---------------|------------------|-----------------|
| `/leagues/[leagueId]` | Support Athletes | `/athletes?league=leagueId` | Yes | `fan` |
| `/leagues/[leagueId]` | View Athletes | `/athletes?league=leagueId` | Yes | `athlete` |
| `/leagues/[leagueId]` | Follow League | Local state update toast | Yes | `fan`, `athlete` |
| `/leagues/[leagueId]` | Admin Dashboard | `/league-admin?league=leagueId` | Yes | `league_admin` |
| `/leagues/[leagueId]` | Manage League | `/league-admin?league=leagueId` | Yes | `league_admin` |
| `/leagues/[leagueId]` | Review League | `/admin?tab=Leagues&league=leagueId` | Yes | `platform_admin` |
| `/league-admin` | Demo Modals (Create Fixture, etc) | Opens Modal | Yes | `league_admin`, `platform_admin` |
| `/admin` | Download Report | Toast/Modal | Yes | `platform_admin` |
| `demo-modals.tsx` | All submit buttons | Zustand update + UI Toast | Yes | Data correctly mapped via `useGoalPlaceData` `<select>`s. |
