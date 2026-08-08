# Cloud Function Activation Manifest

Generated from `functions/src/index.ts`. Six of the nine exports are deployed in
`manifest-quasar-479416-s7`: the four search-index triggers and the two finalizer
triggers. The three scheduled jobs are **not** deployed — `firebase functions:list`
returns six rows, and that is the check to run before believing any claim on this page.

## Deployment tracker — result finalizer

Last updated 2026-08-08, after Stage 4.

| | |
| --- | --- |
| Implemented | **yes** |
| Tested | **yes** |
| Canary verified | **yes** |
| Deployed to Demo | **yes** |
| Enabled in Demo | **yes** |
| Beta | **no** |
| Production | **no** |

`GOALPLACE_FINALIZER_MODE=enabled` in `functions/.env.manifest-quasar-479416-s7`,
deployed 2026-08-08 to `onResultSubmissionWritten` and `onOfficialResultFinalized` only.
Verified in the cloud against a live fixture: mode reported `enabled` in the function
logs, all twelve canary checks passed, a duplicate delivery produced no additional
official records, and every collection returned to its exact pre-activation count after
teardown. Scheduled jobs were not deployed as part of this change.

## Region decision: keep `us-central1`

| Surface | Region |
| --- | --- |
| Firestore database `fg256` | **`nam5`** (North America multi-region) |
| App Hosting backend `fan22` | `us-east4` |
| Functions (declared) | `us-central1` |

`us-central1` is the nearest Functions region to `nam5`, and every Firestore-triggered
function here is Firestore-bound rather than App-Hosting-bound. **The App Hosting
mismatch is not a reason to move them** — doing so would put the event triggers further
from the database they read and write. The two scheduled jobs that call App Hosting over
HTTPS (`lockFantasyLineups`, `reconcilePaymentIntents`) pay one cross-region hop per run,
which is negligible at a 5–10 minute cadence.

**Recommendation: leave the region as declared.** This closes the audit's region item in
favour of no change.

## Idempotency

Firestore delivers events at least once, so every handler must tolerate redelivery.

`finalizeSubmission` uses `finalizations/{finalizationKey}` as an idempotency ledger:
the key is read **inside** the same transaction that performs every official write, and
an existing key short-circuits to `{ action: 'skipped', reason: 'already_finalized' }`.
Because all writes share that transaction, a redelivered event either finds the ledger
and does nothing, or commits the whole set once. Verified at
`src/server/resultFinalizer.ts:638-642`.

Search triggers are idempotent by construction: they recompute the projection from the
entity and write a deterministic document id, so a redelivery produces an identical
write (and is skipped entirely when no searchable field changed).

## The nine functions

| Export | Trigger | Path / schedule | Reads | Writes | Scans existing data | Secret | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `onAthleteWrittenIndexSearch` | `onDocumentWritten` | `athletes/{entityId}` | the changed athlete | `searchIndex` | No | — | **Low** |
| `onTeamWrittenIndexSearch` | `onDocumentWritten` | `teams/{entityId}` | the changed team | `searchIndex` | No | — | **Low** |
| `onLeagueWrittenIndexSearch` | `onDocumentWritten` | `leagues/{entityId}` | the changed league | `searchIndex` | — | — | **Low** |
| `onSeasonWrittenIndexSearch` | `onDocumentWritten` | `seasons/{entityId}` | the changed season | `searchIndex` | No | — | **Low** |
| `onResultSubmissionWritten` | `onDocumentWritten` | `resultSubmissions/{matchId}` | submission, match, athletes | `matches`, `officialSportEvents`, `officialAthleteMatchStats`, `officialMatchReconciliation`, `finalizations`, `standings` | No | — | **High** |
| `onOfficialResultFinalized` | `onDocumentCreated` | `finalizations/{finalizationId}` | finalization, fantasy config | `fantasyPointEvents`, `fantasyLeaderboards` | No | `goalplaceFantasyScoringSecret` | **High** |
| `lockFantasyLineups` | `onSchedule` | every 5 minutes | — (calls `/api/fantasy/lock-lineups`) | lineup states | **Yes** — sweeps unlocked lineups | `goalplaceFantasyScoringSecret` | **Medium** |
| `reconcileResultSubmissions` | `onSchedule` | every 60 minutes | pending/overdue submissions | submission status, reminders, retried finalizations | **Yes** | — | **Medium-High** |
| `reconcilePaymentIntents` | `onSchedule` | every 10 minutes | — (calls `/api/payments/reconcile`) | payment intent + ledger state | **Yes** | `GOALPLACE_RECONCILIATION_SECRET` — **MISSING** | **High** |

### Notes that change the risk reading

- **Event triggers will not replay existing data.** Deploying the finalizer does not
  refinalize the 40 existing verified matches, and deploying the search triggers does not
  index the existing 1,120 athletes. Only future writes fire them. The existing search
  index came from a manual snapshot and stays stale until a repair pass runs.
- **`reconcileResultSubmissions` is the sleeper risk.** It scans existing pending
  submissions and calls `retryStalledFinalizations`, so it can push existing records into
  the finalizer even while no user touches anything. It must not be enabled before the
  finalizer canary passes.
- **`reconcilePaymentIntents` would fail every 10 minutes.** Its secret does not exist,
  so the schedule would deploy and then error on every run.
- **`lockFantasyLineups` and `reconcilePaymentIntents` both hard-fail when
  `GOALPLACE_PAYMENT_CALLBACK_BASE_URL` is unset** — `lockFantasyLineups` throws,
  `reconcilePaymentIntents` logs and returns.

## Activation order

1. Configuration and safety — activation flags, secret creation, region confirmed
2. Search triggers only (4 exports, low risk)
3. Search repair: dry run → sample → bounded apply → orphan cleanup → drift report
4. Finalizer in **canary** mode (2 exports) — done
5. One controlled canary submission, verified against the twelve checks — done
6. Finalizer enabled for demo — **done 2026-08-08, Demo only**
7. Scheduled jobs individually, `reconcilePaymentIntents` last — not started

Step 7 remains gated on observing the finalizer against real submissions.
`reconcileResultSubmissions` must not be the first one deployed: see the sleeper-risk note
above.

## Rollback

Deleting a function removes its trigger and, for scheduled functions, its Cloud Scheduler
job:

```bash
npx firebase functions:delete <exportName> --project manifest-quasar-479416-s7 --region us-central1 --force
```

For the finalizer, prefer `GOALPLACE_FINALIZER_MODE=off` over deletion: it stops official
writes without discarding the deployed revision, and it is a config change rather than a
teardown.

## Status vocabulary correction

`implemented`, `deployed` and `cloud-verified` are three different things and this
repository has been conflating them.

| Capability | Implemented | Deployed | Cloud-verified |
| --- | --- | --- | --- |
| Result finalizer (kernel, participation, reconciliation, eligibility) | Yes | **Yes — Demo, `enabled`** | **Yes** — 12/12 checks + idempotent replay |
| Search index triggers | Yes | **Yes** | **Yes** |
| Search index contents | n/a | current, `projectionVersion: 2` | Yes |
| Fantasy scoring on finalization | Yes | **Yes** | **Partly** — trigger fires and the endpoint returns 200; it scored 0 competitions because the canary league has none. Not yet proven end-to-end against a real fantasy competition. |
| Fantasy lineup locking | Yes | **No** | **No** |
| Result reconciliation sweep | Yes | **No** | **No** |
| Payment reconciliation | Yes | **No** | **No** |
| Canonical Firestore Rules | Yes | **Yes** | **Yes** — 0 divergence under authenticated traffic |
| Canonical server authority | **Partial** — legacy `OR` remains | Yes | n/a |
