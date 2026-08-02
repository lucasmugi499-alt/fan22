# GoalPlace Fantasy Foundation

GoalPlace Fantasy is a free engagement layer for football, basketball, Rugby 15s, and
Rugby 7s. It has no entry fee, cash prize, cash pool, betting odds, purchasable credits,
money conversion, or paid advantage.

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
only when both meet the rule's requirements. The existing final match report reliably
captures scorer events, so the finalizer emits canonical official sport events and marks
the generated athlete records as `scorer_only`. They may award goals, tries, or recorded
basketball points, but they do not pretend to provide complete squad appearance coverage.

Before a live competition enables appearance, active-squad, duration, assist, card,
clean-sheet, rebound, or similar rules, Matchday Field Mode must capture and verify those
events for the complete match squad.

## Supported Configurations

- Football: 15-player squad, 11 starters, 100 Fantasy Credits
- Basketball: 10-player squad, 5 starters, 100 Fantasy Credits
- Rugby 15s: 23-player squad, 15 starters, 120 Fantasy Credits
- Rugby 7s: 12-player squad, 7 starters, 100 Fantasy Credits

All values live in versioned scoring profiles and squad rules. UI components do not own
official scoring values.

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
