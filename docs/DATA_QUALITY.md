# Data Quality

GoalPlace256 classifies sports data before it powers statistics or fantasy.

Coverage fields:

- `resultCoverage`: whether an official score exists.
- `rosterCoverage`: none, partial or complete.
- `eventCoverage`: none, partial, score-reconcilable or complete.
- `statisticCoverageLevel`: result, basic, standard or advanced.
- `fantasyEligible`: true only when official, reconciled data supports the fantasy profile.
- `qualityIssues`: machine-readable warnings for operators.

Incomplete result data may still drive standings when policy permits, but it must not create fantasy points that depend on unavailable events or statistics.
