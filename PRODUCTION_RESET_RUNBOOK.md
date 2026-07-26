# PRODUCTION_RESET_RUNBOOK

Operating procedure for resetting production application data.

- **Project:** `manifest-quasar-479416-s7`
- **Database:** `fg256`
- **Production confirmation phrase:** `RESET-GOALPLACE-PRODUCTION`

> **Do not run the execute step until every checkbox in sections 1 to 4 is ticked and written
> approval is recorded in section 5.** The scripts enforce several of these gates, but not all
> of them: backup and sign-in verification are human responsibilities.

---

## 0. Current state (from the read-only preview of 2026-07-25)

| Item | Value |
|---|---|
| Firestore documents | 658 across 13 collections |
| Auth accounts | 200, **all fictional** (`userN@example.com`) |
| Accounts with custom claims | **0** |
| Real accounts | **0** |
| Storage objects | 0 |
| Subcollections | 0 |

**Blocking issue: there is no real administrator account to preserve.** Section 2 must be
completed first, or the reset will lock you out of the platform. The execute script refuses to
run when every admin account would be deleted.

---

## 1. Backup

- [ ] Firestore backup taken:
      `npm run backup:firestore -- --project manifest-quasar-479416-s7 --database fg256 --env production`
- [ ] Backup file location recorded here: `____________________`
- [ ] Auth user list exported:
      `npx firebase auth:export auth-backup.json --project manifest-quasar-479416-s7`
- [ ] Both artefacts stored outside this repository (they contain personal data; do not commit)
- [ ] Backup restore path understood (see section 7)

Because production contains only fictional data, the backup is a safety net rather than a
record of real user activity. Take it anyway.

The backup script uses the same project, database, environment and credential-mismatch guards
as the cleanup scripts, and writes to ignored `backups/firestore/<env>/...` paths.

---

## 2. Create and verify the owner account (blocking)

Run this yourself; the password is supplied through the environment and is never written to a
file, a flag, or shell history when quoted as shown.

```bash
OWNER_PASSWORD='<choose a strong password>' npm run create:owner -- \
  --project manifest-quasar-479416-s7 \
  --database fg256 \
  --env production \
  --email <your-real-email> \
  --name "<Your Name>" \
  --role super_admin
```

- [ ] Account created and its UID recorded here: `____________________`
- [ ] Custom claim `role=super_admin` set (the script reports this)
- [ ] `users/{uid}` profile written
- [ ] Signed in successfully at `/login`
- [ ] `/admin` loads for this account
- [ ] Sign-out works, and `/admin` afterwards redirects to `/login`
- [ ] Browser Back after sign-out does not expose protected content

Do not continue until every box above is ticked.

---

## 3. Staging rehearsal (blocking)

- [x] Staging Firebase project created, with a **named** `fg256` database:
      `studio-534174814-9df36`
- [x] `.firebaserc` `staging` alias replaced
- [ ] Staging service-account key downloaded to a path outside the repo
- [ ] Preview run against staging
- [ ] Execute run against staging with `RESET-GOALPLACE-STAGING`
- [ ] Foundational data rebuilt in staging
- [ ] `POST_RESET_QA.md` passes in staging

```bash
npm run clean:preview -- --project studio-534174814-9df36 --database fg256 --env staging \
  --credentials /secure/path/staging-sa.json

npm run clean:execute -- --project studio-534174814-9df36 --database fg256 --env staging \
  --credentials /secure/path/staging-sa.json \
  --preserve <STAGING_OWNER_UID> \
  --confirm RESET-GOALPLACE-STAGING
```

Verified safety check: running the staging preview without `--credentials` is refused because
`.env.local` contains production Admin credentials.

---

## 4. Production dry run

```bash
npm run clean:preview -- \
  --project manifest-quasar-479416-s7 \
  --database fg256 \
  --env production \
  --preserve <OWNER_UID_FROM_SECTION_2>
```

- [ ] Report reviewed under `reports/`
- [ ] Owner UID appears as `PRESERVE`
- [ ] Deletion totals match expectations
- [ ] No warning about admin accounts remains

Optionally rehearse the destructive path without writing anything:

```bash
npm run clean:execute -- --project manifest-quasar-479416-s7 --database fg256 \
  --env production --preserve <OWNER_UID> --confirm RESET-GOALPLACE-PRODUCTION --dry-run
```

---

## 5. Approval gate

| Field | Value |
|---|---|
| Approved by | `____________________` |
| Date and time | `____________________` |
| Dry-run report reviewed | `reports/____________________` |
| Owner UID to preserve | `____________________` |
| Documents to be deleted | `____________________` |
| Auth accounts to be deleted | `____________________` |

- [ ] Explicit written approval recorded above

---

## 6. Execute

```bash
npm run clean:execute -- \
  --project manifest-quasar-479416-s7 \
  --database fg256 \
  --env production \
  --preserve <OWNER_UID> \
  --confirm RESET-GOALPLACE-PRODUCTION
```

Behaviour:

- Discovers collections at run time and deletes recursively (subcollections included)
- Protects `finalizations` and `auditEvents` unless `--include-ledgers` is passed
- Deletes Auth accounts in batches of 1000, preserving the allowlist
- Deletes Storage objects
- Continues after recoverable failures and records each one
- Writes `RESET_EXECUTION_REPORT.md` plus timestamped JSON and Markdown under `reports/`

### Verification

- [ ] `RESET_EXECUTION_REPORT.md` shows the expected counts
- [ ] Remaining documents equal the intended residue
- [ ] Owner account still signs in
- [ ] `/admin` still loads
- [ ] Re-run the preview and confirm only preserved records remain

---

## 7. Rollback

Deletion is not reversible in place. Recovery means restoring, not undoing.

1. Stop all writes; put the site into maintenance if it is public.
2. Restore Firestore from the section 1 backup into `fg256`.
3. Re-import Auth users:
   `npx firebase auth:import auth-backup.json --project manifest-quasar-479416-s7`
   Password hashes require the matching hash parameters from the export; without them, restored
   users must reset their passwords.
4. Re-verify the owner account.
5. Record the incident in section 8.

Because the current production contents are entirely fictional, the realistic recovery path is
to rebuild foundational data rather than restore. That changes after real leagues onboard, at
which point this section becomes critical and the backup must be verified before every reset.

---

## 8. Incident log

| Date | Operator | Action | Outcome | Report |
|---|---|---|---|---|
| 2026-07-25 | Claude (agent) | Read-only production preview | 658 docs / 200 accounts inventoried; nothing modified | `reports/reset-preview-production-2026-07-25T13-50-18-868Z.md` |
