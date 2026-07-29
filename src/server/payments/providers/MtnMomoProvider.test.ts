import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MtnMomoProvider, mtnReferenceFor, resetMtnTokenCacheForTests } from './MtnMomoProvider';

const ENV = {
  GOALPLACE_MTN_MOMO_BASE_URL: 'https://sandbox.momodeveloper.mtn.com',
  GOALPLACE_MTN_MOMO_TARGET_ENVIRONMENT: 'sandbox',
  GOALPLACE_MTN_MOMO_CURRENCY: 'EUR',
  GOALPLACE_MTN_MOMO_COLLECTION_API_USER: 'api-user',
  GOALPLACE_MTN_MOMO_COLLECTION_API_KEY: 'api-key',
  GOALPLACE_MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY: 'subscription-key',
};

beforeEach(() => {
  for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
  resetMtnTokenCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('MtnMomoProvider', () => {
  it('derives a stable UUID reference from the complete idempotency key', () => {
    expect(mtnReferenceFor('checkout-session-a')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(mtnReferenceFor('checkout-session-a')).toBe(mtnReferenceFor('checkout-session-a'));
    expect(mtnReferenceFor('checkout-session-a')).not.toBe(mtnReferenceFor('checkout-session-b'));
  });
  it('requests and safely caches collection tokens with POST and Basic auth', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new MtnMomoProvider();
    const input = {
      paymentIntentId: 'pi_123',
      amountMinor: 10_500,
      currency: 'EUR' as const,
      customerPhone: '256770000000',
      callbackUrl: 'https://staging.example.com/api/payments/webhooks/mtn',
      idempotencyKey: 'checkout-123456',
      description: 'Support',
    };

    await provider.createCollection(input);
    await provider.createCollection({ ...input, paymentIntentId: 'pi_456' });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ENV.GOALPLACE_MTN_MOMO_BASE_URL}/collection/token/`);
    expect(options.method).toBe('POST');
    expect(options.headers).toMatchObject({
      authorization: `Basic ${Buffer.from('api-user:api-key').toString('base64')}`,
      'Ocp-Apim-Subscription-Key': 'subscription-key',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps request and financial references separate during status lookup', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'SUCCESSFUL',
        amount: '10500',
        currency: 'EUR',
        financialTransactionId: 'financial-789',
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const operation = await new MtnMomoProvider().getCollectionStatus('request-123');

    expect(operation.providerRequestReference).toBe('request-123');
    expect(operation.providerFinancialReference).toBe('financial-789');
    expect(operation.status).toBe('settled');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${ENV.GOALPLACE_MTN_MOMO_BASE_URL}/collection/v1_0/requesttopay/request-123`,
    );
  });

  it('rejects malformed token responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'denied' }), { status: 401 }),
    ));
    await expect(new MtnMomoProvider().getCollectionStatus('request-123'))
      .rejects.toThrow('MTN MoMo token request failed');
  });
});
