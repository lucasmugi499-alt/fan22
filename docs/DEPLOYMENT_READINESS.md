# GoalPlace256 Deployment Readiness

Status: demo deployment candidate can be checked from the repository with one command.
Production deployment remains blocked until the clean production Firebase/App Hosting
placeholders are replaced and `prod:assert-clean` passes.

## Primary Gate

Run:

```bash
npm run deploy:ready
```

This performs:

- ESLint
- Vitest
- Firestore rules tests through the Firebase emulator
- Firebase Functions typecheck and build
- demo seed validation
- dependency advisory gate
- Next production build

The Firestore emulator requires a local Java runtime on `PATH`. If Java is missing,
`npm run test:rules` fails before executing rule assertions.

For production, run:

```bash
npm run deploy:ready:production
```

That includes the same checks and then runs:

```bash
npm run prod:assert-clean
```

The production guard intentionally fails while `apphosting.production.yaml` still contains
`REPLACE_WITH_*` placeholders.

## Dependency Advisory Policy

Do not require raw `npm audit` to be zero until upstream packages provide safe fixes.
Instead, run:

```bash
npm run security:audit
```

The gate reads `security/advisory-register.json` and fails when:

- a new advisory appears without review
- a critical advisory appears
- a registered advisory expires
- a registered advisory increases above its accepted severity
- an exception lacks a reason or mitigation

Current temporary exceptions expire on `2026-08-30`.

## Current Dependency Remediation

Implemented:

- `firebase-tools` lockfile updated from `15.24.0` to `15.25.0`
- vulnerable transitive `sharp` under Next overridden to `0.35.3`

Still registered:

- Next-pinned `postcss` copy. Next `16.2.12` is current, and npm audit proposes an unsafe
  downgrade instead of a real patched upgrade.
- Current `firebase-admin` storage chain advisory. The application does not expose the
  affected uuid buffer APIs to untrusted input.
- Development/deploy tooling glob/minimatch advisories through Firebase CLI and ESLint.

## Production Blockers

Before production activation:

- Replace all `REPLACE_WITH_*` values in `apphosting.production.yaml`.
- Install Java in CI/operator machines so `npm run test:rules` can start the Firestore
  emulator.
- Confirm the clean production Firebase project, Storage bucket, Auth config, App Check key,
  scheduler OIDC audience, and scheduler service account.
- Run `npm run deploy:ready:production`.
- Run the environment activation workflow with the production confirmation phrase.

Real payments remain disabled until the separate money launch gate is approved.
