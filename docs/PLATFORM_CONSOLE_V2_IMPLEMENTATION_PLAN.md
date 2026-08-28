# Platform Console V2 implementation plan

**Status:** Implemented and browser-reviewed. Four post-delivery defects found and fixed; see the review section at the end.
**Prepared:** 2026-08-27 against `main` at `ca0a5c5`.
**Source:** “Platform Console Redesign” artifact plus a repository and responsive UI audit.

## Outcome

Turn Platform Admin from a collection of directories into an operations console:

- five destinations: **Desk, Network, Integrity, Money, Platform**;
- one role-aware palette for finding entities, destinations, cases, and commands;
- one triaged Desk for decisions that can be completed without a page round trip;
- entity-specific workbenches instead of one generic detail component;
- commands that consistently declare their authority, consequence tier, required reason,
  confirmation, audit shape, and disabled reason;
- mobile operation that works at 390px and at the currently broken 768px breakpoint;
- visible product boundaries around sporting truth, access, conflicts, and data quality.

This is a progressive migration. Existing trusted APIs and routes remain authoritative until
their callers have moved, and old URLs redirect to an equivalent destination or workbench tab.

## What the audit confirmed

| Area | Current repository reality | Planning consequence |
| --- | --- | --- |
| Navigation | Platform Admin exposes 18 admin destinations; 14 are behind **More** on mobile. `BottomNav` is explicitly built for four primary items plus More. | Collapse Platform Admin to five direct destinations and make `BottomNav` support a five-item no-More variant. Keep other roles unchanged. |
| Command centre | `/admin` is a dashboard of status tiles and links. Its queue does not execute decisions. | Replace it with the Desk after the command foundation exists. |
| Responsive layout | `md:grid-cols-5` visibly collides at 768px. At 390px the five status cards form a long vertical wall before any work is visible. | Ship the stat rail and mobile case layout in the first milestone, not as final polish. |
| Directory pattern | Several surfaces still compose `PlatformAdminHeader`, `PlatformStatGrid`, `PlatformSearch`, and `DirectoryRow`; generic detail routes share `PlatformEntityDetail`. | Preserve the useful primitives, but replace generic entity information architecture with workbench-specific tabs. |
| Network management | League, team, and athlete tables, lifecycle commands, `CommandDialog`, `usePlatformCommand`, and `securePlatformCommand` already exist. | Extend and consolidate these foundations; do not rebuild them. |
| Existing command surface | `/api/admin/actions` has 13 discriminated actions, but trusted commands also live in `/api/platform/network`, `/api/platform/site`, `/api/platform/environment-activation`, `/api/platform/competition-integrity`, `/api/platform/media`, `/api/platform/payee`, and `/api/access`. | The registry must inventory every Platform-visible trusted mutation, not only the 13 actions in one route. |
| Search | `GlobalSearch` already opens with Command/Ctrl-K and uses a server search index, but the index only contains athletes, teams, leagues, and seasons with public URLs. Platform gets two hard-coded navigation actions, not executable commands. | Add an authenticated Platform search/palette read model. Do not turn the public search index into an admin authority surface. |
| Applications | `/admin/applications` is a read-only directory. `/admin/approvals` is an unlinked route that exposes the actual decision sheet and can load a very large untriaged list. | Fold both into the Desk and an application case workbench. |
| Approve and invite | `POST /api/access` with `approve_league_admin` already creates organization, league, season, and owner invitation in one transaction. | Reuse and harden this transaction. The missing work is risk triage, delivery visibility, resend/revoke, and better UI—not recomposing three separate commands. |
| Invitation model | The invitation status union already includes queued, sent, delivered, viewed, accepted, expired, revoked, and failed delivery, but the approval transaction currently records `sent` without provider-delivery evidence. | Model delivery attempts explicitly and only advance state from observed provider/user events. |
| Operations Model V2 | Field capture, the governed unreported sweep, data-quality computation, takeover generation fencing, and operational exceptions are complete and cloud-verified on Demo. Beta/Production promotion is separate. | Live Ops can be built against real V2 records now on Demo. It no longer waits on unfinished V2 implementation, but rollout must remain environment-gated. |
| Icons | The current source uses Phosphor; no `hugeicons-react` imports remain. | No icon-family migration is needed. Keep Phosphor. |
| Safety mismatch | `POST /api/exceptions/[exceptionId]/ratify` lets a Platform actor bypass the conflict refusal, while the redesign explicitly forbids any conflicted principal, Platform included, from ratifying. | Fix and test this invariant before exposing ratification in the new console. |
| Baseline | Targeted navigation, command, search, and platform smoke suites pass: 48 tests across five files. | Preserve this baseline and add contract tests before UI migration. |

## Target operating model

| Destination | Default surface | Absorbs existing routes | Important tabs/workbenches |
| --- | --- | --- | --- |
| Desk | Triaged cases and inline decisions | `/admin`, `/admin/work`, `/admin/approvals`, decision portions of applications, trust, payee, and integrity | All, Mine, Applications, Integrity, Trust, Money, History |
| Network | Authenticated entity/palette search plus saved/recent entities | leagues, teams, athletes, organizations, people, access, application browsing | League, team, athlete, person, organization, access, application workbenches |
| Integrity | Live operational strip and integrity queues | competition, trust, audit, live Match Ops | Live, Escalations, Quality, Trust, Audit |
| Money | Financial and sponsor operations | finance, sponsors, reports, payee verification | Allocations, Payees, Holds, Sponsors, Reports |
| Platform | Environment and public-site operation | website/settings, control plane, system health, environment activation | Site, Controls, Health, Activations, Audit |

The palette is not a sixth destination. It is the retrieval layer available from every one of
the five destinations.

## Non-negotiable safety contract

These are server invariants with UI explanations, not UI-only conventions:

1. Platform Admin cannot write an official result, official event, standing, or statistic.
2. Platform Admin cannot edit a live event or clock. Force takeover creates a new, attributed
   Match Ops session generation and fences the old one.
3. No command grants an ad hoc capability or edits capabilities per user; authority comes from
   assignments and permission bundles.
4. No command sets a data-quality tier; the finalizer computes and stores it on the immutable
   finalization ledger/result version.
5. No conflicted principal—including Platform—can ratify a match exception.
6. There is no impersonation. Support views are read-only, labelled, and audited where private
   information is accessed.
7. Disabled controls explain the governing alternative, such as “Request a correction version”
   instead of offering “Edit result.”

## Implementation sequence

### P0 — Contract and invariant corrections (S, high priority)

**Ships**

- A current command and route inventory replacing assumptions in
  `docs/PLATFORM_ADMIN_WIRING_MATRIX.md`.
- A regression test and server fix that refuses ratification when a Platform actor is conflicted.
- Contract tests proving forbidden fields/actions remain absent from Platform mutation schemas.
- A documented mapping from every old route to its future destination/tab.

**Likely touch points**

- `src/app/api/exceptions/[exceptionId]/ratify/route.ts`
- its new route test
- `docs/PLATFORM_ADMIN_WIRING_MATRIX.md`
- platform route/security tests

**Exit gate**

- Existing ratification works for an unconflicted authorized actor.
- Conflicted League and Platform actors both receive a named refusal.
- No finalizer, official-result, event, standing, or data-quality write is introduced.

### P1 — Command registry and server-backed consequence preview (M)

**Ships**

- A typed registry for every Platform-visible command. Each entry declares:
  `id`, label, entity binding, endpoint adapter, capability, tier, input fields, reason policy,
  typed-confirmation policy, audit action/collections, and availability resolver.
- Four semantic tiers: regular, consequential, governed, and quiet.
- A server preview path for consequential/governed commands. The preview computes live facts:
  what changes, what remains, who is notified, reversibility, blockers, and the audit record
  shape. Static client copy must not pretend to know live dependencies.
- Execution rechecks the same preconditions and refuses if relevant state changed after preview.

**Likely touch points**

- new `src/lib/platform/commandRegistry.ts`
- new server command preview module under `src/server/platform/commands/`
- existing trusted mutation routes and `securePlatformCommand`
- registry/preview contract tests

**Design constraint**

The registry describes and routes commands; it does not authorize them. Every endpoint retains
its account-class, capability, state-machine, conflict, rate-limit, and audit checks.

**Exit gate**

- Every currently visible Platform write is registered or explicitly marked legacy/read-only.
- A test fails if a registry command lacks a tier, capability, audit shape, or endpoint adapter.
- Tier 2/3 preview data comes from the server and cannot become authority on the client.

### P2 — Command controls, consequence sheet, and first responsive fixes (M)

**Ships**

- Extend the existing `Button` system with command semantics; retire `CommandButton` styling
  duplication as callers migrate.
- `PlatformCommandButton` renders tier, shortcut, running/result state, and disabled reason.
- `ConsequenceSheet` replaces generic `CommandDialog` for Tier 2/3 and the current
  `window.prompt` integrity flow.
- Tier 3 typed confirmation; Tier 2/3 reason required; result and audit reference remain inline.
- Replace the five-tile admin grid with the existing `ScrollRail` on narrow layouts.
- Make directory/case rows wrap and stack below 640px rather than truncate.

**Likely touch points**

- `src/components/ui/Button.tsx`
- `src/components/platform/commands/`
- `src/components/platform/PlatformAdminPrimitives.tsx`
- `src/components/platform/command-centre/CommandCentre.tsx`
- existing network, access, people, trust, site, and integrity command callers

**Exit gate**

- 390px: work appears before a vertical wall of stats; primary actions are 44px minimum.
- 768px: no stat-label collision.
- Keyboard focus is trapped/restored correctly; Escape closes; disabled actions are explainable
  on both pointer and touch.

### P3 — Authenticated Platform palette (M)

**Ships**

- A Platform-only palette read model combining:
  entities, matches, open cases, five destinations, workbench tabs, and registry commands.
- Commands bind to an entity selected in the same result set.
- Ranked keyboard navigation, Enter to open/run, and a full-screen mobile presentation.
- Admin workbench URLs without changing the public search projection or exposing private data.

**Likely touch points**

- `src/components/search/GlobalSearch.tsx` or a Platform-specific wrapper
- new authenticated Platform search API/read model
- `src/lib/search/` projection/ranking helpers
- search and capability tests

**Exit gate**

- An operator can find a league and run an allowed league command without navigating a
  directory.
- Unauthorized, inactive, or non-operator accounts receive no Platform command results.
- Mobile and desktop use the same index and ranking rules.

### P4 — Five-destination navigation with compatibility redirects (S/M)

**Ships**

- Platform nav becomes Desk, Network, Integrity, Money, Platform.
- Platform mobile nav shows all five directly and has no More drawer.
- Desktop rail shows the same five destinations; internal sections become workspace tabs.
- Old route URLs redirect to the equivalent destination/tab/workbench and preserve entity IDs
  and meaningful filters.
- `/admin/approvals` and `/admin/campaigns/[campaignId]` are deliberately folded, not orphaned.

**Likely touch points**

- `src/lib/nav.ts`
- `src/components/layout/BottomNav.tsx`
- `src/components/layout/DesktopRail.tsx`
- admin route pages/redirects
- `src/lib/nav.platform.test.ts`

**Exit gate**

- Exactly five Platform primary destinations on desktop and mobile.
- Every old admin URL has an asserted redirect or a documented retained purpose.
- Other roles keep their existing four-plus-More navigation.

### P5 — The Desk and unified case read model (L)

**Ships**

- A server-owned `PlatformCase` discriminated union for applications, athlete verification,
  operational exceptions, reconciliation exceptions, trust cases, payee verification, held
  settlements, and failed jobs.
- Deterministic priority: consequence first, then escalation deadline/age—not newest first.
- Paginated/filterable Desk API instead of several bounded client collection reads.
- Case cards state who is waiting and expose two to four registered actions.
- Keyboard navigation (`j`, `k`, Enter, `1`–`4`, defer with reason).
- Resolved cases leave the Desk and remain available in History.

**Likely touch points**

- new case model under `src/lib/platform/`
- new `/api/platform/desk` read endpoint
- new Desk components replacing `CommandCentre`, `MyWork`, and `PlatformApprovals`
- application/trust/payee/integrity adapters

**Exit gate**

- No case type can disappear because a client-side `recordLimit` window omitted it.
- Clearing a case updates the Desk in place without losing the operator’s scroll/selection.
- An empty Desk is a composed success state, not an empty dashboard.

### P6 — Entity workbenches (L, delivered one entity at a time)

**Order**

1. League
2. Team
3. Athlete
4. Person/account
5. Match

**Ships**

- Entity-specific tabs and action rails rather than branches inside `PlatformEntityDetail`.
- History as a filtered audit tab on every workbench.
- Accountability and policy context on league; roster/contacts on team; Record vs Persona on
  athlete; assignments/affiliations on person; provenance/session/exceptions on match.
- Visible disabled alternatives for forbidden sporting-truth actions.
- Server-paginated tab read models where current client collection windows are insufficient.

**Exit gate per workbench**

- Old detail URL redirects to or renders the new workbench without losing the ID.
- Tabs have loading, empty, error, and permission-denied states.
- Actions are registry-driven and carry identical tier/friction from Desk, palette, and workbench.

### P7 — Application triage and invitation operations (M/L)

**Ships**

- Compute and persist duplicate/risk signals at public application intake.
- Side-by-side comparison against suspected duplicate leagues/applications.
- “Request information” names missing fields and records/sends the request.
- Reuse the existing atomic `approve_league_admin` transaction for approve-and-invite.
- Delivery attempt history, provider result, viewed/accepted timestamps, expiry, revoke, and
  resend on another supported channel.
- Bulk import using the existing CSV/PapaParse foundation: parse, preview, validate, show row
  failures, then send only after confirmation.

**Data rule**

An invitation document being created does not prove delivery. `sent`, `delivered`, `viewed`,
and `accepted` advance only from their corresponding observed event.

**Exit gate**

- Retrying approval is idempotent and cannot create a second organization/league/invitation.
- A failed delivery is visible and actionable.
- Bulk preview and execution use the same validator; malformed rows never enter the send set.

### P8 — Integrity, Live Ops, and quality (M/L)

**Ships**

- Authenticated live read model across in-progress matches using match, clock, assignment,
  session-generation, and report state.
- Live cards show last observed sync, queued/late-event conditions where measured, current
  generation, operator attribution, and exceptions. Do not display an invented “online” state
  if no heartbeat proves it.
- Existing force-takeover and exception-ratification commands enter the registry/consequence
  system.
- Escalation queue uses stored deadlines and the seven-day liveness rule.
- Quality distribution reads the finalizer-computed `dataQuality.tier`; no UI control sets it.
- Policy-floor changes are a new governed command with explicit impact preview.

**Rollout constraint**

Demo can exercise this against the completed V2 model. Beta and Production stay unavailable
until each environment completes its own authority-stage decision, migration gates, and field
capture canary; Demo proof is not promotion proof.

**Exit gate**

- Platform can monitor and start a fenced takeover, but cannot edit an event, score, or clock.
- Conflicted actors cannot ratify.
- Every displayed freshness/quality claim traces to a stored measurement.

## Route migration map

| Existing route(s) | Target |
| --- | --- |
| `/admin`, `/admin/work`, `/admin/approvals` | `/admin` Desk; filters select the former queue |
| `/admin/applications`, `/admin/applications/[id]` | Network application search/workbench; open decisions also appear on Desk |
| `/admin/leagues`, `/admin/teams`, `/admin/athletes`, `/admin/organizations`, `/admin/people`, `/admin/access` | `/admin/network` with entity filter or workbench deep link |
| existing league/team/person detail routes | entity-specific `/admin/network/.../[id]` workbench |
| `/admin/competition`, `/admin/trust`, `/admin/audit` | `/admin/integrity` tabs; entity History remains the primary audit entry |
| `/admin/finance`, `/admin/sponsors`, `/admin/reports`, campaign detail | `/admin/money` tabs/workbenches |
| `/admin/site`, `/admin/control-plane`, `/admin/system` | `/admin/platform` tabs |

Redirects should be implemented with the Next.js 16.3 conventions documented in the installed
`node_modules/next/dist/docs/` guides, not from older App Router assumptions.

## Verification and release gates

Every phase must pass the smallest relevant gate before the next phase starts:

1. **Pure contracts:** registry, case ordering, consequence preview, route map, and policy tests.
2. **Route tests:** authentication, account class, capability, state transition, reason,
   conflict, idempotency, stale-preview refusal, and audit output.
3. **Security invariants:** no direct official-data writes; no capability editing; no manual
   data-quality tier; no conflicted ratification; no private search leakage.
4. **Responsive browser checks:** 390×844, 768×800, 1024px, and a normal desktop viewport.
5. **Interaction checks:** keyboard-only palette/Desk/sheet, focus restore, loading/error/empty,
   touch target sizes, and reduced motion.
6. **Milestone gate:** targeted suites during each slice, then `npm run deploy:ready` before a
   release candidate.
7. **Environment gate:** deploy and canary one execution plane at a time. App Hosting proof is
   not Functions proof, and Demo proof is not Beta/Production proof.
8. **Migration handoff:** any slice touching the access model, finalizer, or
   `src/server/matchOps` must begin from and append its session result to
   `docs/handoff/OPERATIONS_MODEL_V2_HANDOFF.md`.

## Delivery record

P0 through P8 were implemented as one approved migration. The console now has the five
destinations, authenticated palette, unified Desk, entity workbenches, application/invitation
operations, Live Integrity and computed-quality views described above. Compatibility routes
remain as redirects, and the executable wiring/safety inventory lives in
`docs/PLATFORM_ADMIN_WIRING_MATRIX.md`.

Release evidence is appended here after the full local readiness and responsive browser gates
finish. Demo validation does not authorize Beta or Production promotion.

## Post-delivery review, 2026-08-28

A browser review of the delivered console against the redesign artifact found four defects that
the unit suites could not have caught, because each was a gap between "the code runs" and "the
console does the thing the artifact asked for". All four are fixed.

| Defect | Why it mattered | Fix |
| --- | --- | --- |
| **The palette found no entities in demo mode.** `GlobalSearch` short-circuited to static destinations, tabs and commands whenever `isDemoMode`, so typing "kampala" returned "No matching records" while four Kampala leagues were listed on the page behind it. | The palette is where fourteen destinations went. Demo is the mode the console is *shown* in, so this was not a degraded demo — it was a broken feature in the only place anyone looks at it. | `demoEntityPaletteItems()` builds league, team, athlete and person rows from the seeded collections. |
| **Commands never bound to the typed entity.** Both the demo path and the server route concatenated static commands with entities and ranked the union. | The artifact's central palette behaviour is that "kampala" offers commands *already pointed at* that league. An unbound command list makes the operator find the entity a second time, which is the directory round trip the console exists to remove. | `boundCommandPaletteItems()` synthesises entity-bound commands on both paths. On the server it binds only commands the principal is authorized for, so an unauthorized command cannot appear because its entity matched. `.create` commands are excluded — they have no existing target. |
| **The Desk decided nothing.** Every case action was `router.push(item.href + '?command=')`. | "Every decision carries its controls. No detail-page round trip for routine work" was the Desk's central promise, and the delivered Desk broke it for every action. | `useRegistryCommand()` resolves the endpoint from the registry at call time; the Desk opens the consequence sheet in place, runs the command, and removes the cleared case without losing the operator's place in the queue. `resolvePlatformCommandEndpoint()` fills `:param` segments and refuses to build a URL with an unfilled one. |
| **Mobile opened on a wall.** Eyebrow, a very large H1, a four-line paragraph explaining *keyboard shortcuts* on a touch device, then stat tiles — the first case card began roughly 890px down a 390px-wide viewport. | P2's own exit gate said work must appear before a vertical wall of stats. It did not. | The keyboard contract moved to a `md:`-only line; `PlatformAdminHeader` uses a smaller title below `sm`; the Desk header now states the queue ("77 decisions waiting. Oldest has been open 145 days.") instead of describing the sort algorithm, and the stat rail reports consequence counts plus the oldest age rather than "visible cases". |

Two things the review examined and deliberately left alone:

- **Season, fixture and team-invitation commands are absent from the registry, correctly.**
  The artifact's palette mock shows "Create season in Kampala Premier League" and "Invite a
  League Admin". `create_season`, `transition_season`, `create_fixtures` and `create_teams` run
  through `secureLeagueCommand` against **league-scoped** capabilities, which a Platform
  operator does not hold globally, and `create_team_invitation` returns 410 under ADR-004. The
  artifact predates those decisions; the registry is right and the artifact is stale here.
- **`PlatformStatGrid` already rails horizontally below `md`.** The P2 exit gate was met; the
  mobile problem was the header above it, not the tiles.

Regression cover added: entity binding, demo entity rows and endpoint resolution are unit
tested, including that binding respects authorization and that a create command is never
offered against an existing entity.
