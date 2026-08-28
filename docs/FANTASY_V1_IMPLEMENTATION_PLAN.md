# Fantasy V1 implementation plan

**Status:** F1, F2, F3, F4, F5, F7, F8 implemented and unit-gated. F6 partially delivered.
F9 deliberately deferred to season 2.
**Prepared:** 2026-08-28 against `main` at `ca0a5c5` plus the Platform Console V2 working tree.
**Source:** the “Fantasy on Honest Data” artifact, plus an audit of the 7,531-line engine that
already exists.

## Outcome

Fantasy stops being an engagement feature that costs money and becomes the commercial argument
for field capture:

- a competition can only run fantasy where every match is captured to the same standard, so
  the silent unfairness that would have ended the game cannot occur;
- a fixture that degrades anyway is void for everyone, with the reason published;
- the game launches without anyone inventing two hundred and fifty prices;
- eleven of fourteen football rules run on the MVP capture palette, four of them derived;
- a five-pick game ships that a fan can play in under a minute on a cheap phone;
- a correction is explained in full rather than discovered.

## What the audit confirmed

| Area | Repository reality | Consequence |
| --- | --- | --- |
| Scoring engine | Versioned point events, idempotency keys, correction handling with old/new totals per manager, postponement policy, rule gating by data coverage. Serious and correct. | Build on it. Almost nothing here replaces it. |
| The fairness defect | `scoring.ts` filters rules by `performance.dataCoverage`. Two identical performances score 11 and 5 depending on who held the phone, and nothing says so. | Real, and exactly as the artifact describes. Fixed by F1. |
| Capture policy | `src/lib/capturePolicy.ts` already implements `max(leagueRequested, platformMinimum)` and binds it at fixture creation. ADR-003's lever exists. | F1 had a real lever to bind to; no new authority model needed. |
| Prices | `activation.ts:193` refuses activation without a publishable price per athlete. Nothing in the codebase computes one. | Launch blocker, as stated. Fixed by F3. |
| Derivation | The finalizer **already** derives minutes, appearance, win participation and active squad from official events, and reads player-of-the-match. Clean sheets and goals conceded were the only gaps. | F2 was smaller than the artifact assumed, and is now complete for football. |
| Corrections | `buildFantasyCorrection()` already computes `oldTotals`, `newTotals` and the affected team list. | F5 was surfacing, not building. |
| Mini-leagues | Create, join, moderate and rotate-invite-code all exist, with hashed invite codes and expiry. | F8 adds club leagues, head-to-head and the WhatsApp link on top. |
| Capture palette | Football records goals, own goals, penalties, cards and substitutions. Basketball records points, fouls, technicals and turnovers. Neither records assists. | Assists disabled everywhere; basketball ships Pick 5 only. |
| Team invitations | `create_team_invitation` returns 410 under ADR-004. | The artifact's "invite a League Admin" belongs to the platform application flow, not to a team invitation. |

## Delivered

### F1 — The fairness gate (`src/lib/fantasy/fairness.ts`)

**Rule 1, fantasy binds to capture policy.** `validateFantasyActivation` now takes the
competition's `capturePolicy` and blocks activation unless the effective policy is
`FIELD_REQUIRED`. It **fails closed**: a caller that supplies no policy is refused, because a
competition whose policy nobody checked is exactly the one that can admit a typed score. The
activation route sources the season's requested policy and the platform floor.

**Rule 2, a degraded match is void for everyone.** `evaluateFixtureScoringGate` runs before any
point event is written. If any enabled rule cannot be evaluated for any athlete in the fixture,
or the match was abandoned, or events never finished syncing, or an operational exception is
still open, the fixture scores zero for everyone with a published reason. Never partial, never
silent. `voidFantasyFixture` supersedes any points that fixture had already produced, rescores
the round from what remains, writes a `fantasyFixtureVoids` record and an audit event, and
notifies every manager in the round.

**The official result, its events and the standings are untouched.** Voiding is a fantasy
decision, not a sporting one, and the published reason says so.

### F2 — Derivation layer (`src/lib/fantasy/derivation.ts`)

Clean sheets and goals conceded, derived from the canonical official events plus the athlete's
on-pitch window, and written into `officialAthleteMatchStats.stats` by the finalizer.

Attribution is by presence rather than squad membership: a defender who came on at 80 in a 3-0
defeat conceded nothing while playing, and a goalkeeper withdrawn at 60 keeps the clean sheet
for the part they played. Own goals are charged to the conceding team, read from the sport
catalogue's scoring attribution rather than a private list of goal-ish events. An athlete the
events cannot place on the field contributes **no key at all**, because a zero there would read
as a recorded fact.

An explicit stat line still wins. Derivation fills a gap; it does not overrule an observation.

### F3 — Budget-free activation (`src/lib/fantasy/budget.ts`)

`FantasyCompetition.budgetMode` is `credits` or `budget_free`, defaulting to `credits` when
absent so no already-played competition silently loses a constraint its squads were built
under. In `budget_free` the activation gate skips the price check rather than failing it, squad
validation stops requiring a published price and stops applying the cap, and the UI shows the
per-club maximum instead of a credit counter. Seeded competitions run budget free.

### F4 — Pick 5 (`src/lib/fantasy/pick5.ts`, `/api/fantasy/pick5`, `Pick5Board`)

Five athletes, one captain at 2x, one scout slot, at most two from any one club, reset every
round, locked at first kickoff by the existing server-enforced deadline.

Not a smaller squad: a separate validator, because the squad rules enforce positional groups, a
bench, a vice-captain and a budget, none of which exist here. It **is** the same points —
`pick5LineupVersion` expresses a Pick 5 lineup in the shared lineup shape, so it scores through
`scoreFantasyLineup` against identical point events. A Pick 5 captain who does not play simply
forfeits the double; there is no vice to promote.

The scout threshold is a configured value on the competition, not a constant, because five
percent is a guess that only works at one audience size.

### F5 — Round lifecycle (`src/lib/fantasy/roundLifecycle.ts`)

`open → locked → live → settling → settled → adjusted`, derived from the fixtures rather than a
stored flag, so a round cannot claim to be settled while a match is still awaiting its official
result. Every phase carries `provisional`, so no UI can present a live number as final. Per
fixture: `scheduled`, `live`, `awaiting_official`, `official`, `voided` — and a void outranks
everything else the fixture might be called.

`buildCorrectionNotice` produces the old total, the new total, the reason, how many other
managers were affected and the rank move. It returns null for a manager whose total did not
move, so nobody is told about a change that did not affect them.

### F7 — Season Squad changes (`src/lib/fantasy/profiles.ts`)

| Change | From | To |
| --- | --- | --- |
| Captain multiplier | 1.5 | **2.0**, on all three profiles |
| Assists | enabled, +3 | **disabled** — one observer cannot capture an assist while running the clock |
| Saves, penalty saves | enabled | **disabled** — not in the palette |
| Midfielder clean sheet | 1 | **2**, absorbing the loss of assists without inventing a proxy statistic |
| Basketball rebounds, assists, steals, blocks, double/triple-doubles, ejections | enabled | **disabled** — nine dead rules removed rather than pretended |
| Budget | 100 credits | budget free (F3) |
| Eligibility | any declared data level | `FIELD_REQUIRED` (F1) |

Disabled rules are kept in the profile rather than deleted, so the reason travels with it and
re-enabling one is a deliberate act.

### F8 — Social (`src/lib/fantasy/miniLeagues.ts`)

Club mini-leagues with a deterministic id, owned by the competition rather than a person so no
departure can orphan one. A round-robin head-to-head schedule by the circle method, giving an
odd membership a bye rather than an unbalanced fixture, with a three-for-a-win table. A
WhatsApp share link carrying the join URL. Prizes constrained to a non-cash allowlist.

### F6 — Discovery, partially delivered

**Built:** the Breakout board (`src/lib/fantasy/breakout.ts`) — highest scorer under the
ownership threshold, biggest ownership rise, best scout pick and how many managers found them,
plus the scout percentile line. It reports no rise for an athlete with no previous reading
rather than inventing a movement, and ignores superseded events.

**Not built, and why:** pick-follows-athlete and the backing prompt need a follow subsystem
(collection, Rules, API, profile surface) that does not exist in this repository. The artifact
places F6 after v2 Phase B personas. Personas exist; follows do not. Half-building a follow
system to satisfy a checklist would be worse than naming the gap.

### F9 — Computed prices, deferred

The artifact assigns this to season 2 and makes it conditional on one season of gold data.
Nothing to build now. When it is built: a server job over observed points per appearance on a
rolling window, with a movement cap, republished between rounds through the finalizer path and
never typed by an administrator.

## Decisions made

The artifact left four open. Resolved as follows, all of them the artifact's own preference
where it stated one:

| Decision | Resolution |
| --- | --- |
| Round cadence | **Fixture round.** `FantasyRound.matchIds` already models exactly this, and it matches the postponement policy already written. No change needed. |
| Scout threshold | **Configured per competition**, defaulting to 5%. `scoutOwnershipThresholdPercent` on the competition. |
| Pick 5 season aggregate | **Yes, and it cost nothing.** `rebuildFantasyLeaderboard` already accumulates `totalPoints` and `roundsPlayed` across rounds, so the cumulative table exists the moment Pick 5 writes round scores. |
| Player of the match | **Plumbing already exists** — the profile rule is enabled and the finalizer reads `statLine.playerOfMatch`. The capture-side tap was **not** added: the artifact says to confirm with a field manager that one tap at attestation is acceptable before putting it in the flow, and that confirmation has not happened. |

## Safety, enforced rather than asserted

- No entry fee, cash prize, pool, odds or purchasable advantage. `fantasyRecordHasFinancialFields`
  rejects a lineup carrying money fields, and the mini-league prize allowlist is non-cash.
- **No fantasy consideration reaches a sporting decision.** `captureIsolation.test.ts` fails the
  build if the capture surface imports a fantasy module or names ownership, points or a scout
  concept. A Field Manager who knows the athlete in front of them is owned by forty percent has
  a reason to hesitate; the design depends on them having none.
- No client writes a point event, leaderboard total or price. Unchanged.
- No partial scoring of a degraded fixture. F1.
- No provisional number shown as final. F5's `provisional` flag.

## Verification

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm test` | **1603 passed**, up from 1484 at the start of this work |
| `npm run lint` | 0 errors (8 pre-existing warnings, all `window.location.assign` in auth files) |
| Pick 5 render at 390px | verified in the browser against the seeded basketball competition |

Not yet run: `npm run deploy:ready` in full (Rules and integration suites need the Firestore
emulator), and no environment deploy. Demo proof would not be Beta or Production proof anyway.

## What a follow-up session should pick up

1. The follow subsystem, then the rest of F6.
2. Surface the F5 lifecycle and correction notice on the round page — the module and its tests
   exist; the page still renders the old flat view.
3. Wire club mini-league creation into fantasy activation, and head-to-head into the mini-league
   detail page. The pure functions and their tests are ready; nothing calls them yet.
4. Confirm player-of-the-match with a real field manager before touching the attestation flow.
5. `npm run deploy:ready` with the emulator, then an environment decision.
