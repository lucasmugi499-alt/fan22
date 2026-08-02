# Fantasy Activation Browser QA

Date: 2026-08-02

Environment: local investor demo, `http://localhost:3007`, `NEXT_PUBLIC_DATA_MODE=mock`

## Scope

This pass verifies the operator-facing fantasy launch workflow that sits in the League
Admin and Platform Admin workspaces. It does not replace the remaining Firebase staging
Auth/Firestore gates.

## Accounts

- League Admin: `collins_tumwesigye.kmcfl@demo.goalplace256.test`
- Platform Admin: `anthony_platform.platform@demo.goalplace256.test`

## Result

- League Admin `/league-admin` shows Fantasy launch control with league, season, rules,
  data level, recorded stat keys, readiness totals, and a Prepare proposal action.
- League Admin prepared a demo fantasy proposal for Kampala Metro Community Football
  League. The proposal appeared as pending and ready.
- Platform Admin `/admin` shows Fantasy launch control with all leagues selectable,
  ready/pending counts, activation readiness, and an Activate action only on pending
  proposed or approved competitions.
- Platform Admin activated the demo proposal. The proposal moved to active and pending
  count returned to zero.
- 390px mobile and 1440px desktop browser passes showed the fantasy launch panel
  rendering without page-level horizontal overflow after the mobile table fallback.
- Browser console errors: none observed during the final pass.

## Notes

The real Firebase route remains server-authoritative. In Firebase mode the panel reads
`GET /api/fantasy/admin` and submits `POST /api/fantasy/admin` with the signed-in user's
ID token. In mock mode, the workflow is demo-local and uses synthetic readiness data so
the investor environment can demonstrate the operator journey without writing Firestore.

Production fantasy activation remains blocked until staging Auth/Firestore integration
tests pass and candidate Firestore rules/indexes are promoted through the approved gate.
