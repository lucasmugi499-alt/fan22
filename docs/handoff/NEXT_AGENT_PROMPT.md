# Pickup prompt: GoalPlace Operations Model V2

Paste the block below to the next agent. Everything it needs is in the repo; nothing depends
on the previous conversation.

---

You are continuing the **GoalPlace Operations Model V2** migration. The architecture is
decided, built, and now migrated. Your job is one thing: **run the field capture canary
against the real Demo environment and prove it.** Do not redesign anything.

**Read first, in this order:**

1. `docs/handoff/OPERATIONS_MODEL_V2_HANDOFF.md` — current state, what is left, and the traps.
   Every trap listed there was a real bug on this branch; five of them were found in the last
   session alone.
2. `docs/RESULT_ENGINE_V2_MILESTONE.md` — the deploy runbook.
3. The newest `docs/evidence/operations-model-v2-*.json` — what has actually been proven.
   Anything marked `not_run` has not been. It carries forward across commits and records
   `carriedFrom`, so the newest file is the live record even after unrelated commits.

## Where things stand

The migration itself is **done and green against the real Demo database**
(`manifest-quasar-479416-s7`, database `fg256`), as of 2026-08-26 on `main`, pushed:

- V1 drain: 18 stranded claims found, all 18 migrated one at a time, drain now reads **0** on
  both blocking counts.
- Team authority: **`retired`**, set on both runtimes that build projections.
- Projections: **1123 rebuilt**, 0 stale, 0 coverage gaps. `access:migrate:gate` exit 0.
- `access:sunset-invariants`: **exit 0** against stored documents.
- The `acceptedSpellings()` compatibility shim: **deleted**, server and Rules together.
- `npm run deploy:ready`: exit 0. 1423 unit, 155 rules, 26 integration.
- Deployed: App Hosting `build-2026-08-26-004`, Firestore Rules, and the Cloud Functions
  `onMatchReportWritten` and `convergeLifecycle`. The live origin reports both its build id
  and `teamAuthorityStage: retired`, so the stage is read back, not inferred.

All three gates were re-run after the deploys and still exit 0.

## What has NOT happened

**The field capture canary. That is your job.**

`matchReports` is empty on demo — zero documents. No field report has ever existed. Field
capture is currently **inert, not verified**, which are different sentences and only one of
them is true:

```
GOALPLACE_FINALIZER_MODE=enabled        legacy V1, cloud-verified 2026-08-08
GOALPLACE_FIELD_CAPTURE_MODE=canary     empty allowlist, so it refuses every match
GOALPLACE_LEAGUE_ENTRY_MODE=off         never cloud-verified either
```

## Credentials

They are already on the machine. The scripts do not load `.env.local`, so export them:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/Users/beno1017/.config/goalplace256/staging-admin.json
export GOALPLACE_FIRESTORE_DATABASE_ID=fg256
export GOALPLACE_ADMIN_PROJECT_ID=manifest-quasar-479416-s7
export GOALPLACE_TEAM_AUTHORITY_STAGE=retired
```

Set all four. The Firebase CLI is separately logged in and can deploy.

Start by re-running the three gates read-only to confirm nothing has drifted since:
`access:v1-drain`, `access:migrate:gate`, `access:sunset-invariants`. All three must exit 0.

## Do this, in order

**1. Choose two controlled fixtures, before any report exists.** One clean, one deliberately
contradictory. Each needs complete registered squads, no existing official result, no
competing result submission, and no fantasy competition. The first proof must not accidentally
become a test of field capture plus legacy coexistence plus fantasy plus correction at once.

**2. Allowlist the clean one.** Put its match id in
`GOALPLACE_FIELD_CAPTURE_CANARY_MATCH_IDS` in `functions/.env.manifest-quasar-479416-s7`, then
deploy **only** `firebase deploy --only functions:onMatchReportWritten`. Leave the working V1
finalizer alone.

**3. Drive the whole Field Manager workflow by hand** on that fixture: link, PIN, check-in,
lineup, clock, events, half time, second half, full time, attestation.

**4. Verify the persisted graph, not the exit code.**
`npm run release:canary -- --match <id> --bad-match <id>` checks counts, and a duplicate
finalization looks correct on the surface because the score is right — only the cardinality
reveals it. Confirm by hand: report `finalized` with the expected `reportVersion` and
`eventDigest`; candidate with `source=field_capture` and `workflow=result_engine_v2`;
**exactly one** `OfficialResultVersion`; the expected canonical event count; **exactly one**
standings change; athlete projections only where evidence supports them; the Field Match Ops
principal in the audit, not a synthetic user.

**5. Replay the trigger and re-run.** Versions +0, events +0, standings +0, athlete stats +0,
audit side effects +0. Idempotency must be observed, not merely unit-tested.

**6. Then the bad canary.** A report that contradicts itself — attested 2-1, events
reconstructing 3-1. Expect zero official records of any kind, one reconciliation exception,
report blocked. Repeat the bad trigger: still **one** exception, not two.

**7. Only then** set `GOALPLACE_FIELD_CAPTURE_MODE=enabled`. Demo only.

**8. Separately, afterwards: `sweepUnreportedMatches`.** It is written in
`functions/src/matchReports.ts` and never wired into `functions/src/index.ts`, so
`result_never_reported` is never raised. **Do not simply wire it — it was modelled against
real demo data and it is wrong.** Its only guard is `verificationStatus === 'verified'`, and in
the first 200 matches alone it would open 5 false cases: 4 matches in `disputed` that are in
league adjudication right now (including claims migrated last session), and 1 match still
`live`. `MatchStatus` is `scheduled | live | completed | cancelled` — there is no `postponed`
or `abandoned`, so "called off" cannot currently be expressed. Fix eligibility in
`isUnreportedAndStale` first. Its job is to detect and surface; it must never finalize
anything or guess a score. Its own release, after the canary, not bundled with it.

## Gaps you are inheriting

None of these blocks the canary. They are named because each one is a place where a
plausible-looking state is not a verified one, and you should not rediscover them the hard way.

**One claim in the handoff rests on a deploy log, not a reading.** The deployed Cloud
Functions' environment variables were never read back: `gcloud` has no credentialed account on
this machine and the Firebase CLI cannot show function env. So there is no direct confirmation
that the running `onMatchReportWritten` holds `GOALPLACE_FIELD_CAPTURE_MODE=canary` or that
`convergeLifecycle` holds `GOALPLACE_TEAM_AUTHORITY_STAGE=retired`.

Two things close it, and you should do the second one first:

- **Re-run `access:sunset-invariants` at the start of your session.** If `convergeLifecycle`
  were still on `frozen`, it rebuilds team capabilities back in within the hour and the
  invariants fail on their own. A green reading a day after the migration is the observation
  that proves the Functions runtime got its stage. A red one means the deploy did not take.
- The canary proves the field capture gate behaviourally. That is the real test regardless.

The App Hosting half of the same question was closed, and the pattern is worth repeating:
`/api/environment` reports `finalizerMode` and `teamAuthorityStage`, so that runtime is read
back rather than inferred. A trivial callable returning the Functions runtime's own resolved
activation would end the ambiguity there permanently, if it becomes worth it.

**`apphosting.beta.yaml` and `apphosting.production.yaml` declare no
`GOALPLACE_TEAM_AUTHORITY_STAGE`,** so both would run at the `frozen` default. That is correct
for environments that have not drained — but it must be a *decision* when either is promoted,
not the oversight it was on demo. `apphosting.demo.yaml` was missing it entirely while
`apphosting.yaml` had it, and which of the two a backend actually reads is not visible from
the CLI. Both demo files now declare it and `scripts/lib/deploymentPlanes.test.ts` fails if
they disagree, absence included.

**Smaller:** six of the eight deployed Functions carry an older environment generation (only
`onMatchReportWritten` and `convergeLifecycle` were redeployed; neither of the six projects or
finalizes, so it is drift, not a defect). Storage rules were not re-released and are
unchanged. Firestore reports one index in the project that is not in
`firestore.indexes.json`, pre-existing.

## Rules of engagement

- Never conflate **implemented, tested, migrated, deployed, enabled, cloud-verified.** Say
  which plane, always. "It is on main" is not "it is live". "It is inert" is not "it is
  proven".
- Never manufacture a synthetic `ResultSubmission` for field capture.
- Everything before `FinalizationCandidate` may be source-specific; everything after it must
  not be. **No source checks in the planner** — the activation gate is resolved at ingress and
  passed in, which is what keeps the planner unable to tell which source produced it.
- Every source keeps its own activation switch. Do not collapse them back into one flag, and
  do not let one fall back to another: an unset gate means `off`.
- Retire authority, preserve history. Team access indexes were emptied, not deleted. Audit
  records keep their own words — an `AuditEvent` saying `league.team.create` still says it.
- The compatibility shim is gone and `src/server/access/spellingSunset.test.ts` keeps it gone,
  including if Rules and the server are ever re-widened separately.
- **Always pass the database id.** No GoalPlace project has a `(default)` database. Use
  `scripts/lib/firestoreTarget.ts`; never `getFirestore()` with no argument.
- Relative imports only in anything under `src/kernel/**` or the shared server modules.
- Rules live in `firestore.rules.next`, not `firestore.rules`.
- Do not deploy `reconcilePaymentIntents` or `lockFantasyLineups`. Do not enable Production.
- **Verify the plane, not the file you edited.** `apphosting.<environment>.yaml` overrides
  `apphosting.yaml` and the CLI will not tell you which one a backend reads. When a variable
  matters, make the runtime report it and read it back.
- Update the handoff's session log before you finish.
