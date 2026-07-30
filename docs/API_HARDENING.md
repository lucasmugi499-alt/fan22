# GoalPlace256 API Hardening

The app now has shared server-side primitives in `src/server/api/security.ts`.

Use them for new or migrated route handlers instead of one-off parsing, role checks, rate limits, or scheduler secrets.

## Primitives

- `requireAuthenticatedUser(request)`
- `requireRole(actor, roles)`
- `parseJsonBody(request, schema, { maxBytes })`
- `verifyOptionalAppCheck(request)`
- `enforceRateLimit({ bucket, identity, limit, windowSeconds })`
- `requireSchedulerRequest(request, options)`
- `safeSecretEquals(supplied, expected)`

## App Check

Client App Check tokens are attached by `getPublicAppCheckToken()` when:

```text
NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY=...
```

Server enforcement is controlled independently:

```text
GOALPLACE_REQUIRE_APP_CHECK=true
```

Demo leaves this off by default. Beta and production templates turn it on and require a site key before activation.

## Public Inquiry Abuse Protection

`/api/public-inquiries` now uses:

- schema validation
- 8 KB body limit
- optional App Check token
- distributed Firestore rate limiting
- IP, App Check app id, email, phone, organization, and endpoint as rate-limit signals
- honeypot field support
- normalized email and phone
- hashed IP storage

## Scheduler Identity

Scheduler-style routes now use `requireSchedulerRequest`.

Beta and production should use OIDC:

```text
GOALPLACE_SCHEDULER_AUTH_MODE=oidc
GOALPLACE_SCHEDULER_AUDIENCE=https://goalplace256.com/api/...
GOALPLACE_SCHEDULER_SERVICE_ACCOUNT_EMAILS=scheduler@project.iam.gserviceaccount.com
```

Demo may temporarily use existing shared secrets:

```text
GOALPLACE_SCHEDULER_AUTH_MODE=shared_secret
```

Migrated routes:

- `/api/fantasy/lock-lineups`
- `/api/fantasy/score-finalized`
- `/api/payments/reconcile`

Shared-secret fallback exists only to keep the current demo runnable while Cloud Scheduler OIDC targets are provisioned.
