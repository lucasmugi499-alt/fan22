# Route and Role Audit

Last updated: 2026-06-13

## Route Permission Audit

| Path | Access level | Allowed roles | Visible in nav | Direct URL behavior | Status |
| --- | --- | --- | --- | --- | --- |
| `/` | Public | All | Logged-out brand route | Landing page | OK |
| `/home` | Protected | Logged-in roles | Fan primary, role fallback | Home hub with role quick actions | OK |
| `/feed` | Protected | Logged-in roles | Fan primary | Feed | OK |
| `/matches` | Protected | Logged-in roles | Fan, Athlete, Team Admin | Match schedule/results | OK |
| `/athletes` | Protected | Logged-in roles | Fan primary | Athlete directory | OK |
| `/teams` | Protected | Logged-in roles | Optional/contextual | Team directory/detail links | OK |
| `/leagues` | Protected | Logged-in roles | Fan desktop optional | League directory | OK; removed League Admin `Standings` global duplicate. |
| `/awards` | Protected | Logged-in roles | Fan desktop optional | Awards | OK |
| `/wallet` | Protected | `fan`, `athlete`, `platform_admin`, `super_admin` | Fan, Athlete | Wallet/support history | OK |
| `/athlete-dashboard` | Protected | `athlete`, `platform_admin`, `super_admin` | Athlete | Athlete career dashboard | OK |
| `/team-admin` | Protected | `team_admin`, `league_admin`, `platform_admin`, `super_admin` | Team Admin | Team operations console with tab query support | OK |
| `/league-admin` | Protected | `league_admin`, `platform_admin`, `super_admin` | League Admin | League operations desk with tab query support | OK |
| `/admin` | Protected | `platform_admin`, `super_admin` | Platform Admin | Platform control center with tab query support | OK |
| `/sponsors` | Public | All | Logged-out sponsor nav | Public sponsor inquiry and positioning | OK |
| `/sponsor-dashboard` | Protected | `platform_admin`, `super_admin` | Internal/platform preview only | Sponsor impact reporting demo | OK; page guard and route helper agree. |
| `/verification` | Public | All | Logged-out nav | Trust explainer | OK |
| `/register` | Public | All | Public account flow | Fan, Athlete, League Admin registration; Team Admin invite-only; Platform Admin invite-only | OK |

## Role Navigation Map

### Fan

Global nav: `Home`, `Feed`, `Matches`, `Athletes`, `Leagues`, `Wallet`; desktop optional `Awards`, `Profile`. `Leagues` now comes from the shared role config rather than being appended for desktop only, so mobile and desktop agree.

Workspace tabs: none in the current fan hub.

Contextual actions: follow athlete/team/league, support athlete, join or pledge challenge, view match, comment/react/share, view support impact.

Quick actions: `Support Athlete`, `Follow Team`, `View Match`, `Open Wallet`.

Hidden/forbidden: `League Admin`, `Team Admin`, `Platform Admin`, `Sponsor Dashboard`, `Verify Result`, `Add Team`, `Submit Result`.

### Athlete

Global nav: `Dashboard`, `Matches`, `Profile`, `Wallet`, `Settings`.

Workspace tabs: `Overview`, `Profile`, `Challenges`, `Matches`, `Media`, `Supporters`, `Settings`; official stats remain presented as source-controlled data, not athlete-editable controls.

Contextual actions: publish highlight, request athlete verification, view supporters, review public profile, view upcoming matches, track challenge progress.

Quick actions: profile/media/support shortcuts only.

Hidden/forbidden: league controls, team controls, platform controls, sponsor dashboard, official stat editing.

### Team Admin

Global nav: `Team Console`, `Roster`, `Fixtures`, `Updates`, `Profile`.

Workspace tabs: `Overview`, `Roster`, `Fixtures & Results`, `Athlete Updates`, `Team Profile`.

Contextual actions: add athlete, update roster, invite athlete, submit result, confirm/dispute opponent result, upload team update, add support need, request verification, edit team profile, view public team page.

Quick actions: `Add Athlete to Roster`, `Submit Match Result`, `Publish Team Update`, `Request Athlete Verification`, all routed to the correct workspace tab.

Hidden/forbidden: league-wide verification controls, platform admin, sponsor dashboard, manage league, approve payouts.

### League Admin

Global nav: `League Ops`, `Teams`, `Fixtures`, `Verification`, `Reports`, `Settings`.

Workspace tabs: `Overview`, `Teams & Athletes`, `Fixtures & Results`, `Verification`, `Sponsor Report`, `Settings`.

Contextual actions: create fixture, add team, add athlete, invite team admin, review team submissions, submit result, import fixtures, view standings, review match/challenge/dispute queues, generate sponsor report, export CSV, view sponsor impact, edit league info, manage permissions, check WhatsApp bridge.

Quick actions: `Create Fixture`, `Add Team`, `Review Match Queue`, `Generate Sponsor Report`.

Hidden/forbidden: platform-wide user controls, platform payout approval, public sponsor dashboard access.

### Platform Admin

Global nav: `Control Center`, `Approvals`, `Trust & Safety`, `Reports`, `Sponsors`, `System`.

Workspace tabs: `Overview`, `Users`, `Leagues`, `Athletes`, `Teams`, `Verifications`, `Reports`, `Feed Moderation`, `Support/Payout Review`, `Sponsors`, `Awards`, `System Health`, `Settings`.

Contextual actions: review approvals, review escalations, export platform report, approve/inspect/suspend league, review evidence, approve/reject verification, manage sponsor package, generate sponsor report, review payout, approve demo review, hold for evidence, view logs, check data mode, export diagnostics.

Quick actions: `Review Approvals`, `Review Escalations`, `Export Platform Report`, `Review Payout Request`.

Hidden/forbidden: none among internal admin surfaces; public fan/athlete experiences should not be presented as operational controls.

### Sponsor

Global nav: sponsor is not a public MVP login role.

Workspace tabs: no public in-app workspace. Public sponsor flow is `/sponsors`; internal reporting preview is `/sponsor-dashboard` behind `platform_admin` and `super_admin`.

Contextual actions: view impact report, download report, view funded needs, view evidence, browse packages, contact platform/league.

Quick actions: none for public login.

Hidden/forbidden: create fixture, add team, verify match, submit result, admin controls, sponsor dashboard unless platform admin preview.

## Role Data Visibility Map

| Role | Data received |
| --- | --- |
| Fan | Match schedules, verified scores, athlete updates, team/league public updates, support confirmations, challenge outcomes, wallet transactions, notifications from followed athletes/teams/leagues. |
| Athlete | Match assignments, public profile data, official stats source, media/highlights, challenge invitations/status, supporter notifications, verification decisions, wallet/support updates, team/league announcements. |
| Team Admin | League fixtures, roster status, athlete profile status, result submission requests, opponent confirmation requests, dispute notices, league announcements, verification request status. |
| League Admin | Team submissions, rosters, disputed match results, evidence attachments, verification queues, challenge completion requests, sponsor impact data, team admin requests, league notice state. |
| Platform Admin | League registration requests, user/entity records, escalated disputes, suspicious activity, moderation reports, payout review queues, sponsor/admin requests, data mode and system health. |
| Sponsor | Verified impact data, funded athlete/team/league updates, brand placement evidence, monthly reports, campaign performance, proof of support usage; no operational controls. |

## Information Flow Checks

Match result flow remains: League Admin creates fixture; Team Admin submits result with evidence; opponent confirms or disputes; League Admin verifies disputed/pending result; verified result updates match page, team records, standings, athlete stats, fan feed, and sponsor impact reports when relevant.

Challenge flow remains: athlete/league creates challenge; challenge attaches to athlete and match/season; Team Admin approves feasibility; League Admin verifies outcome; verified challenge updates athlete profile, fan support record, sponsor impact report, public feed, and notifications.

Team and athlete flow remains: League Admin creates or invites team; Team Admin manages roster; athlete profiles connect to team and league; League Admin verifies official athlete status; athlete appears publicly as verified or pending.

Notification flow remains role-specific: fans receive followed activity and support updates; athletes receive verification/support/match announcements; Team Admins receive roster/fixture/result/dispute notices; League Admins receive verification/dispute/team/sponsor reminders; Platform Admins receive escalation/approval/moderation/payout/system alerts; Sponsors receive impact/evidence/campaign updates.

## Implementation Notes

Navigation active state now compares pathname plus `tab` query params, and workspace tab clicks write back to the URL. Navigation deduplication is by normalized destination rather than label.

Sponsor default routing remains `/sponsors` in `permissions.ts` and Firebase auth routing. `canAccessSponsorDashboard` and `/sponsor-dashboard` page guard allow only `platform_admin` and `super_admin`.

Verification passed for `corepack pnpm lint`, `npx tsc --noEmit`, and `git diff --check`. Production build and browser/mobile manual tests are blocked by the environment: build needs Google Fonts network access, and localhost dev server binding requires escalation; both escalation requests were rejected by the current approval/usage limit.
