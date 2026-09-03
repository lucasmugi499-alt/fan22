# GoalPlace256

Verified sporting records for Ugandan grassroots sport — football, basketball and rugby.

A league runs its competition here: fixtures, registrations, results, discipline. What comes
out the other side is a record that can be trusted, because of how it got there rather than
because of who typed it.

## The one idea

An official result is never authored. It is **finalized** from evidence, by a server, through a
single path:

```
Field Manager captures  →  League governs  →  Clubs report and dispute  →  GoalPlace finalizes
```

Nothing in a browser can write a score, a league table, an athlete's statistics or a fantasy
point. Every one of those is derived, by a projection, from an official result that came
through `finalizeCandidate` — and there is exactly one of those, deliberately, because a second
writer of official records is the surest way to make two screens disagree about a match.

Corrections work the same way. A ruling does not edit a score; it opens a **result case**,
produces a candidate, and goes through the same finalizer. See
[ADR-005](docs/ADR-005-CLUB-OPERATIONS-AND-RESULT-CASES.md).

## Running it

```bash
npm install
npm run dev
```

The app starts against mock data. `.env.local` points it at a Firebase project; without one it
stays in mock mode rather than pretending to be live.

## Before you push

```bash
npm run deploy:ready
```

Typecheck, lint, unit tests, Firestore rules tests against the emulator, integration tests,
the Functions build, demo data validation, the access and deprecated-field guards, and a
production build. It is one command because a gate somebody assembles by hand is a gate
somebody skips.

## Environments

| Alias | Project | State |
|---|---|---|
| `demo` | `manifest-quasar-479416-s7` | live, synthetic investor dataset |
| `beta` | `goalplace256-beta` | part-provisioned — see [ENVIRONMENT_PROVISIONING.md](docs/ENVIRONMENT_PROVISIONING.md) |
| `production` | not created | intentionally unprovisioned until launch |

Each is a separate Firebase project with its own Auth, its own **named** Firestore database
(`fg256` — there is no `(default)`), its own Storage and its own secrets. Demo is never
converted into beta and beta is never converted into production; the public domain is pointed
at whichever one is live.

Destructive and seeding commands refuse a project they cannot name, refuse production outright,
and require a typed phrase carrying the environment's own name.

## Where to look

| Path | What lives there |
|---|---|
| `src/server/resultFinalizer.ts` | the single finalization path, and the ledger that makes it idempotent |
| `src/server/results/` | result cases: the correction and adjudication model |
| `src/server/standings/` | the standings projection, its repair queue and season membership |
| `src/kernel/` | sport definitions, scoring formulas, official-event validation |
| `src/lib/auth/access.ts` | capability bundles — the authority model, in one file |
| `firestore.rules.next` | the deployed ruleset (not `firestore.rules`) |
| `docs/handoff/OPERATIONS_MODEL_V2_HANDOFF.md` | live migration state: what is done, what is left, what has already bitten |

Read `AGENTS.md` first if you are making changes. The handoff document is the current state of
the work and is kept up to date deliberately.
