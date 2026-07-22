# Button and UI Audit

Last updated: 2026-06-13

## Duplicate Navigation and Button Audit

| Page | Duplicate labels | Duplicate destinations | Visible roles | Recommendation | Status |
| --- | --- | --- | --- | --- | --- |
| Global nav, Team Admin | `Fixtures`, `Results` | Both routed to `/team-admin?tab=Fixtures%20%26%20Results` | `team_admin` | Merge to one `Fixtures` item. | Resolved: `Results` removed. |
| Global nav, Platform Admin | `Control Center`, `Approvals`, `Verification`, `Reports`, `Payouts`, `System`, `Users`, `Settings` | All routed to tabs inside `/admin` | `platform_admin`, `super_admin` | Keep high-level command-center modules only. | Resolved: top nav is `Control Center`, `Approvals`, `Trust & Safety`, `Reports`, `Sponsors`, `System`. |
| Global nav, League Admin | `Standings` duplicated standings inside `Fixtures & Results` | `/leagues` while standings already live in workspace | `league_admin`, `platform_admin`, `super_admin` | Remove from global nav; use contextual shortcut. | Resolved: `Standings` removed from global nav and `View Standings` is contextual. |
| `/league-admin` action toolbar | All league actions visible on every tab | Multiple modals/actions regardless of context | `league_admin`, `platform_admin`, `super_admin` | Replace with active-tab-specific actions. | Resolved. |
| `/team-admin` Overview | `Submit Match Result` appeared in Quick Actions and Pending Tasks | Same submit result modal | `team_admin`, `league_admin`, `platform_admin`, `super_admin` | Use one contextual toolbar. | Resolved: quick-action cluster replaced with operating snapshot. |
| `/admin` action toolbar | Approval, moderation, feed, and payout actions visible globally | Mixed command-center contexts | `platform_admin`, `super_admin` | Use active-tab-specific actions. | Resolved for requested tabs. |
| Role quick actions | Some actions duplicated tabs or used inconsistent tab query strings | `AthleteUpdates`, sponsor dashboard paths, broad fallbacks | Role-dependent | Normalize tab URLs and remove sponsor dashboard shortcuts. | Resolved. |
| Sponsor surfaces | `/sponsor-dashboard` page guard allowed `sponsor` | Direct page access conflicted with permission helper | `sponsor` if manually assigned | Restrict page guard to platform roles. | Resolved. |

## Contextual Toolbar Map

| Workspace | Tab | Contextual actions now shown |
| --- | --- | --- |
| `/league-admin` | Overview | Create Fixture, Add Team, Review Pending Items, Publish Notice |
| `/league-admin` | Teams & Athletes | Add Team, Add Athlete, Invite Team Admin, Review Team Submissions |
| `/league-admin` | Fixtures & Results | Create Fixture, Submit Match Result, Import Fixtures, View Standings |
| `/league-admin` | Verification | Review Match Queue, Review Challenge Queue, Review Disputes |
| `/league-admin` | Sponsor Report | Generate Sponsor Report, Export CSV, View Sponsor Impact |
| `/league-admin` | Settings | Edit League Info, Manage Permissions, WhatsApp Reporting Bridge |
| `/team-admin` | Overview | Add Athlete, Submit Result, Upload Team Update |
| `/team-admin` | Roster | Add Athlete, Update Roster, Invite Athlete |
| `/team-admin` | Fixtures & Results | Submit Result, Confirm Opponent Result, Dispute Result |
| `/team-admin` | Athlete Updates | Upload Team Update, Add Support Need, Request Verification |
| `/team-admin` | Team Profile | Edit Team Profile, View Public Team Page |
| `/admin` | Overview | Review Approvals, Review Escalations, Export Platform Report |
| `/admin` | Leagues | Approve League, Inspect League, Suspend League |
| `/admin` | Verifications | Review Evidence, Approve Verification, Reject Verification |
| `/admin` | Sponsors | Manage Sponsor Package, Generate Sponsor Report |
| `/admin` | Support/Payout Review | Review Payout, Approve Demo Review, Hold for Evidence |
| `/admin` | System Health | View Logs, Check Data Mode, Export Diagnostics |

## Dead Button Audit

| Button | Page | Previous result | Current result | Status |
| --- | --- | --- | --- | --- |
| `Review Team Submissions` | `/league-admin` | Toast only | Opens review drawer with team context. | Resolved |
| `View Athlete Profile` | `/league-admin` | Toast only | Navigates to `/athletes/[athleteId]`. | Resolved |
| `Publish League Post` | `/league-admin` | Toast only | Removed from main toolbar. | Resolved |
| `Review History` | `/league-admin` | Toast only | Opens resolution-history drawer. | Resolved |
| `Download PDF Report` | `/league-admin` | Toast only | Replaced by report modal actions from contextual toolbar. | Resolved |
| `Save Profile` / `Request Partner Status` | `/league-admin` | Toast only | Updates visible local status panels. | Resolved |
| `Review Match Evidence` | `/team-admin` | Toast only | Opens evidence drawer and can confirm reviewed state. | Resolved |
| `Edit Athlete Details` | `/team-admin` | Toast only | Opens athlete detail drawer. | Resolved |
| `Approve Verification` / `Reject Verification` | `/admin` | Toast only | Updates visible verification status. | Resolved |
| `Resolve Report` / `Escalate Report` | `/admin` | Toast only | Updates visible report status. | Resolved |
| `Manage Sponsor Package` | `/admin` | Toast only | Opens sponsor package drawer. | Resolved |
| `Configure Award Category` | `/admin` | Toast only | Opens award review drawer. | Resolved |
| `Save Platform Setting` | `/admin` | Toast only | Shows saved local state. | Resolved |

## Known Remaining Toast-Only or Shallow Demo Actions

Some broader demo surfaces still use toast-only feedback outside the requested admin cleanup path, including parts of `athlete-dashboard`, public league follow/share actions, generic feed save/share actions, and reusable demo modals. These are documented as remaining demo-mode debt, not newly introduced by this sprint.

Additionally, within the workspace pages (`/league-admin`, `/admin`), certain drawer-based actions act as "shallow demo actions", where the modal/drawer opens correctly with local context, but the final confirmation button merely displays a toast without updating the data model:
- `Record Team Review` (League Admin -> Teams & Athletes)
- `Stage Fixture Import` (League Admin -> Fixtures & Results)
- `Save Permission Review` (League Admin -> Settings)
- `Mark Bridge Checked` (League Admin -> Settings)
- `Mark Evidence Reviewed` (League Admin -> Verification)
- `Prepare User Export` (Platform Admin -> Users)

## Mobile Layout Audit

| Page | Issue | Current status |
| --- | --- | --- |
| `/league-admin` Teams & Athletes | Tables used `min-w` widths and horizontal scrolling. | Resolved with desktop tables plus mobile cards. |
| `/league-admin` Fixtures & Results | Fixture/result tables and standings scrolled horizontally. | Resolved with mobile cards and responsive standings. |
| `/league-admin` Verification | Queue tables scrolled horizontally and squeezed action cells. | Resolved with mobile cards and wrapped actions. |
| `/team-admin` Header and match cards | Could crowd at 390px. | Improved by moving actions into wrapping toolbar; needs browser verification. |
| `/admin` Users | Desktop table hidden below `lg` and mobile cards exist. | OK. |
| Global mobile nav | Could cover low page buttons. | Layout has bottom padding; browser verification blocked by local server approval limit. |

## Verification

Passed: `corepack pnpm lint`, `npx tsc --noEmit`, `git diff --check`.

Blocked: `corepack pnpm build` failed in sandbox because Next could not fetch Google Fonts; escalation to rerun with network was rejected by the environment usage/approval limit. Local dev server and browser viewport checks were also blocked because binding to localhost required escalation and the same limit rejected it.
