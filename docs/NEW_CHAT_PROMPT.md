# Paste this into a new Claude Code session (in this repo)

---

I'm rebuilding the entire UI of this app (GoalPlace256) from scratch. The old UI was dark
glassmorphism — glowing borders, cluttered dashboards, no hierarchy, ugly. I don't want it
refined; I want it gone and replaced with something genuinely better.

**Important:** the app's *engine* is already built and I'm keeping it — data layer,
verification/security logic, the trusted result finalizer, Firestore rules, permissions,
and ~1,500 lines of passing tests. That work is proven and has no bearing on how the UI
looks. Do NOT rewrite it, and do NOT read the old UI components for design ideas.

**Before doing anything, read `docs/UI_REBUILD_BRIEF.md` in full** — it is the complete
spec: exactly what to keep vs delete, the non-negotiable trust constraints, why the old UI
failed, the design direction, per-role information architecture, build order, and the
definition of done. Then skim `src/types/index.ts`, `src/lib/status.ts`,
`src/lib/resultSubmission.ts` and `src/lib/auth/roleConfig.ts` so you know what the engine
gives you.

Then work in this order:

1. **Confirm the engine is green first:** `npm test` (449 pass) and `npm run build` compile.
2. **Delete the UI** — `src/app/**/page.tsx`, `src/app/layout.tsx`, all of
   `src/components/**`, and `src/app/globals.css`. Expect the build to break during teardown;
   that's fine.
3. **Rebuild from the foundation up**, following the brief's build order: design tokens +
   typography → app shell (mobile top bar + bottom nav, desktop rail) → workspace tabs →
   status/verification component system → core cards → role workspaces (Team Admin first) →
   public pages → motion → QA.

Non-negotiables from the brief, so they're not lost:
- Mobile-first at 390px, no horizontal overflow, touch targets ≥44px, ≤5 mobile
  destinations per role.
- The trust boundary: the UI lets team admins submit/confirm/dispute results, but NO client
  may ever mark a result official, write standings, or rewrite official stats — those are
  the finalizer's. Pending data must never render as official.
- Abandon glassmorphism. Commit to a real design point of view (the brief recommends
  "Broadcast" — editorial, neutral base + one accent, energy from type and motion, not
  glow). One icon family. Keep `npm test` and `npm run build` green as you go.

Preview with `npm run dev` at http://localhost:3000 (mock data, demo login enabled in dev —
switch roles via the bottom-left pill) and verify each phase at 390px before moving on.

Start by reading the brief and confirming the engine is green, then show me your proposed
design tokens and app-shell direction before building out screens.
