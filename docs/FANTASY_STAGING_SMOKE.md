# Fantasy Staging Smoke

This smoke test proves the free-to-play fantasy workflow against the real hosted app and the real staging Firestore/Auth project.

It covers:

- Fan Auth sign-in with a real Firebase ID token
- `POST /api/fantasy/teams`
- `POST /api/fantasy/transfers`
- `POST /api/fantasy/lock-lineups`
- `POST /api/fantasy/score-finalized`
- Official-result correction re-scoring
- Firestore verification for locked lineups, leaderboard totals, and correction records

## Command

```bash
npm run staging:fantasy-smoke
```

Required configuration:

```bash
GOALPLACE_STAGING_BASE_URL=https://your-staging-hosted-app
GOALPLACE_STAGING_FIREBASE_API_KEY=...
GOALPLACE_STAGING_SMOKE_PASSWORD=...
GOALPLACE_FANTASY_SCORING_SECRET=...
GOOGLE_APPLICATION_CREDENTIALS=/path/to/staging-service-account.json
```

The script defaults to the `.firebaserc` staging project and the `fg256` Firestore database. It refuses production projects unless `--allow-production` is explicitly passed.

Useful flags:

```bash
npm run staging:fantasy-smoke -- --json
npm run staging:fantasy-smoke -- --keep
npm run staging:fantasy-smoke -- --base-url https://staging.example.com --run-id manual_001
```

By default, the script deletes the temporary Auth user and all seeded smoke documents after the run. Evidence is written to `reports/staging/fantasy-auth-firestore-smoke-<runId>.json`, which is ignored by git because it may contain staging IDs and emails.

## Passing Evidence

A passing report must show successful steps for:

- `create_lineup`
- `transfer_bench_player`
- `lock_lineups`
- `score_finalized_match_v1`
- `score_finalized_match_v2_correction`

The verified leaderboard totals are:

- First official score: `13.5`
- Corrected score: `21`

Do not promote candidate fantasy rules or indexes from staging until this smoke test passes and the evidence report is attached to the release notes.
