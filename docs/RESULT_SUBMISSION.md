# Result Submission Workflow

Status: **implemented locally and candidate-rules tested; staging end-to-end QA pending.**
The state machine, ownership model, provider methods, mobile field report, opponent
confirmation, league adjudication, evidence storage, trusted finalizer, and immutable
provenance UI are wired.

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
                               │  │
        opponent confirms ─────┤  └──72h, system──▶ confirmation_overdue
        opponent disputes ─────┤                          │
        submitter withdraws ───┼──▶ withdrawn             │ league admin:
                               │                          │  confirm / dispute /
                               ▼                          │  extend / reject
                          confirmed ◀─────────────────────┘  (late opponent reply
                               │  ▲                            also accepted)
                    system     │  │ league admin upholds or corrects
                               ▼  │
                          official │
                               │   └── disputed ──league admin──▶ rejected
                    system     │
                               ▼
                          superseded  (replaced by an approved correction version)
```

`rejected`, `withdrawn` and `superseded` are terminal. `official` is **not** — it is
replaceable by a correction version, via `system` only. A rejected or withdrawn match may
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

`firestore.rules.next`, using `canManageTeamById()` mirroring `canManageLeagueById()`.

| Actor | May do | Cannot |
|---|---|---|
| Submitting team admin | create (own team only, status `pending_confirmation`); withdraw while unanswered | confirm own claim; edit after a response; touch `matches` |
| Opponent team admin | confirm or dispute | edit the claimed score; act if they also run the submitting team |
| League admin | confirm, dispute, reject, correct score, extend the deadline, raise a correction request | change the original claim; declare `official` or `superseded` |
| Platform admin | all of the above; approve corrections after the 72h grace window | — |
| **System (Admin SDK)** | **`confirmed → official`**, `official → superseded`, `pending_confirmation → confirmation_overdue` | — |
| Anyone | — | **write `official` or `superseded` from a client** |

Claim fields are pinned by `claimUnchanged()`; each actor's writable fields are pinned by
`changedKeysWithin()`. The `events` subcollection is append-only (`allow update: if false`)
so the history of a disputed result cannot be rewritten after the fact.

The candidate rules compile and pass the Firestore emulator suite. On July 26, 2026 the
suite passed 65 tests, including direct official-result writes, role escalation, athlete
official-stat edits, financial forgeries, support-need self-approval, support-completion
forgery, attendance forgery, and feed-counter tampering.

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

Host: a Firestore **`onWrite` Cloud Function** (see Decision 2), applying the plan returned
by `planFinalization()` inside a single transaction. The Admin SDK bypasses security rules,
which is exactly the asymmetry the trust boundary requires.

The finalizer must, in that transaction:

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
## Decisions (settled)

### 1. Unresponsive opponent — silence is never consent

No auto-confirmation in the pilot. 72-hour window, reminders at 24h and 48h, then
`confirmation_overdue`, which escalates to the league rather than deciding anything.

Once overdue a league admin has exactly four options — confirm on behalf, dispute, extend
the deadline (back to `pending_confirmation`), or reject. A late opponent response is still
accepted and still carries **mutual** provenance.

Provenance is recorded in `finalizationSource`, deliberately separate from `status`:

| source | meaning |
|---|---|
| `mutual_confirmation` | the opponent actually agreed |
| `league_admin_dispute_resolution` | adjudicated after a dispute |
| `league_admin_nonresponse_confirmation` | confirmed after silence — **weaker** |
| `correction` | produced by a correction version |

The public result may read "Official". The audit trail must always show which of these it
was. `confirmedByUserId`, `confirmationReason`, `confirmedAt` and `evidenceRefs` are stored
alongside.

Configurable per-league timeout confirmation is explicitly deferred until the pilot shows
reliable behaviour.

### 2. Finalization — `onWrite` trigger, idempotent, with an hourly sweep

Clients only submit, confirm, dispute and record league decisions. Clients never write
official match status, standings, team records or official athlete statistics.

Idempotency key: `` `${matchId}:${submissionId}:${resultVersion}` ``. `planFinalization()`
returns `noop / already_finalized` when the key has been processed or `finalizedAt` is set,
so a retried trigger and the reconciliation sweep cannot double-apply a result. It also
returns `noop / mismatched_parents` if the submission's match, league or season does not
match the target — a submission can never be finalized onto the wrong fixture.

The decision logic is a **pure function**; shared server code applies its plan inside one
transaction and does nothing else. Both the Cloud Function and the authenticated App Hosting
route use that same executor.

Staging is currently on Spark, which cannot deploy the v2 trigger. The hosted staging build
therefore calls the App Hosting route after a valid opponent or league decision. The route
verifies the staging ID token, verifies that the caller settled the submission, and uses the
managed App Hosting identity to transact against `fg256`. No service-account private key is
shipped. The Cloud Function remains the preferred automatic trigger once staging uses Blaze.

Standings need no work in the finalizer: they are derived and `buildLeagueStandings` already
gates on `isOfficialMatch`. Athlete statistics remain out of scope until the athlete stats
split lands.

### 3. Corrections — versioned, never destructive

`official` is **not** terminal. Referee corrections, eligibility rulings, abandoned matches
and disciplinary decisions are ordinary sports operations, and a live pilot cannot depend on
super-admin database surgery for them.

```
Official result v1 ──correction request──▶ review ──▶ Official result v2
       └─ retained, marked `superseded`
```

A league admin may correct within `CORRECTION_SELF_SERVICE_HOURS` (72h) of finalization;
after that a platform admin must approve. A reason is mandatory in both cases. The version
swap itself is performed by the finalizer — clients can write the correction *request*
fields, never `official` or `superseded`.

### 4. Submitting from a live match

Allowed from `live` or `completed`, but only with `submittedAsFinal: true` — the team admin
must explicitly declare the match ended, so an in-progress score cannot start a confirmation
by accident. This is enforced in the rules at create time.

On finalization the match is moved to `status: 'completed'`, `verificationStatus: 'verified'`
automatically, rather than depending on someone to flip the lifecycle by hand.

---

## Remaining work

Done:

- `functions/` package with the `onWrite` trigger and the hourly reconciliation sweep, both
  thin wrappers over `planFinalization()`. Compiles and the entrypoint loads.
- Idempotency ledger at `finalizations/{finalizationKey}`, written inside the same
  transaction that applies the result.
- Security rules suite (`npm run test:rules`) covering the create/answer/adjudicate matrix
  and the trust boundary.
- Team Admin submit, confirm and dispute UI backed by provider transactions and live
  submission listeners.
- League Admin uphold, correct and reject UI backed by the same workflow.
- Authenticated App Hosting finalization route sharing the Cloud Function transaction code.
- Candidate rules are selected by `firebase.staging.json`; the latest local candidate must
  pass the final gate before deployment.

Outstanding:

1. Run the staging seed so the 756 existing events are written into submission
   subcollections and the obsolete root collection is removed.
2. Run the full Team Admin A -> Team Admin B -> finalizer -> standings workflow against
   the deployed staging environment, including duplicate-trigger and stale-version cases.

The hourly function now dispatches deterministic 24h/48h opponent reminders. League and
Platform correction review creates an immutable replacement version and supersedes the
previous official record through the trusted finalizer.

### Deploy notes

The Firestore instance is the **named database `fg256`**, not `(default)`. Both
`getFirestore(DATABASE_ID)` and the trigger's `database` option depend on this. A v1
trigger, or a v2 trigger without `database`, listens to `(default)` — which is empty in
this project. It would deploy cleanly, report healthy, and never fire.

```bash
npm run functions:build      # compile, including the shared pure logic
npm run test:rules           # needs a JDK
npm run deploy:staging       # candidate rules only, explicit staging config
```
