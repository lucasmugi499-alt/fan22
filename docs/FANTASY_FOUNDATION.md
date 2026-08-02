# GoalPlace Fantasy Foundation

GoalPlace Fantasy is a free engagement layer for football, basketball, Rugby 15s, and
Rugby 7s. It has no entry fee, cash prize, cash pool, betting odds, purchasable credits,
money conversion, or paid advantage.

Fantasy browse surfaces are public: the hub, how-it-works, competition overview, players,
points, leaderboards and public mini-league pages can be inspected without an account.
Lineup creation, transfers, mini-league creation and joining remain Fan-account actions
enforced by the server APIs.

## Trust Flow

```text
Team Admin report
-> opponent confirmation or League Admin resolution
-> trusted official finalization
-> canonical official sport events
-> official athlete match statistics
-> versioned Fantasy Point events
-> locked lineup score
-> leaderboard
```

Clients cannot write point events, official scores, leaderboard totals, corrections,
published prices, or competition activation.

## Data Quality

Each competition declares a `dataLevel` and `recordedStatKeys`. Scoring rules are enabled
only when both meet the rule's requirements. The final match report now captures active
match squads, scorer events, and sport-specific athlete stat lines. The trusted finalizer
emits canonical `active_squad` official sport events, scorer events for goals/tries/points,
and stat-line events for supported details such as minutes, assists, cards, rebounds,
conversions, penalty goals, and drop goals. Older scorer-only records remain labelled
`scorer_only`; squad-only records are `match_squad_basic`; richer report rows are
`verified_stat_line`.

Before a live competition enables full advanced rules such as clean sheets, saves,
penalty saves, substitutions, detailed basketball shot charts, or other richer event
families, Matchday Field Mode still needs that sport-specific capture and staging
validation.

The Platform Admin activation route now runs a server-side readiness check before it can
publish player prices or mark a competition active. The check blocks activation when the
approved scoring profile, squad rules, roster, prices, rounds, position groups or recorded
stat coverage cannot support every rule enabled by the competition's declared data level.

## Supported Configurations

- Football: 15-player squad, 11 starters, 100 Fantasy Credits
- Basketball: 10-player squad, 5 starters, 100 Fantasy Credits
- Rugby 15s: 23-player squad, 15 starters, 120 Fantasy Credits
- Rugby 7s: 12-player squad, 7 starters, 100 Fantasy Credits

All values live in versioned scoring profiles and squad rules. UI components do not own
official scoring values.

## Mini-League Catalogue

The public mini-league catalogue is intentionally bounded. Firebase mode reads only the
first page of public active mini-leagues and uses aggregate member counts for visible
cards. Raw member rows and competition leaderboards are loaded only from the individual
mini-league detail route.

## Deployment Gate

Do not activate production fantasy until:

1. Candidate Firestore rules and indexes pass in staging.
2. Authenticated staging tests cover squad submission, server deadline lock, transfer
   races, private mini-league access, official scoring, duplicate finalizer delivery, and
   result correction.
3. League and Platform Admin activation is tested with a complete roster and round set.
4. The competition's recorded athlete-event coverage supports every enabled rule.

The seed script may load the three synthetic demonstration competitions into staging.
Synthetic data must remain labelled as demonstration data.
