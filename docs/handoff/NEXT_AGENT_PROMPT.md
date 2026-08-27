# Pickup prompt: GoalPlace Operations Model V2

Paste the block below to the next agent. Everything it needs is in the repo; nothing depends
on the previous conversation.

---

The **GoalPlace Operations Model V2 Demo migration is complete**. Do not redesign it or rerun
its release canaries unless a new change actually touches those planes.

Read, in order:

1. `docs/handoff/OPERATIONS_MODEL_V2_HANDOFF.md` — live state, exact proofs and traps.
2. `docs/RESULT_ENGINE_V2_MILESTONE.md` — completed deploy runbook.
3. The newest `docs/evidence/operations-model-v2-*.json` — machine-carried proof and explicit
   exclusions.

## Proven Demo state

Target: `manifest-quasar-479416-s7`, named database `fg256`, 2026-08-26.

- V1 drain has zero blocking claims; 18 stranded claims were migrated individually to league
  adjudication without deciding sporting truth.
- Team authority is `retired`; 1123 stored projections have zero drift and zero legacy
  capability coverage gaps. Drain, migration gate and sunset invariants all exit 0.
- Field capture is `enabled` with an empty canary allowlist. Clean, replay, contradictory and
  contradictory-replay paths are cloud-verified. V1 remains enabled; league post-match entry
  remains off.
- App Hosting `build-2026-08-27-001` is live and `/api/environment` reports both its build id
  and `teamAuthorityStage=retired`.
- Nine Cloud Functions are live. `onMatchReportWritten` and `sweepUnreportedMatches` are ACTIVE
  on source hash `4e1e62e95598aaa84050246bd4d4a50e76bb3dc8`. The Firebase CLI directly reads their deployed
  field/V1/league gates, empty field canary list and retired authority stage.
- The separately released missing-report sweep is cloud-verified. Its pre-canary dry-run
  scanned 578 past-cutoff fixtures and found zero eligible. Controlled fixture
  `canary_unreported_20260826` produced exactly one `result_never_reported` operational case,
  zero official records and no score; deployed replay kept the exception at one.
- `deploy:ready` passed with 1440 unit, 155 Rules and 29 Firestore integration tests.

## Proof boundaries

- The original field canary exercised deployed authenticated routes endpoint-by-endpoint, not
  the browser/phone UI. Route orchestration, finalization and persistence are cloud-verified;
  separate UI orchestration is not claimed.
- The field replay was observed contemporaneously. Current cardinalities verify the end state
  but cannot recreate the historical before/after instant.
- Standings are derived from verified match documents. There is no standings write or
  per-match standings ledger. The stale stored collection is preserved but no longer read.
- Historical official events are immutable and keep old `payload.source=result_submission_*`
  values. New events use accurate `sourceType` semantics.
- The bad field report opens `matchOperationalExceptions`, not downstream
  `reconciliationExceptions`, because ingress blocks candidate creation.

## Remaining decisions, not migration gaps

- Production is untouched. Beta and Production App Hosting overlays intentionally default
  team authority to `frozen`; choose a stage only after that environment's own drain and gates.
- League post-match entry is `off` and needs its own canary before enablement.
- Six of nine Functions carry older generations, Storage Rules were not re-released, and one
  pre-existing Firestore index is not represented locally. Do not use an unrestricted
  all-functions deploy to tidy this: `reconcilePaymentIntents` and `lockFantasyLineups` must
  remain undeployed.

## Credentials and commands

The scripts do not load `.env.local`:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/Users/beno1017/.config/goalplace256/staging-admin.json
export GOALPLACE_FIRESTORE_DATABASE_ID=fg256
export GOALPLACE_ADMIN_PROJECT_ID=manifest-quasar-479416-s7
export GOALPLACE_TEAM_AUTHORITY_STAGE=retired
```

Always use the named database through `scripts/lib/firestoreTarget.ts`. The local unit suite
tests the unset/frozen default, so run `env -u GOALPLACE_TEAM_AUTHORITY_STAGE npm run
deploy:ready`; restore `retired` before Demo migration commands.

Absolute rules remain: no synthetic `ResultSubmission`, no source checks after
`FinalizationCandidate`, one independent activation switch per intake source, relative imports
in shared server/kernel code, Rules changes in `firestore.rules.next`, retire authority while
preserving history, and verify deployed planes rather than inferring them from edited files.
