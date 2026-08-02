# GoalPlace256 Sports Data Kernel

The kernel separates four kinds of data:

- Master data: sports, leagues, seasons, teams, athletes, venues and roster memberships.
- Claims: result submissions and match-event claims entered by team or league operators.
- Official records: trusted server-created result versions and official sport events.
- Projections: standings, athlete statistics, fantasy scores, sponsor metrics and Community Points balances.

Projections are rebuildable. They must not be treated as source facts.

## Trust Boundaries

Clients may submit claims through trusted APIs. Only server-owned operations may create official events, official results, fantasy point events, standings projections, audit events and rule approvals.

Every official output should record the rule version and source version that produced it. When a correction happens, GoalPlace creates a new official version, supersedes old derived events, rebuilds affected projections and keeps the previous values available for explanation.

The trusted result finalizer now emits immutable `officialSportEvents` from settled
scorer claims before maintaining the legacy `officialAthleteMatchStats` projection. The
legacy projection remains for current fantasy compatibility; the canonical event stream is
the source for deeper sport-specific projections and replay.

## Kernel Modules

The first implementation lives in `src/kernel`:

- `definitions`: sport definitions, event catalogues, collection profiles, statistic definitions and the Rugby Fantasy Lite profile.
- `formulas`: deterministic score reconstruction and reconciliation helpers.
- `projections`: athlete-statistic and fantasy-point projection helpers.
- `validators`: catalogue, event, fantasy and data-coverage validation.
- `schemas`: Draft 2020-12 JSON Schema contracts for portable record validation.

## Versioning

Active rule records are immutable. Changes require a new semantic version, validation, simulation, approval and future activation. Historical matches remain interpretable by the versions bound to that match, season or competition.
