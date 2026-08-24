# Official event schema: 1.0.0 and 2.0.0

Status: 2.0.0 emitting as of Phase A0. Both versions are readable, forever.

## What changed

`submittedByUserId` stopped being the universal way an official event names its author.

Until Phase A0 every actor on the platform was a Firebase user, so a uid was both the
identity and the proof. Field capture breaks that: a Field Manager holds a match-scoped
bearer token, has no Firebase Auth user, and never appears in `accessIndex`. An official
event they produce has no uid to record.

So the actor became a discriminated union (`src/kernel/principal.ts`), and the event schema
was versioned rather than edited:

| | 1.0.0 | 2.0.0 |
|---|---|---|
| Requires | `submittedByUserId` | `sourcePrincipal` |
| Permits | | `submittedByUserId`, still written for user-produced events |
| File | `official-event.schema.json` | `official-event.schema.2.0.0.json` |

The 1.0.0 file is unchanged and stays that way. Active rule records are immutable, and
historical events are never rewritten to carry a `sourcePrincipal`. `principalFromEvent()`
interprets a 1.0.0 event as `{ principalType: 'user', userId }` at read time. There is no
migration script, and none should ever be written.

## Amendment to ADR-002

ADR-002 specified this change as "`official-event.schema.json` → 2.0.0", with
`submittedByUserId` moved out of `required` and `sourcePrincipal` added. It was written on
the assumption that the schema file was enforcing. It was not.

Nothing in the repository loaded `src/kernel/schemas/`. There was no JSON Schema library in
either `package.json`, and no module imported those files. The `required` array on
`official-event.schema.json` described a rule that had never been applied to a single
document. What actually validated an official event was `validateOfficialEvent()` in
`kernelValidation.ts`, which checks event-type legality against the collection profile and
that both version counters are positive, and which had never seen `submittedByUserId`.

That matters for two reasons. The ADR's own completion test ("a 1.0.0 event still
validates") had nothing to run against. And the instruction to move a field out of
`required` reads as a behavioural change when it would in fact have changed nothing.

**The amendment.** The schema files remain the published contract, addressed by `$id`, and
2.0.0 is added as a new file rather than edited into the old one. Enforcement moves to
`validateOfficialEventShape()` in `src/kernel/validators/officialEventGuard.ts`, a
hand-written, dependency-free guard that the finalizer calls on every event before it is
written. `principal.test.ts` asserts that the guard's required-field lists and the schema
files' `required` arrays agree, so the contract cannot drift away from what runs.

**Why not add a JSON Schema runtime.** The kernel compiles into the Cloud Functions bundle
via `../src/kernel/**/*.ts` in `functions/tsconfig.json`. That bundle declares exactly two
runtime dependencies, `firebase-admin` and `firebase-functions`, and is policed by
`verify:bundle`. Adding a validator library there to interpret a documentation artifact
buys machine-checked schemas at the cost of a dependency in the most deployment-sensitive
bundle on the platform. The contract test buys most of the same protection for none of it.

Everything else in ADR-002 stands: the parallel principal type, the two-stage secret, the
per-assignment lockout, and the rule that a Match Ops principal never satisfies
`request.auth != null`.

## Working on this code

- Every module under `src/kernel/` ships to Cloud Functions. Import relatively. A path alias
  compiles clean, typechecks clean, and fails at require time in the cloud. It happened on
  2026-08-23.
- `OfficialSportEvent` in `src/kernel/types.ts` models any stored event, so both
  `submittedByUserId` and `sourcePrincipal` are optional there. The finalizer's own
  `OfficialSportEventRecord` requires `sourcePrincipal`, which is the compile-time gate: a
  new event builder that forgets to name its author does not typecheck.
- The provenance quad lives on the `finalizations/{key}` ledger entry, the one record that
  exists exactly once per finalized result version and is never updated.
