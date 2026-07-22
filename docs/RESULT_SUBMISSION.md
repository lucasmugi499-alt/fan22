# Result Submission Workflow

Status: **drafted, not wired to any UI.** The state machine, ownership model, Firestore
rule matrix and evidence storage path are in place. The trusted finalizer and the UI are
not — four decisions below need answering first.

Implements §8 of the product definition: Team Admin A submits, Team Admin B confirms or
disputes, League Admin handles only the exceptions.

---

## Why a separate entity

Team admins never write to `matches`. They write a **claim** (`ResultSubmission`), and a
trusted server-side finalizer promotes a settled claim onto the official match record.

The alternative — granting team admins write access to `matches` — would let the people
being measured author the measurements. The whole platform sells verified data; the
security model has to make that structurally true, not merely conventional.

## The state machine

`src/lib/resultSubmission.ts`, tested exhaustively in `resultSubmission.test.ts`
(every state × state × actor triple is either explicitly permitted or refused).

```
(new) ──submitting team──▶ pending_confirmation
                               │
        opponent confirms ─────┼────▶ confirmed ──system──▶ official
        opponent disputes ─────┤          ▲  │
                               │          │  └──league admin──▶ disputed
        submitter withdraws ───┼──▶ withdrawn │
                               │              │
                               └──▶ disputed ─┘  (league admin upholds or corrects)
                                        │
                                        └──league admin──▶ rejected
```

`official`, `rejected` and `withdrawn` are terminal. A rejected or withdrawn match may
receive a fresh submission at the next `revision`.

### One status field, not two

An earlier draft paired `status` with a separate `opponentResponse`. That is the same shape
as the `MatchStatus` / `verificationStatus` overlap this codebase just spent a migration
removing — two fields describing one truth, free to contradict (`status: 'confirmed'`
alongside `opponentResponse: 'disputed'`; 7 seed records held exactly that class of
contradiction). The opponent's answer *is* the status; who gave it is recorded in
`resolution` and `respondedByUserId`.

### Concurrency: the document id is the matchId

Two team admins can submit for the same match at the same time. Rather than a transaction,
the submission document id **is** the `matchId`, so the second `create` collides with an
existing document and fails atomically in Firestore. First write wins; the loser is routed
to respond to the existing claim instead of opening a competing one.

`canAcceptNewSubmission()` allows a replacement only from `rejected` or `withdrawn`.

### Self-confirmation

`resolveActor()` resolves team membership **before** league adminship, deliberately. Someone
who is both a league admin and an admin of the submitting team resolves as
`submitting_team` and cannot confirm their own claim by switching hats.

### The claim is immutable

`homeScore` / `awayScore` are never overwritten. A league admin who adjudicates a different
score writes `correctedHomeScore` / `correctedAwayScore`, so the claim and the ruling both
survive. `finalScore()` returns the adjudicated score when present.

## Ownership and rules

`firestore.rules`, using a new `canManageTeamById()` mirroring `canManageLeagueById()`.

| Actor | May do | Cannot |
|---|---|---|
| Submitting team admin | create (own team only, status `pending_confirmation`); withdraw while unanswered | confirm own claim; edit after a response; touch `matches` |
| Opponent team admin | confirm or dispute | edit the claimed score; act if they also run the submitting team |
| League admin | confirm, dispute, reject, correct score | change the original claim; declare `official` |
| Platform admin | all of the above | — |
| **System (Admin SDK)** | **`confirmed → official`** | — |
| Anyone | — | **write `official` from a client** |

Claim fields are pinned by `claimUnchanged()`; each actor's writable fields are pinned by
`changedKeysWithin()`. The `events` subcollection is append-only (`allow update: if false`)
so the history of a disputed result cannot be rewritten after the fact.

> **Not yet verified by compilation.** The rules could not be compiled locally — the
> Firestore emulator needs Java, which is not installed here. Braces balance and the one
> non-existent construct (`request.resource.id`) was removed, but **run
> `firebase emulators:start --only firestore` before deploying**, ideally with rules unit
> tests via `@firebase/rules-unit-testing`.

## Evidence storage

`storage.rules`, path `matchEvidence/{matchId}/{teamId}/{fileName}`.

Previously evidence had nowhere safe to go: the only writable paths were `/public`
(world-readable *and* writable by any signed-in user — an opposing team could read or
overwrite disputed-match evidence) and `/users`. The new path is create-only:
`allow update: if false`, deletable only by admins. Evidence that can be swapped after a
dispute opens is not evidence.

Cap is 15MB, below the 50MB media ceiling, because uploads happen from the touchline on
mobile data. The client must compress before upload.

## Finalization path

`confirmed → official` is the only transition producing an official result, and no client
can perform it.

**Recommended host: a Next.js route handler using the Admin SDK**, not a Cloud Function.
`firebase-admin` is already wired in `src/lib/firebase/admin.ts`, `firebase.json` uses
`frameworksBackend`, so server code already deploys — this needs no new runtime. The Admin
SDK bypasses security rules, which is exactly the asymmetry the trust boundary requires.

The finalizer must, in a single transaction:

1. re-read the submission and re-run `checkTransition(..., actor: 'system')` server-side —
   never trust a client-supplied state;
2. write `finalScore()` to the match, set `verificationStatus: 'verified'`, `status:
   'completed'`;
3. set the submission to `official` with `finalizedAt`;
4. append an `events` entry;
5. leave standings alone — they are derived, and `buildLeagueStandings` already gates on
   `isOfficialMatch`.

Athlete statistics are **not** updated here yet; that depends on the athlete stats split
(`athletes/{id}/seasonStats/{seasonId}`), which is separate work.

---

## Open decisions

These block implementation. Each is a product call, not a technical one.

**1. Unresponsive opponent.** The most common real failure will be team B simply never
answering. Currently a league admin can confirm on their behalf
(`league_confirmed_unresponsive`). Should there also be a timeout — auto-confirm after N
days? If so, N, and does auto-confirmation carry the same weight as a real confirmation in
a later dispute? A 72-hour default matching a weekend fixture cycle is the obvious
starting point, but it is your call.

**2. What triggers finalization.** Options: (a) Firestore `onWrite` trigger — needs Cloud
Functions after all; (b) the confirming client calls the route handler, with a sweep for
missed calls; (c) a scheduled sweep only, adding latency. (b) with a periodic reconciliation
sweep is the pragmatic choice, but it means the endpoint must be idempotent.

**3. Correcting an official result.** `official` is terminal and there is no unwind path. A
referee report arriving late, or a scoring error found weeks on, currently has no route
except super-admin surgery. Does the pilot need a correction flow, or is
"official is final" acceptable for one season?

**4. Whether a match can be submitted before it is marked completed.**
`canSubmitResultFor()` currently accepts `live` as well as `completed`, so a team admin can
report at the final whistle before anyone flips the lifecycle. If fixtures are not reliably
moved to `completed`, this matters; if they are, tighten it to `completed` only.
