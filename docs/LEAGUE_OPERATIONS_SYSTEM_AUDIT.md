# League Admin → League Operations System: audit

**Prepared:** 2026-08-28 against `main` at `1c04212`.
**Method:** read every League Admin route, component, capability and trusted endpoint before
proposing any UI.

## Headline

The authority model is already right, and the trusted command surface is already broad. The
problem is entirely in the interface: **six thin pages, one duplicated screen, one orphaned
route, one control that lies, and three capabilities the League Admin holds but cannot reach.**

Nothing here needs a parallel architecture. Almost everything the brief asks for has a trusted
implementation waiting for a caller.

## What already exists and must not be rebuilt

| Capability | Trusted implementation | UI today |
| --- | --- | --- |
| Create season, transition season | `/api/admin/actions` via `secureLeagueCommand`, `league.season.manage` | partial |
| Create fixtures | `/api/admin/actions` `create_fixtures`, binds capture policy at creation | list only |
| Create teams, import teams | `/api/admin/actions` `create_teams` | yes |
| Update league / team profile | `/api/admin/actions` | partial |
| **Assign Field Manager** | `/api/matches/[matchId]/assignment` | **none** |
| **Emergency takeover** | `/api/matches/[matchId]/takeover` | **Platform only** |
| Match operations | `/api/match-ops/*` (Field Manager surface) | n/a |
| Propose exception resolution | `/api/exceptions/[exceptionId]/propose`, records conflict context | partial |
| Post-match fallback entry | `/api/matches/[matchId]/post-match-entry`, policy-gated | none |
| Athlete records, claims, persona | `/api/athletes`, `/api/athlete-claims`, `/api/athletes/[id]/persona` | **none** |
| Affiliations (conflict declarations) | `/api/leagues/[leagueId]/affiliations` | none |
| Evidence, attendance | `/api/matches/[matchId]/evidence`, `/attendance` | none |

`LEAGUE_ADMIN_CAPABILITIES` is already **one complete bundle** — no sub-roles, no operator
splits. ADR-004 already retired Team Admin as an account class. The brief's authority section
is satisfied server-side; the UI simply has not caught up.

Writes already go through `requestTrustedAdminAction` → `/api/admin/actions`. **No browser
Firestore writes exist in the League Admin surface.** That boundary is intact and must stay.

## Route audit

| Route | Renders | Verdict | Why |
| --- | --- | --- | --- |
| `/league-admin` | `LeagueOverview` → vanity metrics + `LeagueOperations` + `LeagueVerification` + standings + fantasy | **REFACTOR → Command Centre** | Leads with `Teams: 10`, `Verified: 82%`, `Index`. Shows no today, no live, no next fixture, no Field Manager readiness. It is a summary screen, which the brief explicitly rejects. |
| `/league-admin/verification` | `LeagueVerification` | **MERGE** | The *same component* is already mounted inside `LeagueOverview`. One screen, two routes. Becomes **Matches → Needs Review**. |
| `/league-admin/fixtures` | `LeagueFixtures` | **REFACTOR → Matches** | A list. No Live/Upcoming/Completed/Needs-Review segments, no operational readiness, no assignment. |
| `/league-admin/teams` | `LeagueTeams` | **REFACTOR** | Keeps create/import (trusted). Must lose the dead invite field and the seeded aggregates. |
| `/league-admin/reports` | `LeagueReports` | **KEEP, restyle** | Real reports; needs period/scope/source-version framing. |
| `/league-admin/command` | `MatchExceptionQueue rows={[]}` | **REMOVE** | **Orphaned and inert.** Not in navigation, and hardcoded to an empty array so it can never display a case. The name is then reused for the real Command Centre. |
| `/league-admin/onboarding` | checklist | **REFACTOR** | Not in navigation. Still says "invite Team Admins". Becomes first-run empty states inside each workspace. |
| — | — | **CREATE** | `/matches/[matchId]` match control, `/competition`, `/athletes`, `/media`, `/settings` (incl. League Admins). |

## Dead and misleading controls

1. **`LeagueTeams.tsx:296` — "First Team Admin email (optional)."** Bound to state, rendered,
   with copy promising "GoalPlace256 sends an expiring call-up link and keeps a copied fallback
   for matchday ops." **`inviteEmail` is never read by the submit handler.** Even if it were,
   `create_team_invitation` returns `410 Gone` under ADR-004. A control that lies twice over.
   The file already carries a comment explaining why the field should not exist; the JSX was
   never removed. **REMOVE.**
2. **`firebaseProvider.createTeamAdminInvitation`** — still calls the 410 action. **REMOVE.**
3. **`LeagueTeams` seeds deprecated aggregates.** Team creation writes `leaguePoints: 0`,
   `pointsFor`, `pointsAgainst`, `wins`, `draws`, `losses` and `adminUserIds: []`. These are
   precisely the stored aggregates the data guard now forbids *reading*, described in that
   guard as "how clubs came to display 19 points … beside a league table showing them on zero."
   **This component is the seeder of that defect,** and the brief bans `adminUserIds` outright.
   **REMOVE from the write.**
4. **`LeagueOperations` notice audience `team_admins`** — a channel to a role that no longer
   exists. **REMOVE the option.**
5. **`/league-admin/onboarding`** — "Create team profiles and invite Team Admins." **REWRITE.**

## Capabilities held but unreachable

These are in the League Admin bundle, have trusted endpoints, and have **no UI at all**:

- `league.field_manager.manage` — cannot assign a Field Manager. The brief's central matchday
  workflow is entirely absent.
- `league.match.takeover` — emergency takeover exists only in the Platform console.
- `league.athlete.manage` / `league.roster.manage` / `league.roster.verify` — no athlete
  directory, no registration workflow, no roster management, no claim invitations.
- `league.result.enter` — no post-match fallback entry, so a `POST_MATCH_ALLOWED` competition
  has no way to record a result.

## Navigation

Today: Overview · Teams · Fixtures · Verification, with Reports and Matches in More. Four
primary destinations, one of which duplicates the landing page.

Target, per the brief: **Command · Matches · Competition · Teams · Athletes** with Media,
Reports, Settings and League Admins in More. Mobile bottom nav carries the first four plus
More — the existing `BottomNav` already supports a five-item no-More variant built for the
Platform console, so this is configuration rather than new work.

## Mobile

`LeagueOverview` is a `grid-cols-2 sm:grid-cols-4` metric block above nested components. No
horizontal tables were found in the league surface, which is better than feared. The real
mobile problem is **information order**, not overflow: on a phone the League Admin is given
counts and a standings table before anything actionable, and the one thing they need on a
matchday — is this match ready, and who is running it — is not on the screen at all.

## Implementation order

Following the brief, adjusted for what already exists:

1. Responsive shell + navigation (Command/Matches/Competition/Teams/Athletes + More).
2. **Command Centre** — today, live, attention required, next, recent.
3. **Matches workspace** — Live / Upcoming / Completed / Needs Review.
4. **Field Manager assignment** — the largest single capability gap.
5. Match detail and Field Ops.
6. Fixture creation and schedule generation.
7. Teams (with the dead controls removed).
8. Athletes, registration, rosters, claims.
9. Competition workspace and settings.
10. Results and exceptions (fold in `LeagueVerification`).
11. Media, reports, settings, League Admins.
12. Mobile audit at 320/375/390/430/768/1024.

---

## Delivery, 2026-08-28

Built the operational spine. Slices 1–5 and the dead-control removals are done and gated;
the rest is named below rather than half-shipped.

### Shipped

| Slice | What landed |
| --- | --- |
| **Shell and navigation** | Five mobile destinations (Command · Matches · Teams · Athletes · More) and eight grouped desktop ones under COMMAND / COMPETITION / LEAGUE. `DesktopRail` already supported groups, so this was configuration, not new chrome. |
| **Command Centre** | `/league-admin` answers what is happening, what needs me, what is next — in that order. Attention is capped at five with the remainder one tap away, so a league with forty unassigned fixtures is not handed forty rows. |
| **Read model** | `src/lib/league/operations.ts`, pure and tested (23 cases). Field Manager presence is derived from an observed sync and is `unknown` until something has actually synced — a card that claims "online" because an assignment exists is worse than one that says nothing. |
| **Server read model** | `/api/league/command`, capability-checked against the specific league. Assignments and exceptions are not client-readable, so a browser-built picture would be a confident half-answer. |
| **Matches workspace** | Live / Upcoming / Needs review / Completed, each row carrying its own readiness. No drill-down to learn whether a match is covered. |
| **Field Manager assignment** | The largest capability gap, now closed. Calls the existing trusted endpoint. Shows the link and PIN once, separately, and no hashes or session internals. |
| **Match detail** | Contextual actions by state: assign before kickoff, nothing editable while live, review when an exception is open, and a plain statement that an official result changes only through a governed correction. |
| **Athletes** | A directory the league never had, with the two states an admin acts on: needs review, and unclaimed. |
| **Competition / Media / Settings** | Competition surfaces progress counted from fixtures and the capture policy in human words. Settings holds configuration only, and states the single-bundle model. |

### Removed

- The **"First Team Admin email"** field, which was bound to state, never read, and promised an
  invitation that `create_team_invitation` refuses with `410`. Its orphaned state, its
  `InvitationLink` component and its status helper went with it.
- **`adminUserIds` and the seeded standings aggregates** from team creation. `wins`,
  `losses`, `pointsFor`, `pointsAgainst` and `leaguePoints` are now optional on `Team`, so a
  club created today carries no fabricated record. This component was the seeder of the
  drift the data guard exists to catch.
- The **`team_admins` notice audience**, which addressed a retired account class.
- **`/league-admin/command`**, orphaned and hardcoded to an empty queue.
- **`/league-admin/fixtures`** and **`/league-admin/verification`**, folded into Matches.

### Not built, and honestly so

Schedule generation, fixture import, rescheduling with history, roster management, athlete
claim invitations, post-match fallback entry, emergency takeover from the league surface, and
reports restyling. Each has a trusted endpoint or a clear place to sit; none is stubbed or
faked in the UI.
