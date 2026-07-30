# Access Authority Engine

GoalPlace256 separates persona from authority.

`role` remains as a legacy primary persona for dashboards and demo compatibility. Scoped authorization uses:

```text
authenticated account
+ active assignment
+ assignment scope
+ permission bundle
+ resource lifecycle
```

Access assignments project into deterministic `accessIndex/{scopeType}_{scopeId}_{userId}` documents. Firestore Rules and trusted APIs can check those projection documents without broad queries.

## Important Rules

- Administrators invite people; they do not create passwords for them.
- A Team Admin assignment for Team A does not authorize Team B.
- A League Admin assignment authorizes only resources in that league.
- Platform authority satisfies scoped checks only through explicit platform capabilities.
- Super Admin is governance and break-glass, not a normal operational dashboard persona.
- Clients must not write assignments, access indexes, invitation acceptance, audit events, official sports records or projections directly.
