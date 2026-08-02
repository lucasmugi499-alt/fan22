# GoalPlace256 Deployment Readiness

Status: demo deployment candidate can be checked from the repository with one command.
Production deployment remains blocked until the clean production environment registry and
Firebase/App Hosting placeholders are replaced and `prod:assert-clean` passes.

## Primary Gate

Run:

```bash
npm run deploy:ready
```

This performs:

- ESLint
- Vitest
- Firestore and Storage rules tests through the Firebase emulators
- Firebase Functions typecheck and build
- demo seed validation
- dependency advisory gate
- Next production build

Fantasy staging candidates also require the hosted Auth/Firestore smoke before rules or
indexes are promoted:

```bash
npm run staging:fantasy-smoke
```

That command exercises the deployed API with a real Fan Firebase ID token, scheduler
authorization, lineup locking, transfer validation, official scoring, and correction
re-scoring. See `docs/FANTASY_STAGING_SMOKE.md` for required credentials and evidence.

## Environment Topology

The current investor demo uses Firebase App Hosting in `us-east4`. The default Firebase
framework backend region in `firebase.json` is pinned to `us-east4` to avoid accidental
cross-region server runtime placement for App Router API routes and server rendering.

The demo hosting/control project and the backing Auth/Firestore/Storage project may be
different during the investor showroom phase. When that is intentional, the App Hosting
config must make both identities explicit:

- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`: browser Auth/Firestore/Storage project.
- `GOALPLACE_ADMIN_PROJECT_ID`: Admin SDK data project.
- `NEXT_PUBLIC_FIREBASE_DATABASE_ID` and `GOALPLACE_FIRESTORE_DATABASE_ID`: named database,
  currently `fg256`.
- `GOALPLACE_APP_BASE_URL`: exact public origin used for invitations, email links,
  callbacks, and share metadata.

Beta and production should prefer one Firebase project per environment unless there is a
documented operational reason to split hosting from data.

The Firebase rules emulators require a local Java runtime on `PATH`. If Java is missing,
`npm run test:rules` fails before executing rule assertions.

For production, run:

```bash
npm run deploy:ready:production
```

That includes the same checks and then runs:

```bash
npm run prod:assert-clean
```

The production guard intentionally fails while `config/environments.json` or
`apphosting.production.yaml` still contain unconfigured production values.

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
- Storage rules are now covered by emulator tests for private user media, approved media,
  server-issued media upload boundaries, match evidence read isolation, immutability,
  content type, and size limits.

Still registered:

- Next-pinned `postcss` copy. Next `16.2.12` is current, and npm audit proposes an unsafe
  downgrade instead of a real patched upgrade.
- Current `firebase-admin` storage chain advisory. The application does not expose the
  affected uuid buffer APIs to untrusted input.
- Development/deploy tooling glob/minimatch advisories through Firebase CLI and ESLint.

## Production Blockers

Before production activation:

- Replace all production `REPLACE_WITH_*` values in `config/environments.json` and
  `apphosting.production.yaml`.
- Set a real production `NEXT_PUBLIC_GOALPLACE_ENVIRONMENT_VERSION` for the activation,
  not `env-production-unset`.
- Install Java in CI/operator machines so `npm run test:rules` can start the Firestore
  emulator.
- Confirm the clean production Firebase project, Storage bucket, Auth config, App Check key,
  scheduler OIDC audience, and scheduler service account.
- Create the App Hosting Secret Manager secret `resendApiKey` and configure
  `GOALPLACE_APP_BASE_URL` plus a verified `GOALPLACE_EMAIL_FROM` sender.
- Run `npm run deploy:ready:production`.
- Run the environment activation workflow with the production confirmation phrase.

Real payments remain disabled until the separate money launch gate is approved.
