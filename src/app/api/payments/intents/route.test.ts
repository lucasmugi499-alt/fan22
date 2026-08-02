import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { paymentProviderFromEnvironment } from '@/server/payments/providers';
import { POST } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
  },
  adminDb: {
    collection: vi.fn(),
  },
}));

vi.mock('@/server/payments/providers', () => ({
  PaymentProviderConfigurationError: class PaymentProviderConfigurationError extends Error {},
  paymentProviderFromEnvironment: vi.fn(),
  providerCallbackUrl: vi.fn(),
}));

vi.mock('@/server/payments/providerAttempts', () => ({
  recordProviderAttempt: vi.fn(),
}));

function request(body: string, token = 'token') {
  return new Request('https://goalplace256.test/api/payments/intents', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body,
  });
}

function installUserProfile(profile: Record<string, unknown>) {
  vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => ({
    doc: (id: string) => ({
      id,
      get: vi.fn(async () => ({
        id,
        exists: collectionName === 'users',
        data: () => collectionName === 'users' ? profile : undefined,
      })),
    }),
  }) as never);
}

describe('payment intent route hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOALPLACE_PAYMENTS_MODE = 'sandbox';
  });

  it('keeps payments disabled outside the sandbox gate before auth or body parsing', async () => {
    process.env.GOALPLACE_PAYMENTS_MODE = 'disabled';

    const response = await POST(request('{', ''));

    expect(response.status).toBe(503);
    expect(adminAuth.verifyIdToken).not.toHaveBeenCalled();
    expect(adminDb.collection).not.toHaveBeenCalled();
    expect(paymentProviderFromEnvironment).not.toHaveBeenCalled();
  });

  it('requires authentication before parsing payment requests', async () => {
    const response = await POST(request('{', ''));

    expect(response.status).toBe(401);
    expect(adminAuth.verifyIdToken).not.toHaveBeenCalled();
    expect(adminDb.collection).not.toHaveBeenCalled();
    expect(paymentProviderFromEnvironment).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON before provider or Firestore work', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'fan_1', role: 'fan', email_verified: true });

    const response = await POST(request('{'));

    expect(response.status).toBe(400);
    expect(adminDb.collection).not.toHaveBeenCalled();
    expect(paymentProviderFromEnvironment).not.toHaveBeenCalled();
  });

  it('rejects oversized payment bodies before provider or Firestore work', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'fan_1', role: 'fan', email_verified: true });

    const response = await POST(request(JSON.stringify({
      supporterUserId: 'fan_1',
      purpose: 'direct_athlete_support',
      recipientType: 'athlete',
      recipientId: 'athlete_1',
      supportAmountMinor: 20_000,
      provider: 'airtel_money',
      idempotencyKey: 'checkout_123456789',
      message: 'x'.repeat(13 * 1024),
    })));

    expect(response.status).toBe(413);
    expect(adminDb.collection).not.toHaveBeenCalled();
    expect(paymentProviderFromEnvironment).not.toHaveBeenCalled();
  });

  it('rejects operator accounts before provider work for fan support contributions', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
      uid: 'operator_1',
      role: 'team_admin',
      accountClass: 'organization_operator',
      email_verified: true,
    });
    installUserProfile({ role: 'team_admin', accountClass: 'organization_operator' });

    const response = await POST(request(JSON.stringify({
      supporterUserId: 'operator_1',
      purpose: 'direct_athlete_support',
      recipientType: 'athlete',
      recipientId: 'athlete_1',
      supportAmountMinor: 20_000,
      provider: 'airtel_money',
      idempotencyKey: 'checkout_123456789',
    })));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Support contributions are available to Fan accounts only.',
    });
    expect(paymentProviderFromEnvironment).not.toHaveBeenCalled();
  });
});
