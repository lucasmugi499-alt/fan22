# Corrections And Replay

Corrections create new official versions. They do not silently overwrite historical outputs.

The correction flow is:

```text
create official result/event version N+1
→ supersede affected official events
→ rebuild match statistics
→ rebuild season and career projections
→ rebuild standings
→ supersede old fantasy point events
→ create corrected fantasy point events
→ recalculate lineups and leaderboards
→ notify affected users
```

Every user-visible correction should be explainable with:

- source claim and evidence
- old official version
- new official version
- rule version
- projection job
- old total
- new total
- reviewer and reason
