# Fantasy Scoring Engine

Fantasy Points are product scoring outputs. They are separate from sporting statistics and Community Points.

The supported pipeline is:

```text
official match/event version
→ athlete match-stat projection
→ fantasy rule evaluation
→ fantasy point events
→ locked lineup score
→ round score and leaderboard
```

The Rugby Fantasy Lite profile is defined in `src/kernel/definitions/sportCatalogues.ts`, not React components.

## Rugby Fantasy Lite v1

- Appearance: +2
- Try: +5
- Conversion made: +2
- Penalty goal made: +3
- Drop goal made: +3
- Player of the match: +3
- Win participation: +1
- Yellow card: -1
- Red card: -4
- Captain multiplier: 1.5

Fantasy profiles may reference only statistic codes that exist and are marked fantasy-eligible by the active data collection profile.

Official fantasy points require official result and event versions. Provisional points may be shown but do not count in final leaderboards.
