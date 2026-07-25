# CLEANUP_SCRIPT_GUIDE

Two scripts. `clean:preview` never writes; `clean:execute` deletes.

## Why the guards exist

`.env.local` in this repository holds Admin SDK credentials for the **production** project.
Any script run here reaches production by default. Every refusal below exists to make that
default harmless, and each one is covered by a test in `scripts/clean/guards.test.ts`.

## Required flags

| Flag | Required | Notes |
|---|---|---|
| `--project` | always | Never inferred from a CLI alias or ambient state |
| `--database` | always | `fg256` in both environments |
| `--env` | always | `staging` or `production`; must agree with `.firebaserc` |
| `--confirm` | execute only | `RESET-GOALPLACE-STAGING` or `RESET-GOALPLACE-PRODUCTION` |
| `--preserve` | strongly advised | Comma-separated Auth UIDs to keep |
| `--credentials` | staging | Path to the target project's service-account JSON |
| `--dry-run` | optional | Execute path performs no writes |
| `--include-ledgers` | rarely | Also deletes `finalizations` and `auditEvents` |

## What each refusal protects against

| Invocation | Result |
|---|---|
| No flags | Refused: lists every missing flag |
| `--env staging` pointed at the production project | **Refused**: alias map says production |
| Production without `--confirm` | Refused, prints the exact phrase needed |
| Production with the staging phrase | Refused |
| Typo'd or unknown project ID | Refused: not a known alias |
| Credentials belonging to another project | Refused: credential mismatch |
| Every admin account would be deleted | Refused: would lock you out |

## Preview

```bash
npm run clean:preview -- --project <id> --database fg256 --env <env> [--preserve <uid>]
```

Discovers collections with `listCollections()` at run time rather than a hardcoded list,
counts documents, samples documents for subcollections, lists Auth accounts with their roles
and preserve status, correlates Auth accounts against `users/{uid}` to find orphans in both
directions, and inventories Storage by folder. Writes timestamped JSON and Markdown to
`reports/`.

`reports/` is gitignored: inventories contain account emails and UIDs.

## Execute

```bash
npm run clean:execute -- --project <id> --database fg256 --env <env> \
  --preserve <uid> --confirm <PHRASE>
```

Deletes Firestore documents recursively so subcollections cannot be orphaned, deletes Auth
accounts in batches of 1000 while honouring the preserve list, deletes Storage objects,
continues after recoverable failures, and writes `RESET_EXECUTION_REPORT.md` plus timestamped
reports. `finalizations` and `auditEvents` are protected by default because they are the audit
trail the trust model depends on.

It never touches the project, the database, security rules, indexes, or Cloud Functions.

## Owner account

```bash
OWNER_PASSWORD='<strong password>' npm run create:owner -- \
  --project <id> --database fg256 --env <env> \
  --email <email> --name "<Name>" --role super_admin
```

Creates or updates the Auth account, sets the `role` custom claim, and writes `users/{uid}`
with a matching id. The password comes from the environment so it never lands in a flag or in
shell history. Run and verify this **before** any Auth cleanup.
