# GoalPlace256 Money, Support, Challenge, And Points Engine

Status: pilot architecture and sandbox provider boundary implemented; real payments disabled.

This document records the product boundary. It is not a Ugandan legal opinion.

## Hard Rules

1. GoalPlace256 does not operate a stored-value wallet.
2. A licensed payment provider collects and pays money.
3. Only a signed, timestamp-checked, idempotent PSP webhook can settle a payment.
4. The recipient support amount is not reduced by the GoalPlace service fee.
5. Fan-funded performance challenges remain disabled until written legal clearance.
6. GoalPlace Points are non-transferable, non-purchasable, non-redeemable recognition.
7. Official sport verification and financial settlement remain separate decisions.

## Pilot Products

- Direct athlete, team, and league support
- Team-verified and League-approved support needs
- Sponsor-funded development grants
- Non-cash challenges
- Flat participation points

The pilot does not offer deposits, reusable balances, cash-out, peer transfers, odds,
opposing outcomes, fan prizes, or cash-funded one-match challenges.

## Contribution Flow

```text
Supporter chooses a support amount
-> server creates an idempotent payment intent
-> provider adapter requests sandbox collection
-> provider callback is authenticated and status-confirmed
-> immutable balanced ledger transaction is written
-> recipient allocation is created
-> payout remains pending until destination and KYC controls pass
```

If a provider-confirmed settlement arrives after a reservation expires, would overfund a
need, or references a support need that is no longer available, the platform still
recognizes the collected money. It writes a held settlement journal that debits PSP
clearing and credits `refund_payable` for the full charged amount. It does not credit
`recipient_payable` or `platform_fee_revenue` until compliance resolves the case.

Contribution history errors must be visible to the supporter. A permission, network, or
provider-history read failure should render a retryable error state, never the same empty
state used for an account with no support activity.

Money is stored as positive integer UGX units. The checkout displays:

- Full recipient support amount
- Separate 5% GoalPlace service fee
- PSP fee when the provider supplies it
- Total charged

## Trust Boundaries

Firestore clients cannot write:

- Payment intents or contributions
- Allocations, payouts, refunds, chargebacks, or settlements
- Ledger transactions or entries
- Webhook events
- Points events
- Compliance cases
- Challenge approvals, outcomes, or lifecycle changes
- Support-need approvals

The Admin SDK endpoints write these records after authentication, relationship checks,
role separation, state validation, and idempotency checks.

## Support Need Lifecycle

```text
Athlete proposes
-> Team Admin verifies need and affiliation
-> League Admin approves publication
-> supporter contributes through PSP
-> allocation waits for payout-destination verification
-> approved destination receives payout
-> recipient publishes completion evidence
-> need becomes completed
```

Approved vendor, verified team, or verified academy destinations are preferred. Minor
athletes require guardian consent and a verified guardian or organization/vendor destination.

## Challenge Lifecycle

```text
Non-cash:

```text
proposed -> team approved -> approved -> active -> evidence -> review
-> achieved / not achieved / void -> closed
```

Sponsor grant:

```text
proposed -> team approved -> approved -> grant committed -> active -> evidence -> outcome verified
-> allocation approved -> paid
```
```

Pilot challenges use `non_cash` or `sponsor_grant`. Supporter-pooled conditional funding is
not implemented. The proposer cannot approve feasibility, Team Admins cannot verify the
outcome, high-value outcomes require Platform review, and the outcome verifier cannot
approve settlement.

## Points Controls

- Fixed points by action; contribution amount is ignored
- One event per idempotency key
- Daily cap: 100
- Weekly cap: 350
- Cap-rejected events are retained without changing the points balance
- Points accounting periods follow `Africa/Kampala`
- Match attendance requires a trusted attendance record
- Comments require a verified constructive flag
- Fraudulent events can be reversed

## Launch Gates

Real money remains disabled until all are complete:

- Written Ugandan payment-flow opinion
- Written gaming/challenge opinion
- Licensed PSP contract and provider integration
- Airtel/MTN sandbox credentials, collection/disbursement status polling, and callback verification
- Signed webhook and reconciliation certification
- KYC/AML responsibility matrix
- Recipient and guardian verification
- Payout, refund, chargeback, complaints, and appeal operations
- Ugandan tax classification
- PDPO and child-data compliance
- Required platform, contribution, recipient, sponsor, safeguarding, and evidence terms
- Staging end-to-end payment, refund, payout, and reconciliation tests

`GOALPLACE_PAYMENTS_MODE=sandbox` is intentionally the only accepted server mode today.
