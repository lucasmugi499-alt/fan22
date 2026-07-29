export type MoneyCurrency = 'UGX' | 'EUR';
export type MobileMoneyProvider = 'airtel_money' | 'mtn_momo';

export type PaymentIntentStatus =
  | 'created'
  | 'payment_pending'
  | 'payment_processing'
  | 'settled'
  | 'failed'
  | 'cancelled'
  | 'held_for_review'
  | 'chargeback';

export type ContributionStatus =
  | 'created'
  | 'payment_pending'
  | 'payment_processing'
  | 'settled'
  | 'allocated'
  | 'payout_pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'refund_pending'
  | 'refunded'
  | 'chargeback'
  | 'held_for_review';

export type ContributionPurpose =
  | 'direct_athlete_support'
  | 'verified_support_need'
  | 'team_development'
  | 'league_development'
  | 'sponsor_grant';

export interface PaymentIntent {
  id: string;
  supporterUserId: string;
  purpose: ContributionPurpose;
  recipientType: 'athlete' | 'team' | 'league' | 'programme';
  recipientId: string;
  supportNeedId?: string;
  campaignId?: string;
  supportAmountMinor: number;
  platformFeeMinor: number;
  providerFeeMinor?: number;
  totalAmountMinor: number;
  currency: MoneyCurrency;
  provider: string;
  /** Immutable provider request identifier used for status queries. */
  providerRequestReference?: string;
  /** Financial transaction identifier returned after provider processing. */
  providerFinancialReference?: string;
  /** @deprecated Read compatibility for pre-build-30 records. */
  providerReference?: string;
  status: PaymentIntentStatus;
  idempotencyKey: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Contribution {
  id: string;
  paymentIntentId: string;
  supporterUserId: string;
  purpose: ContributionPurpose;
  recipientType: PaymentIntent['recipientType'];
  recipientId: string;
  supportNeedId?: string;
  campaignId?: string;
  supportAmountMinor: number;
  platformFeeMinor: number;
  providerFeeMinor?: number;
  totalAmountMinor: number;
  currency: MoneyCurrency;
  status: ContributionStatus;
  message?: string;
  idempotencyKey: string;
  createdAt: string;
  settledAt?: string;
}

export type LedgerAccountCode =
  | 'psp_clearing'
  | 'customer_support_liability'
  | 'challenge_support_liability'
  | 'recipient_payable'
  | 'platform_fee_revenue'
  | 'sponsor_restricted_funds'
  | 'refund_payable'
  | 'chargeback_reserve'
  | 'payment_processing_expense'
  | 'payout_clearing';

export interface LedgerEntry {
  id: string;
  transactionId: string;
  accountCode: LedgerAccountCode;
  direction: 'debit' | 'credit';
  amountMinor: number;
  currency: MoneyCurrency;
  relatedEntityId: string;
  createdAt: string;
}

export interface LedgerTransaction {
  id: string;
  type: 'contribution_settlement' | 'recipient_payout' | 'refund' | 'chargeback';
  relatedEntityId: string;
  currency: MoneyCurrency;
  idempotencyKey: string;
  createdAt: string;
}

export type PointsEventStatus = 'pending' | 'confirmed' | 'cap_rejected' | 'reversed';

export interface PointsEvent {
  id: string;
  userId: string;
  actionType:
    | 'profile_completed'
    | 'first_league_followed'
    | 'team_followed'
    | 'league_notice_read'
    | 'verified_comment'
    | 'match_attended'
    | 'verified_need_supported'
    | 'athlete_card_shared'
    | 'fan_onboarding_completed';
  relatedEntityId?: string;
  points: number;
  idempotencyKey: string;
  status: PointsEventStatus;
  periodDate?: string;
  periodWeek?: string;
  createdAt: string;
}

export interface PaymentWebhookEvent {
  provider: 'sandbox' | 'airtel_money' | 'mtn_momo';
  eventId: string;
  paymentIntentId: string;
  status: 'settled' | 'failed' | 'held_for_review';
  amountMinor: number;
  currency: MoneyCurrency;
  occurredAt: string;
  providerRequestReference: string;
  providerFinancialReference?: string;
  /** A callback is never trusted until the provider status endpoint confirms it. */
  verifiedByStatusQuery?: boolean;
}

export interface SupportReservation {
  id: string;
  supportNeedId: string;
  paymentIntentId: string;
  supporterUserId: string;
  amountMinor: number;
  currency: MoneyCurrency;
  status: 'active' | 'settled' | 'released' | 'expired' | 'held_for_review';
  expiresAt: string;
  createdAt: string;
  updatedAt?: string;
}

export interface RecipientEligibility {
  id: string;
  recipientType: PaymentIntent['recipientType'];
  recipientId: string;
  status: 'eligible' | 'pending_review' | 'blocked' | 'suspended';
  verified: boolean;
  supportEnabled: boolean;
  complianceHold: boolean;
  payoutDestinationStatus: 'pending_verification' | 'verified' | 'suspended';
  recipientIsMinor?: boolean;
  guardianConsentVerified?: boolean;
  updatedAt: string;
}

export interface Allocation {
  id: string;
  contributionId: string;
  recipientType: PaymentIntent['recipientType'];
  recipientId: string;
  supportNeedId?: string;
  campaignId?: string;
  amountMinor: number;
  currency: MoneyCurrency;
  destinationType?:
    | 'approved_vendor'
    | 'verified_team'
    | 'verified_academy'
    | 'adult_athlete'
    | 'verified_guardian'
    | 'evidence_reimbursement';
  status: 'pending_review' | 'held_for_review' | 'eligible_for_payout' | 'payout_scheduled' | 'paid' | 'reversed';
  createdAt: string;
}

export interface Payout {
  id: string;
  allocationId: string;
  recipientId: string;
  amountMinor: number;
  currency: MoneyCurrency;
  provider: string;
  providerReference?: string;
  status: 'created' | 'scheduled' | 'processing' | 'paid' | 'failed' | 'held_for_review';
  approvedByUserId?: string;
  createdAt: string;
  paidAt?: string;
}

export interface Refund {
  id: string;
  contributionId: string;
  amountMinor: number;
  currency: MoneyCurrency;
  reason:
    | 'duplicate_payment'
    | 'unauthorized_payment'
    | 'technical_failure'
    | 'invalid_campaign'
    | 'recipient_kyc_failed'
    | 'misleading_need'
    | 'void_challenge'
    | 'provider_error';
  status: 'requested' | 'approved' | 'processing' | 'refunded' | 'rejected';
  providerReference?: string;
  createdAt: string;
}

export interface Chargeback {
  id: string;
  contributionId: string;
  amountMinor: number;
  currency: MoneyCurrency;
  providerReference: string;
  status: 'received' | 'under_review' | 'accepted' | 'challenged' | 'resolved';
  createdAt: string;
}

export interface Settlement {
  id: string;
  provider: string;
  providerReference: string;
  amountMinor: number;
  currency: MoneyCurrency;
  contributionIds: string[];
  status: 'received' | 'reconciled' | 'exception';
  occurredAt: string;
  createdAt: string;
}

export interface ComplianceCase {
  id: string;
  relatedEntityType: 'payment_intent' | 'contribution' | 'payout' | 'challenge';
  relatedEntityId: string;
  riskTier: 'micro' | 'standard' | 'enhanced' | 'high_value';
  reason: string;
  status: 'open' | 'reviewing' | 'cleared' | 'blocked';
  assignedToUserId?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface PaymentProviderAttempt {
  id: string;
  paymentIntentId: string;
  provider: PaymentWebhookEvent['provider'];
  operation: 'collection_create' | 'collection_status' | 'callback_verify' | 'reconciliation';
  providerRequestReference?: string;
  providerFinancialReference?: string;
  responseStatus: string;
  redactedProviderResponse?: Record<string, unknown>;
  attemptCount: number;
  createdAt: string;
}
