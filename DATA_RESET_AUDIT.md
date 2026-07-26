# DATA_RESET_AUDIT

Audit of everything a GoalPlace256 data reset would touch, produced before any destructive
action. Live figures come from a read-only preview of production run on 2026-07-25
(`reports/reset-preview-production-2026-07-25T13-50-18-868Z.json`).

**Nothing has been deleted. No production data has been modified.**

---

## 0. Headline findings

Three facts change the plan and must be read before anything else.

### 0.1 Production contains only fictional data

Production `manifest-quasar-479416-s7` / database `fg256` holds **658 documents** and
**200 Authentication accounts**. Every account email matches `userN@example.com`. There are
**zero** non-`@example.com` accounts.

This is good news: the reset destroys no real user's data. It also means there is no live
traction to preserve, and any public metric derived from this database is fictional.

### 0.2 There is no real owner account to preserve, and no custom claims anywhere

The preview found 5 accounts carrying `super_admin` (`user_001`–`user_005`), but all are
seeded fakes at `@example.com`, and **0 of 200 accounts have any custom claims set**.

Consequences:

- Requirement §9 ("do not delete the only functioning Platform Admin before a replacement is
  verified") cannot be satisfied by preserving an existing account, because none is real.
- The custom-claims security model described in §13 has never actually been applied in
  production; role authority currently rests on the Firestore `users/{uid}.role` field alone.
- **A real owner account must be created and verified before the Auth cleanup runs.** The
  cleanup script refuses to proceed when every admin would be deleted, so this is enforced,
  not merely advised.

`lucasmugi499@gmail.com` owns the Firebase project and the local CLI session, but has **no
Firebase Authentication account in this project**.

### 0.3 The production schema is older than the application code

Collections present (13): `athletes`, `awards`, `challenges`, `feedPosts`, `leagues`,
`matches`, `sponsors`, `sports`, `supportPledges`, `teams`, `users`, `verifications`,
`walletTransactions`.

Collections the codebase expects but which **do not exist in production**: `seasons`,
`resultSubmissions`, `notifications`, `comments`, `reports`, `adminLogs`, `invitations`.

The absence of `seasons` and `resultSubmissions` confirms that the season model and the
result-submission trust workflow were never deployed. This aligns with `firestore.rules.next`
never having been promoted to the deployed `firestore.rules`.

---

## 1. Live production inventory (read-only)

| Collection | Documents |
|---|---:|
| athletes | 120 |
| awards | 15 |
| challenges | 60 |
| feedPosts | 50 |
| leagues | 10 |
| matches | 40 |
| sponsors | 15 |
| sports | 3 |
| supportPledges | 40 |
| teams | 40 |
| users | 200 |
| verifications | 25 |
| walletTransactions | 40 |
| **Total** | **658** |

- **Subcollections discovered: 0.** The production data is flat. Deletion still runs
  recursively so future subcollections cannot be orphaned.
- **Firebase Storage objects: 0.** There is nothing to clean up in Storage; the new structure
  in §20 of the sprint spec can be adopted from empty.
- **Auth accounts: 200**, all fictional, all without custom claims.
- **Orphans: 0** in either direction (every Auth account has a `users/{uid}` document).

### Collection-list gap that would have caused data loss

`scripts/reset-demo-data.ts` hardcodes **16** collections. The deployed security rules
reference **18** (it omits `sports`), and the target schema adds `seasons`,
`resultSubmissions`, `invitations`, `finalizations`, `auditEvents` and more. Any reset driven
by that hardcoded list would leave orphaned records behind.

The new scripts therefore discover collections with `listCollections()` at run time rather
than trusting a list. This is the single most important behavioural difference from the old
script.

---

## 2. Mock and seed inventory (code)

### Mock data modules (18 files, `src/data/`)

`mockAthletes`, `mockAwards`, `mockChallenges`, `mockComments`, `mockDatabase`,
`mockFeedPosts`, `mockLeagues`, `mockMatches`, `mockNotifications`, `mockReports`,
`mockSeasons`, `mockSponsors`, `mockSports`, `mockSupportPledges`, `mockTeams`, `mockUsers`,
`mockVerifications`, `mockWalletTransactions`, plus `src/data/providers/mockProvider.ts` and
`src/lib/auth/mockAuth.ts` (`MOCK_PROFILES`).

### Seed and reset scripts (`scripts/`)

| Script | Purpose | Risk |
|---|---|---|
| `seed-firestore.ts` | Writes mock data to Firestore | **Destructive-adjacent**; can repopulate fiction |
| `seed-demo.ts` | Seeds demo records | Same |
| `seed-emulator.ts` | Seeds the local emulator | Safe (emulator only) |
| `seed-mock-data.ts` | Generates local mock files | Safe |
| `generate-mock-data.ts` | Generates mock fixtures | Safe |
| `export-mock-json.ts` | Exports mock data to JSON | Safe |
| `reset-demo-data.ts` | Old reset, **hardcoded 16 collections** | **Unsafe: incomplete coverage** |
| `backup-firestore.ts` | Firestore backup | Safe, required before reset |
| `set-admin-claims.ts` | Sets custom claims | Privileged |

**Action:** after the migration, `seed-firestore.ts`, `seed-demo.ts` and `reset-demo-data.ts`
must be removed or hard-gated so they cannot target production.

---

## 3. Demo login mechanisms to remove from production

| Mechanism | Location |
|---|---|
| Demo role storage key `goalplace256.demoRole` | `src/context/AuthProvider.tsx:12` |
| `sessionStorage` read/write of the demo role | `AuthProvider.tsx:34,51,56` |
| Cookie `goalplace256.demoRole` read/write/clear | `AuthProvider.tsx:40,52,57` |
| `setDemoRole()` synthesising a session from `MOCK_PROFILES` | `AuthProvider.tsx:71-95` |
| Demo role switcher pill | `src/components/auth/DemoRoleSwitcher.tsx` |
| Role-picker sign-in screen | `src/components/marketing/SignIn.tsx` |
| Demo gate | `src/lib/auth/demoMode.ts` |

All are already gated behind `isDemoModeEnabled`, which is true when
`NODE_ENV === 'development'` **or** `NEXT_PUBLIC_ENABLE_DEMO_LOGIN === 'true'`.

Production must set `NEXT_PUBLIC_ENABLE_DEMO_LOGIN=false` (or leave it unset in a production
build) so none of the above renders.

### Storage keys and cookies written by the app

- `sessionStorage: goalplace256.demoRole`
- `cookie: goalplace256.demoRole` (path `/`, SameSite=Lax)

No other `localStorage` keys are written. Zustand state is in-memory only and is lost on
reload, so nothing else persists client-side.

---

## 4. Environment variables controlling data and demo mode

| Variable | Effect |
|---|---|
| `NEXT_PUBLIC_DATA_MODE` | `firebase` selects the live provider; anything else (including unset) selects mock |
| `NEXT_PUBLIC_ENABLE_DEMO_LOGIN` | `true` enables demo role login outside development |
| `NEXT_PUBLIC_FIREBASE_DATABASE_ID` | Must be `fg256` |
| `NEXT_PUBLIC_FIREBASE_*` | Client config |
| `FIREBASE_ADMIN_PROJECT_ID` / `_CLIENT_EMAIL` / `_PRIVATE_KEY` | **Admin credentials** |

**`.env.local` currently holds Admin credentials for the production project.** Any script run
in this repository can reach production by default. This is why the cleanup scripts refuse to
run unless the credential's project matches an explicitly passed `--project`.

Current local values: `NEXT_PUBLIC_DATA_MODE` unset (mock), `NEXT_PUBLIC_ENABLE_DEMO_LOGIN`
unset, `NEXT_PUBLIC_FIREBASE_DATABASE_ID=fg256`.

---

## 5. Mock fallback behaviour

Previously `useGoalPlaceData()` caught any Firebase failure and silently loaded
`mockProvider`, so an outage could present fictional leagues and scores as live records.

**Already fixed** (commit `aac3155`): failures now preserve any real snapshot already held,
surface an error state with retry, log the failure, and never substitute mock data. The hook
exposes `error`, `retry` and `source`.

Remaining work for this sprint: move the mock modules into an explicitly isolated
`src/devFixtures/` (or `src/testFixtures/`) directory so the production provider cannot import
them even by accident.

---

## 6. What must not be touched

Confirmed present and out of scope for deletion: the Firebase project, database `fg256`, the
Storage bucket, `firestore.rules` / `firestore.rules.next`, `firestore.indexes.json`,
`storage.rules`, `functions/` (including the trusted finalizer, finalization ledger and
version/stale-write protection), `AuthProvider`, permission helpers, `RouteGuard`,
`roleConfig`, the data-provider abstraction, the design system, application routes, and the
447 automated tests.

The reset removes **application records and obsolete accounts only**.

---

## 7. Required sequence (blocking order)

1. Back up production Firestore
   (`npm run backup:firestore -- --project manifest-quasar-479416-s7 --database fg256 --env production`)
   and export the Auth user list.
2. Create a staging Firebase project with a named `fg256` database; set the `staging` alias in
   `.firebaserc`. Done on 2026-07-26: `studio-534174814-9df36` with database `fg256`.
3. **Create the real owner account and verify sign-in, `/admin` access and sign-out.**
   Blocking: no real admin exists today.
4. Rehearse the full reset and rebuild in staging.
5. Re-run the production preview and obtain explicit written approval.
6. Execute the production reset with `--preserve <verified-owner-uid>`.
7. Rebuild foundational data and run `POST_RESET_QA.md`.

Steps 3 and 5 are hard gates. The execute script enforces step 3 by refusing to run when
every admin account would be deleted.

---

## 8. Risk register

| Risk | Mitigation |
|---|---|
| Ambient production credentials in `.env.local` | Cleanup, owner and backup scripts require `--project` and verify the credential's project matches |
| Reset run against production believing it is staging | `.firebaserc` alias map must agree with `--env`; refusal is tested |
| Typo in project ID hitting an unrelated project | Unknown projects are refused outright |
| Incomplete collection list orphaning data | Collections discovered at run time, deletion is recursive |
| Deleting every administrator and losing access | Script refuses unless a preserved admin exists |
| Audit ledgers destroyed | `finalizations` and `auditEvents` are protected unless `--include-ledgers` |
| Old seed scripts repopulating fiction | To be removed or hard-gated after migration |
| Public metrics presented as real | Demo data notices in place; production must not run mock mode |
