import { describe, expect, it } from 'vitest';
import type { Allocation } from '@/types/money';
import { projectAthleteBackings } from './backings';

function allocation(overrides: Partial<Allocation> = {}): Allocation {
  return {
    id: 'alloc_1',
    contributionId: 'contribution_1',
    recipientType: 'athlete',
    recipientId: 'athlete_1',
    amountMinor: 10_000,
    currency: 'UGX',
    status: 'eligible_for_payout',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('backings is a projection, never a balance', () => {
  it('reports what supporters gave and what has cleared as two different numbers', () => {
    const projection = projectAthleteBackings({
      allocations: [
        allocation({ id: 'a1', status: 'eligible_for_payout', amountMinor: 10_000 }),
        allocation({ id: 'a2', contributionId: 'contribution_2', status: 'pending_review', amountMinor: 5_000 }),
      ],
      hasVerifiedPayee: true,
    });

    expect(projection.backingRecordedMinor).toBe(15_000);
    expect(projection.availableForPayoutMinor).toBe(10_000);
  });

  it('exposes no field named balance', () => {
    // The money engine has no stored-value wallet. A balance field would be a second source
    // of truth about money that could disagree with the ledger.
    const projection = projectAthleteBackings({ allocations: [allocation()], hasVerifiedPayee: true });

    expect(Object.keys(projection)).not.toContain('balance');
  });

  it('makes nothing available until a payee is verified', () => {
    const projection = projectAthleteBackings({ allocations: [allocation()], hasVerifiedPayee: false });

    expect(projection.backingRecordedMinor).toBe(10_000);
    expect(projection.availableForPayoutMinor).toBe(0);
    expect(projection.payoutStatus).toBe('awaiting_verified_payee');
  });

  it('excludes a reversed allocation rather than netting it off', () => {
    // A refund is not negative backing; it is backing that did not happen. Showing it as a
    // deduction would tell an athlete their supporters took money back.
    const projection = projectAthleteBackings({
      allocations: [allocation({ id: 'a1' }), allocation({ id: 'a2', status: 'reversed', amountMinor: 4_000 })],
      hasVerifiedPayee: true,
    });

    expect(projection.backingRecordedMinor).toBe(10_000);
  });

  it('keeps money already paid out of the available figure', () => {
    const projection = projectAthleteBackings({
      allocations: [allocation({ id: 'a1', status: 'paid', amountMinor: 8_000 })],
      hasVerifiedPayee: true,
    });

    expect(projection.paidOutMinor).toBe(8_000);
    expect(projection.availableForPayoutMinor).toBe(0);
    // Still counted as backing: the supporter did give it.
    expect(projection.backingRecordedMinor).toBe(8_000);
  });

  it('counts distinct supporters rather than allocations', () => {
    const projection = projectAthleteBackings({
      allocations: [
        allocation({ id: 'a1', contributionId: 'c1' }),
        allocation({ id: 'a2', contributionId: 'c1' }),
        allocation({ id: 'a3', contributionId: 'c2' }),
      ],
      hasVerifiedPayee: true,
    });

    expect(projection.totalSupporters).toBe(2);
  });

  it('says nothing yet rather than awaiting a payee when there is no money', () => {
    const projection = projectAthleteBackings({ allocations: [], hasVerifiedPayee: false });

    expect(projection.payoutStatus).toBe('nothing_yet');
    expect(projection.backingRecordedMinor).toBe(0);
  });
});
