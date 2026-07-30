# Statistics Engine

Athlete and team statistics are projections from official sport events.

GoalPlace should maintain:

- `athleteMatchStatistics`
- `athleteSeasonStatistics`
- `athleteCareerStatistics`
- `teamMatchStatistics`
- `teamSeasonStatistics`

Each statistic definition declares:

- code
- sport
- entity type
- value type
- source event types
- aggregation method
- minimum collection level

Legacy `Athlete.stats` can remain as a read projection during migration, but it is not the source of official performance truth.
