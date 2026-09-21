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

Role-workflow staging candidates must also pass:

```bash
npm run staging:role-smoke
```

That command exercises public league application, Platform Operator approval,
Organization Operator invitation acceptance, scoped access-context projection, team
creation, Team Admin invitation, and expected rejection when a Fan account tries to accept
operator access. See `docs/ROLE_STAGING_SMOKE.md`.

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

Current temporary exceptions expire on `2026-12-20`.

## Current Dependency Remediation

As of 2026-09-21, `npm audit --omit=dev` and the `functions/` tree both report **zero**
advisories of any severity. Implemented:

- `next` 16.3.5 (critical Windows-hosted RCE advisory cleared) and `sharp` 0.35.4 (libheif).
  `overrides.next.sharp` is a floor at `0.35.4`; when raising it, also delete the stale
  `node_modules/next/node_modules/sharp` entry from the lockfile — npm keeps the lock's copy
  over an override change and reports it as `invalid`.
- `firebase-tools` 15.30.2, `vitest` 4.1.11, `vite` 8.3.0 via `npm audit fix`.
- `functions/`: `firebase-admin` 14.4.0, which cleared the `uuid` chain through
  `@google-cloud/storage` that had been registered since August.
- Storage rules are covered by emulator tests for private user media, approved media,
  server-issued media upload boundaries, match evidence read isolation, immutability,
  content type, and size limits.

Still registered (all moderate, all inside the `firebase-tools` devDependency, none shipped):

- `@opentelemetry/core` < 2.8.0 through `@google-cloud/pubsub` 5.x — W3C Baggage memory
  allocation; no deployed service parses baggage headers.
- `csv-parse` < 7.0.2 — prototype replacement via the `columns` option; the CLI's only caller
  (`auth:import`) never passes `columns`.
- `stream-json` <= 3.4.0 — quadratic filters on nested JSON; every caller reads a file or
  command output the developer chose on their own machine.

Waivers are matched by package name. Delete a waiver the moment its advisory clears — a stale
one would silently cover the next advisory on that package, whatever it is.

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
