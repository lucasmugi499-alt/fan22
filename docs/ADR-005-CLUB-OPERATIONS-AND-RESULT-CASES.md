# ADR-005 — Club operations restored, and one result case

**Status:** accepted, 30 August 2026
**Supersedes in part:** ADR-004 (Team Admin retired as an account class)

## Context

Two problems arrived from the same direction: a role that had been removed without being
replaced, and a correction workflow that only understood one of the three ways a result can
become official.

**Team Admin.** ADR-004 retired it and versioned the team bundles to zero capabilities. That
was right about the AUTHORITY the role held — a club could write its own roster, submit a result
and confirm its opponent's — and wrong about the club having no operational identity at all. The
pages stayed and the workflows they described did not, so a club official read "Needs you now"
beside a control that granted nothing. A boundary that presents as breakage teaches nobody where
the boundary is.

**Corrections.** `/api/result-submissions/{matchId}/correction` loaded
`resultSubmissions/{matchId}` and worked on it. A result that became official through V2 field
capture or league post-match entry has no such document. So the platform's own primary intake
produced official results that could not be corrected through the product at all: a wrong
verified result needed database access to fix.

## Decision

### Authority

```
Platform Admin -> League Admin -> Club Operator -> Athlete -> Fan
```

Scoped, not cascading. The person above does not casually rewrite everything underneath.

| Role | Owns |
|---|---|
| Platform Admin | platform governance and exceptional intervention |
| League Admin | competition truth: fixtures, verification, registration, discipline |
| Club Operator | their own club's operations and submissions |
| Athlete | their identity and social layer, claims, challenges — not official statistics |
| Fan | participation, following, prediction, community |

And for results, in one line:

> Field Manager captures. League governs. Clubs report and dispute. GoalPlace finalizes.

### Club Operator

`roleKey: 'club_operator'`, `bundleId: 'club_operations'`. **Not** `team_admin`, and that is not
cosmetic: `capabilitiesForAssignment` resolves by `permissionBundleId` and then falls back to the
first bundle whose roleKey matches, so reusing the old key would hand the new capabilities to any
historical assignment with a missing or unrecognised bundle id — a privilege grant decided by
array order. The product may still call the person a Team Admin; this is the authority key.

Every capability is a new spelling for the same reason. Reviving `team.roster.manage` would
re-grant direct athlete-registration writes to every old assignment still carrying it. The
retired names stay retired.

| Capability | May write | May never touch |
|---|---|---|
| `team.profile.edit` | description, crest, colours, venue, contact | `verified`, `leagueId`, `plan`, stored sporting aggregates |
| `team.roster.propose` | a `rosters` draft, and `draft -> submitted` | `athletes/*`; numbers, positions, transfers, suspensions, eligibility |
| `team.content.publish` | `feedPosts` authored as the club | another club's posts; anything verified |
| `team.media.manage` | signed uploads under `publishedMedia/team/{id}` | publication — moderation still gates it |
| `team.result.report` | the club's account of their own fixture, as evidence | `matches.score`, `matchReports`, `finalizations` |
| `team.result.dispute` | opens a result case on a fixture their club played | the ruling on it |

Three deliberate exclusions:

- **Roster is propose-only.** A club that could write registration could manufacture
  eligibility. The `rosters` collection already had the shape: the club submits, the league
  confirms or returns.
- **A team report is evidence, never a finalization candidate.** Two clubs agreeing is the V1
  bilateral workflow field capture replaced. A club's account of the match is heard; it is not
  counted.
- **No staff invitation.** For beta the League assigns every Club Operator. Same-team delegated
  staff can be added later without changing the model.

The rules get a separate `hasClubOperatorCapability` rather than an extension of
`hasTeamOperatorCapability`. That one lists the retired V1 authority, and the rules consulting it
are the rules that guarded those workflows.

`GOALPLACE_TEAM_AUTHORITY_STAGE` is untouched and still `retired`. It governs draining V1, which
is a separate and finished concern; `club_operations` is not in `RETIRING_TEAM_CAPABILITIES`.

### Result cases

`resultCases/{matchId}__case{n}` is one adjudication of one official result, referencing whichever
evidence produced it. The question "was this result right" does not change shape depending on how
the result arrived, so it does not get a different implementation per provenance.

```
open -> under_review -> resolved_upheld
                     -> resolved_corrected -> (finalization) -> resultingVersion
                     -> proposed -> escalated -> resolved_*
     -> withdrawn
     -> superseded
```

The chain:

```
official result version -> result case -> ruling -> new official result version
```

Every link is a record and none is a mutation of the one before. **Nothing in the model writes a
score.** A corrected ruling builds a `FinalizationCandidate` with `sourceType: 'result_case'` and
hands it to the same `finalizeCandidate` every other source uses. A correction is a new SOURCE,
not a new path — a second writer of official scores is the thing most likely to make two surfaces
disagree about a match.

Invariants, each with a test:

- the case names the exact `subjectVersion` it challenges, and refuses to open against a version
  the match has moved past;
- a stale case cannot roll back a newer official version — `plan.ts`'s existing version guard,
  which is the point of routing through the same planner;
- a resolved ruling is terminal; correcting a correction opens a new case against the version the
  first one produced;
- finalization is deterministic on the case id, so a retry finds its own ledger entry;
- a conflicted League Admin may propose and escalate, and may not rule;
- evidence is append-only pointers, never copies — a case that could lose an inconvenient
  reference is not a record of anything.

`resultCases` is publicly readable and server-written only. A correction that happened invisibly
is indistinguishable from a record that was quietly edited, which is the accusation this platform
exists to be able to refute.

The legacy correction address opens a case rather than remaining a second system, so older
bundles keep working. Zero V1 corrections were in flight when this shipped.

## Consequences

`FinalizationSourceType` gains `result_case`. Writing the chain end-to-end against a real
Firestore caught a drift nothing else could: `validateOfficialEventShape` keeps its own allowlist
of ingress provenances, and the new one was not in it — the ruling sound, the candidate sound, and
every official event refused on the way to disk. Those two lists are the same vocabulary read at
opposite ends of the pipeline and now have a test asserting they agree.

A club can now be told the record is wrong by the people who were there, and the league can settle
it, without either of them being able to write the answer themselves.

## Not decided here

Whether a Club Operator may delegate to same-team staff; whether athlete stat issues become case
openers rather than a parallel collection; and the correction UI, which currently reaches this
model through the legacy address.
