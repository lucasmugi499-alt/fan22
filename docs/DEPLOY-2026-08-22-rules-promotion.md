# Deploy record: Firestore ruleset promotion

**Date:** 2026-08-22
**Change:** `firestore.rules.next` promoted to staging and production
**Authorized by:** repository owner, explicitly, in the session that performed it
**Status:** Deployed to both projects, compiled cleanly, no rollback needed

## Why this was urgent rather than housekeeping

The previously deployed baseline (`firestore.rules`) **denied the exact document the live
registration path writes.** `registerAccount` in `src/lib/firebase/auth.ts` writes
`accountClass`; the baseline's `users` create allowlist does not include it, and `hasOnly`
rejects the whole write. Public signup was therefore broken for as long as that ruleset was
live — silently, because the failure only surfaces when a real person tries to register.

This was found by pinning the registration payload as a rules test and running it against
both rulesets: it passes against the promoted ruleset and returns `PERMISSION_DENIED` against
the baseline. The test is retained (`accepts the exact document the live registration path
writes`) so the two cannot drift apart again unnoticed.

The second consequence was narrower but the same shape: 69 collections the client reads were
not modelled in the baseline at all, so they fell to the `{document=**}` catch-all, which
granted read to `super_admin` alone. Platform Admins opening those surfaces in production saw
empty lists rather than data — Competition Integrity's reconciliation queue among them.

## What changed in the promoted ruleset before deploying

The promotion was not a straight file swap. Three changes were made first:

1. **`users` create allowlist restored.** The pending ruleset had lost the `keys().hasOnly`
   constraint the baseline had — the one place it was *looser* than production. It is back,
   with the field set the live client actually writes (`accountClass` and
   `pendingInvitationPath` included), so the hardening returns without re-breaking signup.
2. **Catch-all narrowed to deny-all.** `match /{document=**}` no longer grants `super_admin` a
   blanket read. Firestore grants on ANY matching allow, so that role-shaped exemption
   overrode every specific deny in the file — including `athletePayees`. Narrowing it is only
   safe because the promoted ruleset models every collection the client reads.
3. **Athlete self-editing removed, payee and settings collections added.** Athletes became
   managed profiles; `athletePayees` is closed to every client credential without exception,
   and `platformSettings` is publicly readable and writable only through the audited command.

## Verification

| | |
|---|---|
| Local emulator suite | 118 rules tests against the promoted file, all passing |
| Staging deploy | `studio-534174814-9df36`, database `fg256` — compiled and released |
| Production deploy | `manifest-quasar-479416-s7`, database `fg256` — compiled and released |
| Indexes | unchanged; one pre-existing index in the project is absent from the repo file and was **not** deleted (no `--force`) |
| Live behavioural smoke | **NOT run.** See below. |

## Outstanding

`npm run staging:role-smoke` has not been run against the deployed rules. It creates real
accounts in a live project, so it is the owner's to run, not an agent's. Until it has run,
the evidence for these rules is emulator-level plus a clean compile — strong, but not the
same as a live role walk. That is the next step, and it should be run against staging first.

## Rollback

`firestore.rules` is retained as the superseded baseline and is deployed by nothing. If the
promoted ruleset has to be reverted, point a config at that file and redeploy — but note it
reintroduces the broken-signup defect above, so reverting is a trade, not a safe default.
