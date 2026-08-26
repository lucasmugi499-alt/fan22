# GoalPlace Result Engine V2

Status: built, gates green, **not deployed**. Branch `handbook-v2`, local.

This milestone means something specific, and it is deliberately larger than "eight phases
shipped". It means all of the following are true at once:

- The Athlete persona is separated from the sporting record.
- Team Admin issuance is frozen; team authority retires as an operation, not a deploy.
- The League Admin operational model is active.
- The Field Match Ops principal is active.
- Field reports flow end to end to an official result.
- Legacy V1 remains historically interpretable.
- One candidate-based finalization engine serves all three intake paths.

## Why this deploys as one thing

There is a state that must never exist in production:

```
Field Manager UI live
    reports stop at ready_for_finalization
AND
Team Admin authority already retired
```

That is a hole between the two operational models. The old way of recording a result no
longer works and the new way does not finish, so a league has no way to get a result onto
the table at all. Every ordering decision below exists to avoid that window.

## The line the architecture turns on

```
FIELD CAPTURE ──────────┐
                        │
LEAGUE ENTRY ───────────┼──►  FinalizationCandidate  ──►  SPORTS TRUTH ENGINE
                        │
LEGACY TEAM V1 ─────────┘
```

Everything before the candidate is source-specific. Everything after it is source-agnostic.
Nothing downstream of that line may learn what kind of record produced a result, and the
source lifecycle adapters exist so that it never has to.

## Deployment sequence

Steps 1 to 4 are gates. The branch stays local until all four are green.

### 1. Candidate finalizer complete and tested

- [x] Transaction parameterized on `FinalizationCandidate`
- [x] Source lifecycle writes behind adapters, not conditionals
- [x] No synthetic `ResultSubmission` anywhere
- [x] `buildCandidateFromLegacySubmission` / `FromFieldReport` / `FromLeagueReport`
- [x] All three feed one reconcile, eligibility, event planning, versioning, projection, audit
      and idempotency path
- [x] Emulator integration tests: `npm run test:integration`

Twelve integration cases pass against a real Firestore, including a clean field report end
to end, a redelivered trigger producing one version, an ineligible athlete excluded without
discarding the match, a correction producing v2 with v1 still readable, and the bilateral
workflow behaving exactly as before.

### 2. V1 drain confirmed

```bash
npm run access:v1-drain
```

Must exit 0. It reports five counts; two of them block:

| Count | Blocks | Why |
|---|---|---|
| Claims awaiting a team answer | yes | Nobody can answer them after retirement |
| Open team invitations | yes | Accepting one creates an assignment granting nothing |
| Open but league-resolvable | no | League capability is untouched by retirement |
| Active team assignments | no | Authority nobody is exercising strands no work |
| Submissions total | no | Context |

For claims that will never be finished by their parties:

```bash
npm run access:migrate-v1 -- --match <matchId> --reason "<why>"
```

Dry run by default. One match at a time, never a bulk sweep: "move everything open to
league resolution" would clear the gate in one command and silently convert live
negotiations into decisions one party never got to contest. Writes a
`result.workflow.migrated` audit event.

### 3. Team authority retired and projections rebuilt

Only once step 2 exits 0.

```bash
# 3a. Retire, in EVERY runtime that builds a projection. See the warning below.
#     - functions/.env.<project>   (convergeLifecycle)
#     - apphosting.yaml            (the Next server's projector)
GOALPLACE_TEAM_AUTHORITY_STAGE=retired

# 3b. Rehearse the rebuild, then apply it, then gate on zero drift.
#     Export the target explicitly: no GoalPlace project has a `(default)` database.
export GOALPLACE_FIRESTORE_DATABASE_ID=fg256
export GOALPLACE_ADMIN_PROJECT_ID=<project>
npm run access:migrate:dry-run
npm run access:migrate:apply
npm run access:migrate:gate
```

The stage defaults to `frozen`, which is the safe state: issuance stopped, existing grants
intact. Changing the capability catalogue does not rewrite already-materialized
projections, so until the rebuild runs the retirement has happened in the code and not in
the database.

> **Set it in both runtimes, and deploy them, before you rebuild.**
>
> `projectScopeIndex` reads this variable at the moment a projection is *built*, and two
> runtimes build them: the Next server whenever an assignment changes, and
> `convergeLifecycle` hourly. Rebuild to `retired` while either one still reads `frozen` and
> it will write the team capabilities back, one user at a time.
>
> The symptom is the worst kind: `access:sunset-invariants` passes on the day you run it and
> fails a week later with nothing having changed. `scripts/lib/deploymentPlanes.test.ts`
> fails if the two configuration files disagree, or if either omits the variable — an unset
> value falls back to `frozen`, so an absent declaration is a disagreement too.

The rebuild is stage-dependent in both directions, so the report records which stage it ran
under. The same assignments produce different desired projections at `frozen` and at
`retired`, these reports are kept as migration evidence, and re-running later to find out
changes the answer.

### 4. Invariants verified against real stored data

```bash
npm run access:sunset-invariants
```

Must exit 0. It enforces the end state and its limits:

- No team capabilities in live access indexes
- No team invitation anybody could still accept
- No V1 claim waiting on a team

And deliberately permits everything historical to remain: team assignments, answered
invitations, and every V1 submission stay readable. **Retire authority, preserve history.**

> A green `access:compat` against the demo dataset proves nothing about this. That dataset
> contains no team-scoped assignments, so it is a bridge load-tested with zero trucks. Step 4
> runs against actual stored indexes.

### 5 to 10. Release

5. Deploy the application
6. Deploy Functions
7. Deploy Rules (`firestore.rules.next`, which is the file `firebase.json` actually points at)
8. Controlled field-report canary: one fixture, one Field Manager,
   `GOALPLACE_FIELD_CAPTURE_MODE=canary` with that match id in
   `GOALPLACE_FIELD_CAPTURE_CANARY_MATCH_IDS`, deploying **only** `onMatchReportWritten`
9. Verify the official result end to end: official result version, canonical events with
   `sourcePrincipal.principalType === 'match_ops_session'`, ledger entry with
   `sourceType: field_capture`, standings updated, report `official`. Then **replay the
   trigger** and confirm every count is identical, and run the bad-report canary
10. Enable field capture for Demo: `GOALPLACE_FIELD_CAPTURE_MODE=enabled`

> **One switch per source since 2026-08-26.** `GOALPLACE_FINALIZER_MODE` governs the
> bilateral V1 path only. Field capture and league post-match entry have their own gates and
> inherit nothing from it — an unset gate means `off`.
>
> The split exists because a single flag reading `enabled` for a finalizer cloud-verified in
> August also armed a field capture pipeline that had never run against real data. Narrowing
> the shared flag to protect the new source would have degraded the proven one. Do not
> collapse them back.
>
> | Source | Variable | Allowlist |
> |---|---|---|
> | Bilateral V1 | `GOALPLACE_FINALIZER_MODE` | `GOALPLACE_FINALIZER_CANARY_SUBMISSION_IDS` |
> | Field capture | `GOALPLACE_FIELD_CAPTURE_MODE` | `GOALPLACE_FIELD_CAPTURE_CANARY_MATCH_IDS` |
> | League post-match | `GOALPLACE_LEAGUE_ENTRY_MODE` | `GOALPLACE_LEAGUE_ENTRY_CANARY_MATCH_IDS` |

## Rollback

Each gate is reversible on its own.

| Step | Rollback |
|---|---|
| 3a | Set the stage back to `frozen`, rebuild projections. Authority returns. |
| 5 to 7 | Standard revision rollback per plane. Deploying one plane never implies another. |
| 8 | `GOALPLACE_FIELD_CAPTURE_MODE=off`, redeploy `onMatchReportWritten`. No field report can produce an official record by any caller, and the bilateral V1 finalizer is untouched. |

The finalization ledger makes a re-run safe: a redelivered trigger finds the key already
present and skips, which the integration suite asserts.

## What is deliberately not in this milestone

`ready_for_finalization` remains a distinct status from `auto_finalized`. It means every
gate passed and nothing waits on a human; it does not mean an official record exists. The
two are separate because a report marked finalized with no official result version behind it
would be a second source of truth about whether a match has a result, which is the defect
this whole architecture exists to prevent.
