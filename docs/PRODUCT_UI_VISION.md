# GoalPlace256 UI Foundation

Status: **Phase 1 (foundation) landed. Phase 3 begun on Team Admin.**

This documents what exists, not what is planned. The remaining deliverables named in the
redesign brief (`ROLE_UX_MAP`, `COMPONENT_INVENTORY`, `DATA_VISIBILITY_MAP`, `MOBILE_QA`)
are written as their phases land — writing them ahead of the work would describe an
interface that does not exist.

---

## The governing idea

Complex information, presented simply. Sophistication comes from connected data, live
status and verification history — not from crowded menus, glowing boxes or repeated
buttons.

Two visual modes, one brand:

- **Public and fan surfaces** may be emotional — imagery, match-day energy, bold scores.
- **Operational surfaces** (Team, League, Platform admin) are disciplined — clear
  hierarchy, compact readable data, strong status visibility, few decorative effects.

## Design tokens

`src/app/globals.css`, under `SEMANTIC TOKENS`. Components reference semantic tokens, never
raw brand values, so "what disputed looks like" changes in one place rather than in forty
class strings.

| Group | Tokens |
|---|---|
| Elevation | `--bg-base`, `--bg-elevated`, `--surface-1`, `--surface-2`, `--surface-interactive`, `--surface-interactive-hover` |
| Text | `--text-1`, `--text-2`, `--text-3` |
| Brand | `--brand-primary`, `--brand-secondary`, `--brand-accent` |
| State | `--state-verified`, `--state-pending`, `--state-warning`, `--state-disputed`, `--state-error`, `--state-info`, `--state-live`, `--state-neutral` — each with a matching `-bg` fill |
| Layout | `--topbar-h`, `--bottomnav-h`, `--tap-min` (44px) |

`--tap-min` exists so touch-target size is a token rather than a number someone remembers.

## The status system

`src/lib/statusSystem.ts` is the single source of truth for how trust state is presented.

Every state carries **label + icon + explanation + responsible party**, not just a colour.
Status is never communicated by hue alone — an accessibility requirement, and the
difference between a badge that decorates and one that informs.

States: `draft`, `pending`, `awaiting_confirmation`, `overdue`, `verified`, `official`,
`disputed`, `evidence_requested`, `rejected`, `superseded`, `archived`, `live`.

Domain statuses map into it through `stateForMatch()`, `stateForSubmission()` and
`stateForVerification()`, so a page never invents its own vocabulary.

Components in `src/components/ui/status.tsx`:

- `StatusPill` — compact badge, icon + label + tone.
- `VerificationBadge` — the reusable "Verified by GoalPlace256" control. Tapping it opens
  the provenance sheet. A verification claim the user cannot interrogate is just a graphic.
- `VerificationSheet` — bottom sheet on mobile, centred panel on desktop. Explains what the
  state means, who is responsible, source, method, last updated, and links to the audit
  trail.

## Navigation architecture

Three concepts, deliberately separated. Conflating them is what produced the duplicate
destinations recorded in `BUTTON_AUDIT.md`.

| Concept | Answers | Implementation |
|---|---|---|
| Global navigation | Where am I going? | `Navigation.tsx` — bottom nav on mobile (max 5 slots: 4 + More), rail/top nav on desktop |
| Workspace tabs | Which section of this workspace? | `WorkspaceTabs` |
| Actions | What am I doing? | `ContextualActionBar`, scoped to the active tab |

No concept may appear simultaneously as a nav item, a tab and an action unless the repeat
is an intentional shortcut. The `roleConfig.test.ts` suite already enforces that nav links
stay inside each role's `allowedRoutes`.

`WorkspaceTabs` (`src/components/layout/workspace-tabs.tsx`) provides what the previous tab
strip lacked: 44px minimum targets (it was 40px), scroll snapping, edge fades signalling
more tabs exist, URL synchronisation, and auto-scrolling the active tab into view — without
which a deep link can activate a tab that is off-screen.

Tabs accept an optional `badge` count so work that needs doing pulls the eye.

## Match timeline

`src/components/ui/match-timeline.tsx`. A team admin's real question is never "what status
is this?" but "what happens next, and is it my turn?".

```
Fixture scheduled → Match completed → Result submitted → Opponent confirmation → Official result
```

and when contested:

```
Result submitted → Disputed → League review → Final decision
```

`stepsForSubmission()` derives the path from the submission status, switching to the
disputed path when the happy path stops describing reality. The current step carries a hint
naming who is holding it up — "Waiting on the opposing team admin", "No response in 72
hours — escalated to the league".

## Measured against the brief

Team Admin at 375px, before and after:

| | Before | After |
|---|---|---|
| Workspace tab height | 40px | 44px |
| Elements below 44px target | 6 | 1 (dev-only role switcher, not shipped) |
| Horizontal overflow | 0px | 0px |
| Result cards showing next action | none | every played fixture |

## What has not been done

- Roles other than Team Admin still use the previous patterns.
- One icon family: `hugeicons-react` (43 files) and `@phosphor-icons/react` (30 files) are
  both in use. Consolidating is a mechanical but wide change, deliberately not bundled with
  foundation work.
- `MobileTopBar`, `DesktopNavigationRail`, `MetricStrip`, `AuditTimeline`, `FilterBottomSheet`,
  `FullScreenMobileForm`, skeleton/empty/error/offline states.
- Horizontal scroll-snap discovery carousels (fan surfaces).
- Public marketing pages.

## Constraint that does not move

The redesign may not weaken the verified backend model. The UI lets team admins submit,
confirm, dispute and attach evidence. It must never let a client mark a result official,
write standings, rewrite official statistics, create ledger entries or supersede an official
result. Those belong to the trusted finalizer. Intermediate states are shown honestly while
finalization is pending — `pending` never renders as `official`.
