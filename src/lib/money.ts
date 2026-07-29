import type {
  ContributionPurpose,
  LedgerEntry,
  LedgerTransaction,
  MoneyCurrency,
  PointsEvent,
} from '@/types/money';

export const PLATFORM_FEE_BASIS_POINTS = 500;
export const POINTS_DAILY_CAP = 100;
export const POINTS_WEEKLY_CAP = 350;

export const POINTS_BY_ACTION: Record<PointsEvent['actionType'], number> = {
  profile_completed: 50,
  first_league_followed: 20,
  team_followed: 5,
  league_notice_read: 2,
  verified_comment: 3,
  match_attended: 20,
  verified_need_supported: 10,
  athlete_card_shared: 5,
  fan_onboarding_completed: 30,
};

export function feeForSupport(amountMinor: number, basisPoints = PLATFORM_FEE_BASIS_POINTS) {
  assertMoney(amountMinor);
  if (!Number.isInteger(basisPoints) || basisPoints < 0) throw new Error('Fee basis points must be a non-negative integer.');
  return Math.round(amountMinor * basisPoints / 10_000);
}

export function contributionQuote(amountMinor: number, providerFeeMinor?: number) {
  assertMoney(amountMinor);
  if (providerFeeMinor !== undefined) assertMoney(providerFeeMinor);
  const platformFeeMinor = feeForSupport(amountMinor);
  return {
    supportAmountMinor: amountMinor,
    platformFeeMinor,
    providerFeeMinor,
    totalAmountMinor: amountMinor + platformFeeMinor + (providerFeeMinor ?? 0),
    recipientAllocationMinor: amountMinor,
    currency: 'UGX' as const,
  };
}

export function assertMoney(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Money must be stored as a positive integer in minor units.');
  }
}

export function buildContributionSettlement({
  transactionId,
  contributionId,
  supportAmountMinor,
  platformFeeMinor,
  currency = 'UGX',
  createdAt,
}: {
  transactionId: string;
  contributionId: string;
  supportAmountMinor: number;
  platformFeeMinor: number;
  currency?: MoneyCurrency;
  createdAt: string;
}): { transaction: LedgerTransaction; entries: LedgerEntry[] } {
  assertMoney(supportAmountMinor);
  assertMoney(platformFeeMinor);
  const total = supportAmountMinor + platformFeeMinor;
  const transaction: LedgerTransaction = {
    id: transactionId,
    type: 'contribution_settlement',
    relatedEntityId: contributionId,
    currency,
    idempotencyKey: `contribution_settlement:${contributionId}`,
    createdAt,
  };
  const entries: LedgerEntry[] = [
    {
      id: `${transactionId}:psp`,
      transactionId,
      accountCode: 'psp_clearing',
      direction: 'debit',
      amountMinor: total,
      currency,
      relatedEntityId: contributionId,
      createdAt,
    },
    {
      id: `${transactionId}:recipient`,
      transactionId,
      accountCode: 'recipient_payable',
      direction: 'credit',
      amountMinor: supportAmountMinor,
      currency,
      relatedEntityId: contributionId,
      createdAt,
    },
    {
      id: `${transactionId}:fee`,
      transactionId,
      accountCode: 'platform_fee_revenue',
      direction: 'credit',
      amountMinor: platformFeeMinor,
      currency,
      relatedEntityId: contributionId,
      createdAt,
    },
  ];
  assertBalancedEntries(entries);
  return { transaction, entries };
}

export function buildRecipientPayout({
  transactionId,
  allocationId,
  amountMinor,
  currency = 'UGX',
  createdAt,
}: {
  transactionId: string;
  allocationId: string;
  amountMinor: number;
  currency?: MoneyCurrency;
  createdAt: string;
}) {
  return buildBalancedJournal({
    transactionId,
    type: 'recipient_payout',
    relatedEntityId: allocationId,
    currency,
    createdAt,
    entries: [
      ['recipient_payable', 'debit', amountMinor],
      ['payout_clearing', 'credit', amountMinor],
    ],
  });
}

export function buildRefundJournal({
  transactionId,
  contributionId,
  supportAmountMinor,
  platformFeeMinor,
  currency = 'UGX',
  createdAt,
}: {
  transactionId: string;
  contributionId: string;
  supportAmountMinor: number;
  platformFeeMinor: number;
  currency?: MoneyCurrency;
  createdAt: string;
}) {
  const total = supportAmountMinor + platformFeeMinor;
  return buildBalancedJournal({
    transactionId,
    type: 'refund',
    relatedEntityId: contributionId,
    currency,
    createdAt,
    entries: [
      ['recipient_payable', 'debit', supportAmountMinor],
      ['platform_fee_revenue', 'debit', platformFeeMinor],
      ['refund_payable', 'credit', total],
    ],
  });
}

export function buildChargebackJournal({
  transactionId,
  contributionId,
  amountMinor,
  currency = 'UGX',
  createdAt,
}: {
  transactionId: string;
  contributionId: string;
  amountMinor: number;
  currency?: MoneyCurrency;
  createdAt: string;
}) {
  return buildBalancedJournal({
    transactionId,
    type: 'chargeback',
    relatedEntityId: contributionId,
    currency,
    createdAt,
    entries: [
      ['chargeback_reserve', 'debit', amountMinor],
      ['psp_clearing', 'credit', amountMinor],
    ],
  });
}

function buildBalancedJournal({
  transactionId,
  type,
  relatedEntityId,
  currency,
  createdAt,
  entries,
}: {
  transactionId: string;
  type: LedgerTransaction['type'];
  relatedEntityId: string;
  currency: MoneyCurrency;
  createdAt: string;
  entries: Array<[LedgerEntry['accountCode'], LedgerEntry['direction'], number]>;
}) {
  const mapped: LedgerEntry[] = entries.map(([accountCode, direction, amountMinor], index) => {
    assertMoney(amountMinor);
    return {
      id: `${transactionId}:${index + 1}`,
      transactionId,
      accountCode,
      direction,
      amountMinor,
      currency,
      relatedEntityId,
      createdAt,
    };
  });
  assertBalancedEntries(mapped);
  return {
    transaction: {
      id: transactionId,
      type,
      relatedEntityId,
      currency,
      idempotencyKey: `${type}:${relatedEntityId}`,
      createdAt,
    } satisfies LedgerTransaction,
    entries: mapped,
  };
}

export function assertBalancedEntries(entries: Pick<LedgerEntry, 'direction' | 'amountMinor' | 'currency'>[]) {
  const currencies = new Set(entries.map((entry) => entry.currency));
  if (currencies.size !== 1) throw new Error('A ledger transaction cannot mix currencies.');
  const debit = entries.filter((entry) => entry.direction === 'debit').reduce((sum, entry) => sum + entry.amountMinor, 0);
  const credit = entries.filter((entry) => entry.direction === 'credit').reduce((sum, entry) => sum + entry.amountMinor, 0);
  if (debit !== credit) throw new Error(`Unbalanced ledger transaction: debit ${debit}, credit ${credit}.`);
}

export function pointsForAction(action: PointsEvent['actionType'], amountMinor?: number) {
  void amountMinor;
  return POINTS_BY_ACTION[action];
}

export function pointsIdempotencyKey(
  userId: string,
  action: PointsEvent['actionType'],
  relatedEntityId?: string,
) {
  const onceOnly = [
    'profile_completed',
    'first_league_followed',
    'fan_onboarding_completed',
  ].includes(action);
  return `${action}:${userId}:${onceOnly ? 'once' : relatedEntityId ?? 'once'}`;
}

export function cappedPointsAward(
  action: PointsEvent['actionType'],
  dailyTotal: number,
  weeklyTotal: number,
) {
  return Math.max(0, Math.min(
    pointsForAction(action),
    POINTS_DAILY_CAP - dailyTotal,
    POINTS_WEEKLY_CAP - weeklyTotal,
  ));
}

/** Uganda has no DST; accounting periods follow Africa/Kampala (UTC+03:00). */
export function kampalaPeriod(date = new Date()) {
  const shifted = new Date(date.getTime() + 3 * 60 * 60_000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const weekday = shifted.getUTCDay() || 7;
  const dayStart = new Date(Date.UTC(year, month, day, -3, 0, 0, 0));
  const weekStart = new Date(Date.UTC(year, month, day - (weekday - 1), -3, 0, 0, 0));
  const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const isoDate = new Date(Date.UTC(year, month, day));
  isoDate.setUTCDate(isoDate.getUTCDate() + 4 - (isoDate.getUTCDay() || 7));
  const isoYear = isoDate.getUTCFullYear();
  const isoWeek = Math.ceil(((isoDate.getTime() - Date.UTC(isoYear, 0, 1)) / 86_400_000 + 1) / 7);
  return { dayStart, weekStart, dateKey, weekKey: `${isoYear}-W${String(isoWeek).padStart(2, '0')}` };
}

export function requiresEnhancedReview(amountMinor: number) {
  assertMoney(amountMinor);
  if (amountMinor > 5_000_000) return 'high_value';
  if (amountMinor > 1_000_000) return 'enhanced';
  if (amountMinor > 100_000) return 'standard';
  return 'micro';
}

export function isCashChallengePurpose(purpose: ContributionPurpose) {
  return ![
    'direct_athlete_support',
    'verified_support_need',
    'team_development',
    'league_development',
    'sponsor_grant',
  ].includes(purpose);
}
