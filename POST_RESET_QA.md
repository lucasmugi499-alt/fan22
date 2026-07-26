# POST_RESET_QA

Run this after a staging reset rehearsal, and again after any approved production reset.

## Access

- [ ] Preserved owner can sign in at `/login`
- [ ] `/admin` loads for the preserved owner
- [ ] Sign-out works
- [ ] `/admin` redirects to `/login` after sign-out
- [ ] Browser Back after sign-out does not expose protected content

## Data Baseline

- [ ] Reset preview shows only the intended preserved records
- [ ] No fictional `userN@example.com` accounts remain unless deliberately reseeded in staging
- [ ] Foundational sports, leagues, teams and admin records exist
- [ ] Public pages do not show mock-only notices in Firebase mode
- [ ] Storage contains only expected objects

## Core Workflows

- [ ] Fan can browse leagues, teams, athletes and matches
- [ ] Fan support flow creates the expected pledge or support record
- [ ] Admin can create or edit foundational records needed for launch
- [ ] Protected routes reject unauthenticated users
- [ ] Role-restricted routes reject users without the required role

## Result Submission

- [ ] Team Admin A can submit a result
- [ ] Team Admin B can confirm or dispute it
- [ ] League admin can resolve a disputed result
- [ ] Trusted finalizer writes the official match result once
- [ ] Duplicate finalizer triggers are idempotent
- [ ] Stale-version writes are rejected or ignored
- [ ] Standings update from the finalized result
- [ ] Audit ledger entries are append-only

## Production Readiness

- [ ] `NEXT_PUBLIC_DATA_MODE=firebase`
- [ ] `NEXT_PUBLIC_ENABLE_DEMO_LOGIN` is unset or `false`
- [ ] `NEXT_PUBLIC_FIREBASE_DATABASE_ID=fg256`
- [ ] Firebase client config points at the intended project
- [ ] Admin scripts use credentials for the intended project
- [ ] `npm run build` passes
- [ ] `npm run test` passes
- [ ] `npm run test:rules` passes after Java is installed
