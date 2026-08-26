# Pickup prompt: GoalPlace Operations Model V2

Paste the block below to the next agent. Everything it needs is in the repo; nothing depends
on the previous conversation.

---

You are continuing the **GoalPlace Operations Model V2** release. The architecture, migration
and live Field Capture canary are complete. Your next job is the separately-scoped
`sweepUnreportedMatches` eligibility/release. Do not redesign or rerun the canary, and do not
bundle the sweep with field capture changes.

**Read first, in this order:**

1. `docs/handoff/OPERATIONS_MODEL_V2_HANDOFF.md` — live state, proof, traps and exact sweep gap.
2. `docs/RESULT_ENGINE_V2_MILESTONE.md` — deploy runbook.
3. The newest `docs/evidence/operations-model-v2-*.json` — machine-carried proof. Anything
   marked `not_run` has not been proven.

## Proven state on Demo

Target: project `manifest-quasar-479416-s7`, database `fg256`, 2026-08-26.

- V1 drain has zero blocking claims; all 18 stragglers were migrated one at a time.
- Team authority is `retired`; 1123 projections were rebuilt with zero stale or coverage gaps.
- Drain, migration gate and sunset invariants all exit 0, including after the final canary
  deploy. The invariants remaining green after more than an hour behaviorally prove the
  Functions authority stage did not rebuild frozen team capabilities.
- App Hosting `build-2026-08-26-006` is live and reports both its exact build id and
  `teamAuthorityStage=retired` from `/api/environment`.
- The clean Field Capture fixture `match_eurdl_18_03` completed 2-1 through the real link, PIN,
  check-in, lineup, clock, events, half-time, second-half, full-time and attestation routes.
  It produced exactly one official version, three canonical goal events, two
  evidence-supported athlete projections and one standings result application. Its forced
  trigger replay produced zero changes.
- The contradictory fixture `match_eurdl_18_04` attested 2-1 with events reconstructing 3-1.
  It produced zero official records and exactly one blocking `matchOperationalExceptions`
  record. Its forced replay kept that exception at one. It correctly produced no
  finalizer-level `reconciliationExceptions` record because ingress blocked the candidate.
- `npm run release:canary -- --match match_eurdl_18_03 --bad-match match_eurdl_18_04` passes.
- Only after those proofs, Demo `GOALPLACE_FIELD_CAPTURE_MODE` was changed to `enabled` and
  only `onMatchReportWritten` was deployed. The deploy log records the Demo env loading and
  success; the final Functions environment value cannot be independently read back from this
  machine. V1 stayed enabled and untouched. League post-match entry remains off.

The canary was manual and endpoint-by-endpoint against the deployed authenticated routes; it
did not use the browser/phone UI. Treat the finalizer, route orchestration and persistence graph
as cloud-verified, but do not claim separate browser UI verification. Likewise, the bad case's
single blocking exception is an ingress `matchOperationalExceptions` record, not a downstream
`reconciliationExceptions` record; the candidate never reached that plane.

The live canary found two route/persistence bugs. Both are regression-tested, pushed and live:
the route's `{action}` shape now adapts to the clock kernel's `{type}` shape, and cleared
optional clock anchors are omitted rather than written as Firestore `undefined`.

## Credentials

The scripts do not load `.env.local`; export all four:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/Users/beno1017/.config/goalplace256/staging-admin.json
export GOALPLACE_FIRESTORE_DATABASE_ID=fg256
export GOALPLACE_ADMIN_PROJECT_ID=manifest-quasar-479416-s7
export GOALPLACE_TEAM_AUTHORITY_STAGE=retired
```

Always pass the database id. No GoalPlace project has a `(default)` database. Use
`scripts/lib/firestoreTarget.ts`; never call `getFirestore()` without the database id.
The local unit suite exercises the unset/frozen default, so run `deploy:ready` with only
`GOALPLACE_TEAM_AUTHORITY_STAGE` removed from that process; restore `retired` before any Demo
projection or migration command.

## Your task: fix sweep eligibility before wiring it

`sweepUnreportedMatches` exists in `functions/src/matchReports.ts` and is not exported from
`functions/src/index.ts`, so `result_never_reported` is never raised. **Do not simply wire it.**
It was modeled against real Demo data and is wrong as written.

Its only eligibility guard is `verificationStatus === 'verified'`. In the first 200 matches it
would open five false cases:

- four `disputed` matches already in active league adjudication, including claims migrated in
  the prior session; and
- one match whose status is still `live`.

Fix `isUnreportedAndStale` in `src/server/finalization/escalation.ts` first. Eligibility must
answer all of these before wiring:

- Is the match in a state where completion was genuinely expected?
- Has the correct grace window passed?
- Is there no report and no other live result source?
- Has it not been called off?

The current `MatchStatus` vocabulary is only `scheduled | live | completed | cancelled`; it
cannot express `postponed` or `abandoned`. Decide that domain gap explicitly before claiming
eligibility handles called-off fixtures. Also, `effectiveCapturePolicy` is undefined on every
Demo match, so all currently take the seven-day fallback rather than the `FIELD_REQUIRED`
three-day window.

The sweep may **detect and surface only**. It must never finalize, manufacture a result source,
or infer a score. Model the corrected predicate against real Demo again before wiring it. Then
wire and deploy it as its own release, with its own evidence. Do not deploy
`reconcilePaymentIntents` or `lockFantasyLineups`, and do not enable Production.

## Rules that remain absolute

- Never conflate implemented, tested, migrated, deployed, enabled and cloud-verified.
- Never manufacture a synthetic `ResultSubmission` for field capture.
- Everything after `FinalizationCandidate` is source-agnostic; no source checks in the planner.
- Every intake source keeps its own switch; unset means off and no switch falls back to another.
- Retire authority, preserve history. Team access indexes are emptied, not deleted.
- Relative imports only below `src/kernel/**` and in shared server modules.
- Firestore Rules live in `firestore.rules.next`, not `firestore.rules`.
- Verify the runtime plane rather than inferring it from a file.
- Update the handoff session log and newest evidence before finishing.
