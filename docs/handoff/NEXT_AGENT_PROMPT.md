# Pickup prompt: GoalPlace Operations Model V2

Paste the block below to the next agent. Everything it needs is in the repo; nothing depends
on the previous conversation.

---

You are continuing the **GoalPlace Operations Model V2** migration. The architecture is
decided and built. Your job is operational: finish the migration safely against the real Demo
environment and prove it. Do not redesign anything.

**Read first, in this order:**

1. `docs/handoff/OPERATIONS_MODEL_V2_HANDOFF.md` : current state, the method in order, and the
   traps that have already bitten. Every trap listed there was a real bug on this branch.
2. `docs/RESULT_ENGINE_V2_MILESTONE.md` : the deploy runbook.
3. `docs/evidence/operations-model-v2-*.json` : the latest file is what has actually been
   proven. Anything marked `not_run` has not been.

**Where things stand.** All engineering is done and green: 1392 unit tests, 155 rules tests, 26
emulator integration tests, `npm run deploy:ready` exit 0. On the Demo project
(`manifest-quasar-479416-s7`, database `fg256`) the Firestore rules, indexes, storage rules,
App Hosting and three Cloud Functions are deployed and verified. `main` is pushed.

**What has NOT happened, and this is the whole of your job:**

- The V1 drain has never run against real data.
- No straggler workflows have been migrated.
- Team authority is still `frozen`, not `retired`.
- Access projections have never been rebuilt, so every stored league index still carries the
  pre-ADR-003 capability names.
- Sunset invariants have never run.
- No field capture canary has been verified.

**You need credentials.** Every migration script initializes with `applicationDefault()`:

```bash
export GOOGLE_APPLICATION_CREDENTIALS_JSON='<service account for manifest-quasar-479416-s7>'
```

Ask for them. Do not work around their absence, and do not mark a gate passed that you could
not run.

## Do this, in order

**1. Inventory.** `npm run access:v1-drain`. Record all five counts in the evidence file. Two
block retirement: claims awaiting a team answer, and open team invitations. Active team
assignments are inventory and do not block.

**2. Migrate stragglers.** Prefer letting the original parties finish. For the ones that never
will, `npm run access:migrate-v1 -- --match <id> --reason "<why>"`, one at a time. Migration
changes the governance route and never decides sporting truth.

**3. Re-run the drain.** Blocking counts must be zero before you go further.

**4. Retire team authority.** `export GOALPLACE_TEAM_AUTHORITY_STAGE=retired`. Not before
step 3 reads zero: the two-sided guard on `resultSubmissions` fails on both its terms at once,
so an open claim stops being answerable by anybody.

**5. Rebuild projections.** `access:migrate:dry-run`, then `:apply`, then `:gate`. Changing the
capability catalogue does not rewrite what is already materialized.

**6. Prove it.** `npm run access:sunset-invariants` must exit 0, against stored documents.

**7. Delete the migration scaffolding.** `acceptedSpellings()` in
`src/server/access/capabilities.ts` lets the server accept pre-ADR-003 capability names so
League Admins kept working before the rebuild. Once step 6 is clean, remove it and its tests.
Leaving it makes two spellings permanent.

**8. Canary.** Drive one complete Field Manager workflow by hand on one fixture, then
`npm run release:canary -- --match <id> --bad-match <id>`. Replay the trigger, re-run, confirm
every count is identical.

## Two live hazards

**Field capture is already armed.** `GOALPLACE_FINALIZER_MODE=enabled` on demo and
`onMatchReportWritten` is deployed, so the **first clean field report anybody creates will
finalize to an official result with no human step.** There is no dry run. Make the first one a
deliberate canary on a fixture you control.

**A scheduled function is missing.** `sweepUnreportedMatches` is written and never wired into
`functions/src/index.ts`. The staleness sweep does not run, so `result_never_reported` is never
raised and a fixture nobody reports stays invisible. Either wire and deploy it or delete it.

## Rules of engagement

- Never conflate **implemented, tested, migrated, deployed, enabled, cloud-verified.** Say which
  plane, always. "It is on main" is not "it is live".
- Never manufacture a synthetic `ResultSubmission` for field capture.
- Everything before `FinalizationCandidate` may be source-specific; everything after it must not
  be. No source checks in the planner.
- Retire authority, preserve history. Historical team assignments, V1 submissions and their V1
  provenance labels stay readable and keep their own words.
- Relative imports only in anything under `src/kernel/**` or the shared server modules: they
  compile into the Functions bundle and `verify:bundle` fails the build on a path alias.
- Rules live in `firestore.rules.next`, not `firestore.rules`.
- Do not deploy `reconcilePaymentIntents`. Do not enable Production.
- Update the handoff's session log before you finish.
