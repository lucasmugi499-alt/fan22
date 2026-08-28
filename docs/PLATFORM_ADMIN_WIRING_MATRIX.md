# Platform Console V2 wiring matrix

**Status:** Implemented on 2026-08-27. Full release verification remains recorded in the implementation plan.

The Platform Console is a dedicated `platform_operator` experience. Its retrieval layer may
show broad operational context, but every mutation remains behind a trusted server route,
account-class and capability checks, live state validation, and an immutable audit event.

## Primary destinations

| Destination | Route | Tabs / surfaces | Primary read source | Mutation posture |
| --- | --- | --- | --- | --- |
| Desk | `/admin` | All, Mine, Applications, Integrity, Trust, Money, History | `GET /api/platform/desk` normalizes eight source queues into `PlatformCase` | Registered case actions open their workbench consequence flow; personal defer writes no source status |
| Network | `/admin/network` | Leagues, Teams, Athletes, Organizations, People, Access, Applications | Authenticated directories plus `GET /api/platform/workbench/[kind]/[id]` | Network, access, application and invitation commands only |
| Integrity | `/admin/integrity` | Live, Escalations, Quality, Trust, Audit | `GET /api/platform/integrity` plus existing trust/audit projections | Fenced takeover, exception transition/ratification, moderation and policy-floor commands |
| Money | `/admin/money` | Allocations, Payees, Holds, Sponsors, Reports | Existing allocation/compliance/report projections | Payee workflow only; settlement release and real payout remain disabled |
| Platform | `/admin/platform` | Site, Controls, Health, Activations, Audit | Site, health, activation and immutable-audit reads | Versioned site settings and governed environment activation |

Desktop and mobile expose exactly these five destinations for Platform Operators. Other roles
retain their existing navigation model. The authenticated command palette is a retrieval layer,
not a sixth destination.

## Command contract

`src/lib/platform/commandRegistry.ts` is the canonical inventory of 49 Platform-visible
commands. Every entry declares its endpoint, capability, consequence tier, required inputs,
reason/confirmation policy, audit action and collection, destination and search terms.

| Tier | Operator friction | Example |
| --- | --- | --- |
| Regular | Required reason where declared; no consequence acknowledgement | Update a team profile |
| Consequential | Server consequence preview, reason, explicit acknowledgement | Suspend a league, reject an application |
| Governed | Server consequence preview, reason, exact typed phrase | Ratify, take over, revoke, change capture-policy floor |
| Quiet | Minimal UI, still trusted and audited | Defer a Desk case for the current operator |

`POST /api/platform/commands/preview` computes current changes, unchanged facts,
notifications, reversibility, blockers, audit shape, state fingerprint and expiry. The preview
does not authorize execution. The target route rechecks account class, capability, current
state and version/conflict preconditions before writing.

## Read and command API wiring

| Concern | Read API | Command API(s) | Capability / invariant | Audit target |
| --- | --- | --- | --- | --- |
| Desk | `/api/platform/desk` | `/api/platform/desk/defer` | `platform.admin.manage`; source record is unchanged | `platformCaseDeferrals` |
| Palette | `/api/platform/palette` | Registered target endpoint | Active `platform_operator`; private index never enters public search | Endpoint-defined |
| Entity workbenches | `/api/platform/workbench/[kind]/[id]` | Registry-driven network/account/takeover APIs | Per-tab server pagination; payee and session secrets redacted | Endpoint-defined |
| League/team/athlete lifecycle | Workbench + directories | `/api/platform/network` | `platform.network.manage` / `platform.athlete.manage`; lifecycle and dependency checks | Entity collection |
| Application triage | `/api/platform/applications/[applicationId]` | Same route and `/api/access` | `platform.application.review`; approve-and-invite is atomic and retry-idempotent | `leagueAdminApplications` |
| Invitation delivery | Application/access reads | `/api/platform/invitations/[invitationId]`, `/bulk` | `platform.access.manage`; token rotation and live-state checks | `invitations`, `invitationDeliveryAttempts` |
| Live integrity | `/api/platform/integrity?view=live` | `/api/matches/[matchId]/takeover` | New attributed generation fences the old session; clock/events are not edited | Match Ops audit/exception records |
| Escalations | `/api/platform/integrity?view=escalations` | `/api/exceptions/[exceptionId]/ratify`, `/api/platform/competition-integrity` | Unconflicted actor required; stored deadline or seven-day liveness | Exception collection |
| Quality | `/api/platform/integrity?view=quality` | `/api/platform/capture-policy-floor` | Reads finalizer-computed tier; floor only tightens future fixture creation | `platformSettings` |
| Trust | Existing trust projection | `/api/admin/actions` `resolve_report` | `platform.trust.decide`; decision reason required | `reports` |
| Site | `/api/platform/site` | Same route | `platform.site.manage`; expected version required | `platformSettings` |
| Environment | control/health reads | `/api/platform/environment-activation` | `platform.environment.activate`; stage machine and typed confirmation | `environmentActivations` |
| Payee | Redacted workbench/queue | `/api/platform/payee` | `platform.payee.verify`; payout identity remains isolated | `athletePayees` |
| Audit | Existing immutable projection | None | Browser writes/deletes are unavailable | Server-owned `adminAuditEvents` |

## Workbench routes

| Entity | Route | Distinct context |
| --- | --- | --- |
| League | `/admin/network/leagues/[leagueId]` | Overview, policy, teams, accountability, history |
| Team | `/admin/network/teams/[teamId]` | Overview, roster, contacts, matches, history |
| Athlete | `/admin/network/athletes/[athleteId]` | Sporting record, persona boundary, payee state, history |
| Person | `/admin/network/people/[userId]` | Account, assignments, affiliations, history |
| Match | `/admin/integrity/matches/[matchId]` | Overview, provenance, sessions, exceptions, history |
| Application | `/admin/network/applications/[applicationId]` | Risk comparison, evidence, review and invitation delivery |
| Trust case | `/admin/integrity/trust/[caseId]` | Read-only case evidence; decisions use the registered trust command |

Session token hashes, invitation token hashes/action URLs and payout secrets are explicitly
removed from workbench and operational API responses.

## Legacy route migration

The executable mapping is `src/lib/platform/adminRoutes.ts` and is covered by
`src/lib/platform/adminRoutes.test.ts`. Search/status/filter query parameters are forwarded;
an obsolete `tab` value cannot replace the new owning workspace tab.

| Legacy route(s) | Destination |
| --- | --- |
| `/admin/work`, `/admin/approvals` | Desk Mine / Applications |
| `/admin/applications`, `/admin/leagues`, `/admin/teams`, `/admin/athletes`, `/admin/organizations`, `/admin/people`, `/admin/access` | Network owning tab |
| League, team, person and application detail routes | Corresponding Network workbench with ID preserved |
| `/admin/competition`, `/admin/trust`, `/admin/audit` | Integrity Escalations / Trust / Audit |
| Trust detail route | Integrity trust case with ID preserved |
| `/admin/finance`, `/admin/sponsors`, `/admin/reports` | Money owning tab |
| Campaign, organization and sponsor detail routes | Folded Money/Network view with ID preserved as a filter |
| `/admin/site`, `/admin/control-plane`, `/admin/system` | Platform Site / Controls / Health |

## Non-negotiable safety proof

- No registry input or Platform API writes score, event, standing, statistic, capability or
  data-quality fields. Contract tests fail if those mutation shapes appear.
- Platform cannot edit a live clock or event. Takeover creates a new attributed generation and
  fences the previous one.
- No command grants ad hoc user capabilities. Authority still comes from canonical assignments
  and permission bundles.
- Quality distribution only reads `finalizations.dataQuality.tier`; no UI or Platform command
  sets it.
- A conflicted principal, including Platform, is refused by the ratification route and preview.
- There is no impersonation command or support mode.
- Capture-policy floor changes are versioned, tighten-only and never rewrite existing fixtures.
- Finance remains monitoring-only until the PSP, KYC, legal, refund and reconciliation gates
  are approved.

## Test anchors

- Registry and forbidden mutation fields: `src/lib/platform/commandRegistry.test.ts`
- Route migration: `src/lib/platform/adminRoutes.test.ts`
- Ratification conflicts: `src/app/api/exceptions/[exceptionId]/ratify/route.test.ts`
- Palette privacy/authorization: `src/app/api/platform/palette/route.test.ts`
- Desk normalization/order/read: `src/lib/platform/platformCases.test.ts`,
  `src/server/platform/desk/platformDesk.test.ts`, `src/app/api/platform/desk/route.test.ts`
- Workbench redaction: `src/server/platform/workbenches/platformWorkbench.test.ts`,
  `src/app/api/platform/workbench/[kind]/[id]/route.test.ts`
- Application/invitation risk, idempotency and delivery:
  `src/lib/platform/applicationRisk.test.ts`, `src/app/api/access/route.test.ts`,
  `src/app/api/platform/invitations/bulk/route.test.ts`
- Integrity provenance and policy floor: `src/server/platform/integrity/integrityReadModel.test.ts`,
  `src/app/api/platform/integrity/route.test.ts`,
  `src/app/api/platform/capture-policy-floor/route.test.ts`
