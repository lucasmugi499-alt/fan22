import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  enabledPaymentProviders,
  paymentCallbackBaseUrl,
  paymentProviderFromEnvironment,
  PaymentProviderConfigurationError,
} from './index';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('payment provider environment boundary', () => {
  it('enables Airtel and MTN simultaneously', () => {
    vi.stubEnv('GOALPLACE_ENABLED_PAYMENT_PROVIDERS', 'airtel_money,mtn_momo');
    vi.stubEnv('GOALPLACE_MTN_MOMO_BASE_URL', 'https://sandbox.momodeveloper.mtn.com');
    vi.stubEnv('GOALPLACE_MTN_MOMO_TARGET_ENVIRONMENT', 'sandbox');
    expect([...enabledPaymentProviders()]).toEqual(['airtel_money', 'mtn_momo']);
    expect(paymentProviderFromEnvironment('airtel_money').name).toBe('airtel_money');
    expect(paymentProviderFromEnvironment('mtn_momo').name).toBe('mtn_momo');
  });

  it('rejects a provider outside the deployment allowlist', () => {
    vi.stubEnv('GOALPLACE_ENABLED_PAYMENT_PROVIDERS', 'mtn_momo');
    expect(() => paymentProviderFromEnvironment('airtel_money')).toThrow(PaymentProviderConfigurationError);
  });

  it('accepts only a clean HTTPS callback origin', () => {
    expect(() => paymentCallbackBaseUrl('http://staging.example.com')).toThrow(/HTTPS/);
    expect(() => paymentCallbackBaseUrl('https://user:pass@staging.example.com')).toThrow(/HTTPS/);
    expect(paymentCallbackBaseUrl('https://staging.example.com/payments/path')).toBe('https://staging.example.com');
  });
});
