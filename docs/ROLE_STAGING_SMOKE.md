# Role Staging Smoke

This smoke test proves the account-class and scoped-access workflow against the real hosted app and staging Firebase Auth/Firestore.

It covers:

- Public league application without a Fan account
- Platform Operator approval
- Rejection when an existing Fan email is used for league-operator approval
- League Owner invitation acceptance by a separate Organization Operator account
- Access-context projection for the League Operator scope
- League Operator team creation
- Team Admin invitation
- Rejection when a Fan account tries to accept a Team Admin invitation
- Team Admin invitation acceptance by a separate Organization Operator account
- Access-context projection for the Team Operator scope

## Command

```bash
npm run staging:role-smoke
```

Required configuration:

```bash
GOALPLACE_STAGING_BASE_URL=https://your-staging-hosted-app
GOALPLACE_STAGING_FIREBASE_API_KEY=...
GOALPLACE_STAGING_SMOKE_PASSWORD=...
GOOGLE_APPLICATION_CREDENTIALS=/path/to/staging-service-account.json
```

The script defaults to the `.firebaserc` staging project and the `fg256` Firestore database. It refuses production projects unless `--allow-production` is explicitly passed.

Useful flags:

```bash
npm run staging:role-smoke -- --json
npm run staging:role-smoke -- --keep
npm run staging:role-smoke -- --base-url https://staging.example.com --run-id manual_001
```

By default, the script deletes temporary Auth users and seeded documents after the run. Evidence is written to `reports/staging/role-auth-firestore-smoke-<runId>.json`, which is ignored by git because it may contain staging IDs and emails.

## Passing Evidence

A passing report must show successful or expected-denial steps for:

- `public_application_existing_fan_email`
- `reject_approval_for_existing_fan_email`
- `public_application_operator_email`
- `platform_approves_league_application`
- `operator_accepts_league_owner_invitation`
- `league_operator_context`
- `league_operator_creates_team`
- `league_invites_existing_fan_to_team_admin`
- `fan_cannot_accept_team_admin_invitation`
- `league_invites_operator_to_team_admin`
- `operator_accepts_team_admin_invitation`
- `team_operator_context`

This is the staging proof for the fixed account-class model: Fan accounts remain Fan accounts, and management access belongs to Organization Operator accounts with scoped assignments.
