# GoalPlace256 Data Modes

GoalPlace256 uses one `GoalPlaceDataProvider` contract with explicit mock and Firebase modes.
The canonical synthetic package is `data/investor-demo/database.json`.

## Mock Mode

`NEXT_PUBLIC_DATA_MODE=mock` reads the canonical investor package through
`src/data/mockDatabase.ts`. In-memory writes support demonstrations, and every money action
is labelled synthetic. No real payment moves.

```bash
npm run dev:mock
```

Mock mode does not require Firebase environment variables.

## Firebase Mode

`NEXT_PUBLIC_DATA_MODE=firebase` requires the complete public Firebase client
configuration. Missing configuration fails closed with a configuration error; Firebase
mode never substitutes synthetic data.

```bash
npm run dev:firebase
```

Required values are listed in `.env.example`. Browser code receives only `NEXT_PUBLIC_*`
Firebase values. Admin private keys, refresh tokens, service-account files, webhook secrets,
and `.env.local` must never be committed or shipped to the browser.

Firebase reads use bounded and scoped queries for large collections. Public league and team
hubs query their own records, while exact athlete and match deep links fetch the named
document before loading related records.

## Emulator Mode

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
npm run seed:emulator
```

Run rules tests with a JDK:

```bash
npm run test:rules
```

## Investor Staging Seed

The staging importer:

- Accepts only the configured `staging` project alias and named `fg256` database
- Requires explicit execute, reset, and confirmation flags
- Refuses a package not marked synthetic
- Validates package counts and references
- Takes a Firestore/Auth backup before reset
- Writes result events to `resultSubmissions/{matchId}/events/{eventId}`
- Verifies document and Auth counts after import

Preview the command before using its explicit execution flags:

```bash
npm run seed:investor-demo -- --project <staging-project-id> --database fg256
```

Do not seed production with synthetic investor data.

## Payments

Data mode and payment mode are separate. Firebase mode does not enable payments.
`GOALPLACE_PAYMENTS_MODE=sandbox`, a provider identifier, and a server-only webhook secret
are required before the sandbox payment endpoint responds. Real-money launch gates are in
`docs/MONEY_ENGINE.md`.
