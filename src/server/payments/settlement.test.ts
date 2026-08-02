import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminDb } from '@/lib/firebase/admin';
import { processVerifiedPaymentEvent } from './settlement';

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(),
    runTransaction: vi.fn(),
  },
}));

function ref(collectionName: string, id: string) {
  return { collectionName, id };
}

function snapshot(data: Record<string, unknown> | undefined) {
  return {
    exists: Boolean(data),
    data: () => data,
  };
}

describe('payment settlement accounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('holds provider-confirmed money when the support need disappeared before settlement', async () => {
    const created: Array<{ collectionName: string; id: string; data: Record<string, unknown> }> = [];
    const updated: Array<{ collectionName: string; id: string; data: Record<string, unknown> }> = [];
    vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => ({
      doc: vi.fn((id = `${collectionName}_generated`) => ref(collectionName, id)),
      where: vi.fn(() => ({
        where: vi.fn(() => ({
          where: vi.fn(() => ({ get: vi.fn(async () => ({ docs: [] })) })),
        })),
      })),
    }) as never);
    const transaction = {
      get: vi.fn(async (documentRef: { collectionName: string; id: string }) => {
        if (documentRef.collectionName === 'paymentWebhookEvents') return snapshot(undefined);
        if (documentRef.collectionName === 'paymentIntents') {
          return snapshot({
            id: 'payment_1',
            supporterUserId: 'fan_1',
            provider: 'sandbox',
            supportAmountMinor: 100_000,
            platformFeeMinor: 5_000,
            totalAmountMinor: 105_000,
            currency: 'UGX',
            status: 'payment_pending',
          });
        }
        if (documentRef.collectionName === 'contributions') {
          return snapshot({
            id: 'payment_1',
            recipientType: 'athlete',
            recipientId: 'athlete_1',
            supportNeedId: 'need_missing',
            campaignId: null,
          });
        }
        if (documentRef.collectionName === 'supportReservations') {
          return snapshot({
            id: 'payment_1',
            status: 'active',
          });
        }
        if (documentRef.collectionName === 'supportNeeds') return snapshot(undefined);
        return snapshot(undefined);
      }),
      create: vi.fn((documentRef: { collectionName: string; id: string }, data: Record<string, unknown>) => {
        created.push({ ...documentRef, data });
      }),
      update: vi.fn((documentRef: { collectionName: string; id: string }, data: Record<string, unknown>) => {
        updated.push({ ...documentRef, data });
      }),
    };
    vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction) as never);

    const result = await processVerifiedPaymentEvent({
      provider: 'sandbox',
      eventId: 'event_1',
      paymentIntentId: 'payment_1',
      status: 'settled',
      amountMinor: 105_000,
      currency: 'UGX',
      occurredAt: '2026-07-30T12:00:00.000Z',
      providerRequestReference: 'provider_request_1',
      providerFinancialReference: 'provider_financial_1',
      verifiedByStatusQuery: true,
    });

    expect(result).toEqual({ outcome: 'applied', status: 'settled' });
    const ledgerEntries = created
      .filter((item) => item.collectionName === 'ledgerEntries')
      .map((item) => item.data);
    expect(ledgerEntries).toContainEqual(expect.objectContaining({
      accountCode: 'refund_payable',
      direction: 'credit',
      amountMinor: 105_000,
    }));
    expect(ledgerEntries.some((entry) => entry.accountCode === 'recipient_payable')).toBe(false);
    expect(ledgerEntries.some((entry) => entry.accountCode === 'platform_fee_revenue')).toBe(false);
    expect(updated).toContainEqual(expect.objectContaining({
      collectionName: 'contributions',
      id: 'payment_1',
      data: expect.objectContaining({ status: 'held_for_review' }),
    }));
    expect(created).toContainEqual(expect.objectContaining({
      collectionName: 'refunds',
      id: 'excess_payment_1',
      data: expect.objectContaining({ amountMinor: 105_000 }),
    }));
  });
});
