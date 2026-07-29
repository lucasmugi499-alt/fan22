# PSP Sandbox Runbook

Status: integration boundary implemented; no Airtel or MTN credentials are configured and no
real collection or payout is enabled.

## Provider Contract

All providers implement `src/server/payments/providers/PaymentProvider.ts`. Browser code only
creates a GoalPlace payment intent. The server invokes the provider, then a provider-specific
callback route verifies and normalizes the result before the shared settlement processor writes
ledger, allocation, reservation, and points records.

- Sandbox: `/api/payments/webhooks/provider`
- Airtel Money: `/api/payments/webhooks/airtel`
- MTN MoMo: `/api/payments/webhooks/mtn`

MTN callbacks are delivery notifications and are status-polled before a settlement is accepted.
The MTN documentation says its sandbox callback host must use HTTPS, may receive only one
delivery attempt, and should be backed by a status query. Airtel’s final callback fields and
authentication must be taken from the partner onboarding package; the adapter refuses to run
without those supplied values.

## Staging Egress

Do not provision an outbound IP or place it in Airtel’s portal yet. This repository has no
payment VPC/NAT deployment because that changes cloud networking and can incur cost. After both
provider sandbox adapters have passed their request, callback, status-query, and reconciliation
tests, provision a dedicated staging payment runtime with a reserved IPv4, VPC egress, and Cloud
NAT. Expose an admin-restricted outbound-IP diagnostic endpoint only in that runtime; confirm its
response equals the reserved address before registering it with Airtel.

Production networking remains untouched.

## Rule Promotion

`firebase.json` continues to reference the current production rules. The tested candidate matrix
lives in `firestore.rules.next`; it can be reviewed with
`firebase.production-candidate.json` and the explicit `npm run deploy:prod:rules-candidate`
command. That command is not part of a normal deploy and must not run until the full staging
rules suite passes and a reviewer approves the diff.

## Sandbox Checklist

1. Configure only sandbox credentials in a private runtime environment.
2. Provision a recipient eligibility record and a verified payout destination.
3. Start a contribution with a stable checkout-session id.
4. Verify pending, failed, duplicate, late-settlement, and settled callback behavior.
5. Confirm support reservations release or settle correctly and cannot overfund a need.
6. Reconcile provider status with each internal ledger transaction before testing payouts.
