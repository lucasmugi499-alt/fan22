# GoalPlace256 Money, Support, Challenge, And Points Engine

Status: pilot architecture implemented; real payments disabled.

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
-> licensed PSP collects payment
-> signed PSP webhook confirms settlement
-> immutable balanced ledger transaction is written
-> recipient allocation is created
-> payout remains pending until destination and KYC controls pass
```

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
draft
-> proposed
-> team_approved
-> league_approved
-> funding_open
-> funding_locked
-> in_progress
-> evidence_submitted
-> under_review
-> achieved / not_achieved / void
-> allocation_pending
-> settled
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
- Failed payments receive no points
- Match attendance requires a trusted attendance record
- Comments require a verified constructive flag
- Fraudulent events can be reversed

## Launch Gates

Real money remains disabled until all are complete:

- Written Ugandan payment-flow opinion
- Written gaming/challenge opinion
- Licensed PSP contract and provider integration
- Signed webhook and reconciliation certification
- KYC/AML responsibility matrix
- Recipient and guardian verification
- Payout, refund, chargeback, complaints, and appeal operations
- Ugandan tax classification
- PDPO and child-data compliance
- Required platform, contribution, recipient, sponsor, safeguarding, and evidence terms
- Staging end-to-end payment, refund, payout, and reconciliation tests

`GOALPLACE_PAYMENTS_MODE=sandbox` is intentionally the only accepted server mode today.
