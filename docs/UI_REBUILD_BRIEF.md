# GoalPlace256 — UI Rebuild Brief

**Paste this into a fresh chat to start the new UI from scratch.** It is self-contained.
Everything it references lives in this repo; a Claude Code session can open the files named
here.

---

## 0. The one-line job

The product's engine (data, security, verification logic, tests) is built and proven. The
**entire visible UI is being deleted and rebuilt from the ground up.** The old UI was dark
glassmorphism — glowing borders, cluttered dashboards, no hierarchy. It is not being
refined; it is being replaced. Do not look at the old components for inspiration. Look at
them only to learn what the engine expects.

---

## 1. What GoalPlace256 is

The verified digital operating system for grassroots sports leagues. Starting market:
Uganda. It connects leagues, teams, team admins, athletes, fans, sponsors and platform
governance.

**The principle everything serves:** *Verification creates trust. Trust creates value.*

A result a team types in is a *claim*. It becomes *official* only after the opposing team
confirms it (or a league admin resolves a dispute), and only a trusted server finalises it.
The whole UI exists to make that trust chain legible — who claimed what, who confirmed it,
what is official versus pending, and whose turn it is to act.

Six audiences, six moods, one brand:

| Role | The UI should feel like |
|---|---|
| Fan | A premium local-sports app |
| Athlete | A career portfolio |
| Team Admin | A focused team operations console |
| League Admin | A league operating desk |
| Platform Admin | A trust & governance command centre |
| Sponsor | An impact & proof dashboard |

---

## 2. What you are KEEPING (the engine — do not rewrite)

This is tested, working logic. Reuse it exactly. Rewriting it means re-deriving a security
model and re-finding bugs that are already fixed.

**Types** — `src/types/index.ts` (701 lines). All domain types: `League`, `Season`, `Team`,
`Athlete`, `Match`, `Challenge`, `ResultSubmission`, `SupportPledge`, `VerificationStatus`,
`MatchStatus`, etc. Status vocabularies are **canonical lowercase** — never compare against
display-cased strings.

**Status logic** — `src/lib/status.ts`. `isOfficialMatch()`, `normalize*()`, `*Label()`.
The single definition of what counts as official.

**Season & scoring** — `src/lib/season.ts`. Per-sport scoring (football 3/1/0, rugby 4/2/0,
basketball 2/–/0). `currentSeasonFor()`, `scoringForSeason()`.

**Standings** — `src/lib/leagueModel.ts`. `buildLeagueStandings(teams, matches, {seasonId,
scoring})`. Already gates on `isOfficialMatch` — pending/disputed results never move a
table. Do not build a second standings calculator.

**Result workflow** — `src/lib/resultSubmission.ts` (pure state machine).
`checkTransition()`, `resolveActor()`, `planFinalization()`, `stepsForSubmission`-style
inputs. The finalizer in `functions/src/` applies it. 442 tests cover it.

**Permissions & roles** — `src/lib/auth/permissions.ts` (`canAccessRoute`, `hasAnyRole`,
capability helpers) and `src/lib/auth/roleConfig.ts` (nav + allowed routes per role). A test
suite enforces that nav links stay inside each role's allowed routes.

**Auth & demo mode** — `src/context/AuthProvider.tsx`, `src/lib/auth/demoMode.ts`,
`src/lib/auth/mockAuth.ts`. Demo login is gated behind `isDemoModeEnabled`. Keep the gate.

**Data layer** — `src/data/**` (23 files: mock data + provider abstraction) and
`src/lib/firebase/**` (5 files). `useGoalPlaceData()` is the hook every page reads from. It
already normalises statuses at the boundary. Keep using it.

**Backend** — `functions/src/`, `firestore.rules`, `storage.rules`. Do not touch these from
UI work.

**Tests** — everything under `*.test.ts` (1,549 lines). They must stay green.

### Reusable-but-review (built for the old UI, salvage if useful)

- `src/lib/statusSystem.ts` — maps domain states → `{label, icon, tone, explanation,
  owner}`. Good data model for a status system; keep the mapping, restyle freely. Note it
  imports `hugeicons-react` — if you switch icon libraries, swap those.

### Delete everything else

`src/app/**/page.tsx` and `layout.tsx`, all of `src/components/**`, `src/app/globals.css`.
Rebuild from nothing.

---

## 3. Non-negotiable constraints (breaking these breaks the product)

1. **The trust boundary.** The UI may let team admins *submit*, *confirm*, *dispute* and
   *upload evidence*. It must NEVER let any client write a result `official`, write
   standings, rewrite official athlete stats, create finalization ledger entries, or
   supersede a result. Those are the finalizer's alone. `firestore.rules` enforces this;
   the UI must not even present controls that imply otherwise.

2. **Pending never renders as official.** A played-but-unverified result must look
   unverified. Standings/stats show only official data. This is the entire product promise —
   getting it wrong visually is worse than a bug.

3. **Mobile-first, 390px.** Design the phone first, then expand to desktop. Not the reverse.
   No horizontal overflow. Touch targets ≥ 44px. Max 5 primary mobile destinations per role.

4. **Named Firestore database is `fg256`**, not `(default)`. Already handled in the engine;
   don't undo it.

5. **Public metrics are labelled.** Demo/seed numbers must say "demonstration data" — never
   presented as live traction. A verification product cannot fake its own numbers.

6. **Three distinct navigation concepts** — global nav (where am I going), workspace tabs
   (which section), actions (what am I doing). Never make one thing appear as all three. This
   is what made the old UI feel cluttered and repetitive.

---

## 4. Why the old UI failed (do not repeat)

- Glassmorphism everywhere: `backdrop-filter: blur()` on ~55 surfaces including list rows —
  expensive on the mid-range Android phones this product targets, and visually muddy.
- Glowing borders and neon gradients as the default decoration, not as emphasis.
- A 60px "Welcome back, {name}" hero as the largest element on every logged-in page —
  carrying zero information.
- Hardcoded diagonal light streaks across the viewport that read as rendering glitches.
- Equal-weight metric-card grids: six things all shouting means no priority communicated.
- The same destination reachable from nav, a tab, and a button on one screen.
- Roles that rendered nothing (team admin's home was literally empty).

---

## 5. Design direction (a real point of view, not "clean it up")

The old look was "dark SaaS dashboard template." The new one should not be. Lock the
**mood and tokens first**, before any screen.

**Recommended direction — "Broadcast":** editorial and confident, the way modern sports
broadcast graphics and a premium fintech app both feel. Concretely:

- **Abandon glassmorphism entirely.** Flat, opaque surfaces with real elevation via subtle
  shadow and a considered border — not blur.
- **A near-neutral base with ONE confident accent.** Energy comes from **typography,
  photography and restrained motion**, not from glow. Pick the accent deliberately (the
  existing emerald is fine, or reconsider). Semantic state colours (verified / pending /
  disputed / live) stay distinct and are never the only signal — always paired with
  icon + label.
- **Two surface modes, one system.** Fan/public: expressive — bold type, real athlete
  photography, match-day energy, horizontal discovery carousels. Operational (team/league/
  platform admin): calm, dense, high-legibility — strong status visibility, few effects.
- **Typography does the work.** One expressive display face for scores/headlines, one highly
  readable UI face for everything else. Tabular numerals for scores, standings, currency.
  No long uppercase labels.
- **Controlled complexity.** Layer information: immediate (what needs me now) → workspace
  detail (tabs, drawers) → audit/history (behind "view history / why is this verified?").
  Never put the audit trail on the main dashboard.
- **One priority per screen.** The operational home leads with a single "what needs you"
  card, then a compact metric strip — not a wall of equal cards. (The interim team-admin
  home in `src/components/home/ops-home.tsx` demonstrates this pattern; it may be salvaged or
  redone, but the *principle* holds.)
- **Motion:** 120–180ms micro-interactions, 220–320ms drawers, subtle. Respect
  `prefers-reduced-motion`. No scroll-reveal inside dashboards. GSAP only for marketing hero
  moments, if at all.

You are free to reject "Broadcast" and propose a stronger direction — but commit to *a*
point of view and express it in tokens before building screens. The failure mode to avoid is
another generic dark dashboard.

---

## 6. Tech constraints

- Next.js App Router, React, TypeScript, Tailwind CSS. Keep these.
- **Design tokens first**: semantic CSS variables (elevation, text ramp, brand, state,
  layout constants incl. a `--tap-min`). Components reference tokens, never raw values.
- **One icon family.** The old app mixed `hugeicons-react` and `@phosphor-icons/react` —
  pick one and use it everywhere.
- Motion for React for app interactions. Native CSS scroll-snap for carousels — no heavy
  carousel library.
- Zustand for local UI state (already present). Do not add a second state library.
- Before adding any dependency, confirm the stack can't already do it.
- Every component needs loading (skeleton), empty, and error states. Empty states explain
  *why* it's empty and *what happens next*.

---

## 7. Information architecture (per role, concise)

Each role gets ≤5 mobile bottom-nav destinations; lower-frequency areas go under "More".
Full role detail (data received, notifications, restricted actions) is in the old
`ROUTE_AUDIT.md` and `roleConfig.ts` — read those for the exhaustive map.

- **Fan** — Home · Matches · Discover · Support · Profile. Emotional. Horizontal discovery.
  Never sees operational controls.
- **Athlete** — Dashboard · Matches · Profile · Support · More. Career portfolio. Official
  stats visibly separated from athlete-editable profile fields, each stamped verified +
  source + "how this is calculated".
- **Team Admin** — Team · Roster · Fixtures · Updates · More. Ops console. The result
  submission → opponent confirmation → official timeline is the centrepiece. Cannot write
  official results/standings/stats.
- **League Admin** — Overview · Teams · Fixtures · Verification · More. Operating desk.
  Verification is an **exception queue** (disputes, overdue confirmations, corrections) — the
  league does NOT verify every normal mutually-confirmed result.
- **Platform Admin** — Control · Approvals · Trust · Reports · More. Governance command
  centre with provenance (who submitted/confirmed, which role, when, previous version,
  evidence, finalization source) shown as audit timelines. Not "league admin with more
  buttons".
- **Sponsor** — impact & proof only (supported entities, verified activity, reach, evidence,
  reports). No competition controls. Pilot: keep as a platform-admin-controlled report view.

---

## 8. Build order

1. **Foundation** — design tokens, typography, spacing, the app shell (mobile top bar +
   bottom nav, desktop rail), workspace tabs, button hierarchy, the status/verification
   component system, loading/empty/error primitives.
2. **Core components** — match card, match timeline, athlete/team/league cards, verification
   queue card, audit timeline, responsive table↔card, forms (full-screen mobile sheets +
   bottom sheets), verification drawer.
3. **Role workspaces**, in this order (data-producers first): Team Admin → League Admin →
   Fan → Athlete → Platform Admin → Sponsor report.
4. **Public pages** — landing, pilot, verification, sponsors, how-it-works.
5. **Motion & polish** — only after layout/nav/actions work.
6. **QA** — the acceptance list below.

Verify each phase at 390px in the browser before moving on. Keep `npm test`, `tsc` and
`npm run build` green throughout.

---

## 9. Definition of done

- Usable at 390px; zero accidental horizontal overflow anywhere.
- Every role ≤5 primary mobile destinations; nav / tabs / actions have distinct roles; no
  duplicate destination without a justified shortcut.
- Every visible control navigates, opens a real workflow, changes meaningful state, or is
  removed.
- Fan screens have no admin controls. Each role feels like its intended product (§1 table).
- Official data always shows verification status + provenance. Pending never appears as
  official. Standings use official results only.
- Tables become readable cards on mobile. Discovery uses native scroll-snap.
- Status is never communicated by colour alone.
- Demo metrics are clearly labelled.
- Reduced-motion respected; keyboard-navigable; visible focus; WCAG-conscious contrast.
- **The engine is untouched**: finalizer, rules, permissions, named-database handling and all
  1,549 lines of tests still pass.

---

## 10. How to start (in the new chat)

```bash
# 1. Confirm the engine is intact and green before deleting anything.
npm test        # 449 tests should pass
npm run build   # should compile

# 2. Delete the UI (the engine has no import dependency on these):
#    - src/app/**/page.tsx and layout.tsx
#    - src/components/**
#    - src/app/globals.css
#    Rebuild from the foundation up. Expect the build to break until the new
#    shell + a first page exist — that is fine, it is a deliberate teardown.

# 3. Preview at 390px as you build:
npm run dev     # http://localhost:3000  (demo login enabled in dev)
```

The app runs in mock mode by default (`NEXT_PUBLIC_DATA_MODE` unset) — no Firebase needed to
build and see the UI. Demo role switching is available in dev via the bottom-left pill.

Read before building: this brief, then `src/types/index.ts`, `src/lib/status.ts`,
`src/lib/resultSubmission.ts`, `src/lib/auth/roleConfig.ts`, and skim `docs/` for the product
definition and the result-submission design. Do not read old components for design ideas.
