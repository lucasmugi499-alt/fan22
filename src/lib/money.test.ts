import { describe, expect, it } from 'vitest';
import {
  assertBalancedEntries,
  buildContributionSettlement,
  cappedPointsAward,
  contributionQuote,
  pointsForAction,
  pointsIdempotencyKey,
} from './money';

describe('money engine', () => {
  it('adds the disclosed service fee without reducing the recipient allocation', () => {
    expect(contributionQuote(100_000)).toEqual({
      supportAmountMinor: 100_000,
      platformFeeMinor: 5_000,
      providerFeeMinor: undefined,
      totalAmountMinor: 105_000,
      recipientAllocationMinor: 100_000,
      currency: 'UGX',
    });
  });

  it('builds a balanced settlement journal', () => {
    const { entries } = buildContributionSettlement({
      transactionId: 'ledger_1',
      contributionId: 'contribution_1',
      supportAmountMinor: 100_000,
      platformFeeMinor: 5_000,
      createdAt: '2026-07-26T00:00:00.000Z',
    });
    expect(() => assertBalancedEntries(entries)).not.toThrow();
  });

  it('rejects an unbalanced journal', () => {
    expect(() => assertBalancedEntries([
      { direction: 'debit', amountMinor: 100, currency: 'UGX' },
      { direction: 'credit', amountMinor: 99, currency: 'UGX' },
    ])).toThrow(/Unbalanced/);
  });

  it('awards flat participation points regardless of contribution amount', () => {
    expect(pointsForAction('verified_need_supported', 5_000)).toBe(10);
    expect(pointsForAction('verified_need_supported', 500_000)).toBe(10);
  });

  it('caps points and keeps once-only actions globally idempotent', () => {
    expect(cappedPointsAward('profile_completed', 90, 200)).toBe(10);
    expect(cappedPointsAward('team_followed', 100, 200)).toBe(0);
    expect(pointsIdempotencyKey('fan_1', 'first_league_followed', 'league_a'))
      .toBe(pointsIdempotencyKey('fan_1', 'first_league_followed', 'league_b'));
    expect(pointsIdempotencyKey('fan_1', 'team_followed', 'team_a'))
      .not.toBe(pointsIdempotencyKey('fan_1', 'team_followed', 'team_b'));
  });
});
