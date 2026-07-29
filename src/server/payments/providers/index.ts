import { AirtelMoneyProvider } from './AirtelMoneyProvider';
import { MtnMomoProvider } from './MtnMomoProvider';
import { PaymentProviderConfigurationError, type PaymentProvider, type PaymentProviderName } from './PaymentProvider';
import { SandboxPaymentProvider } from './SandboxPaymentProvider';
import type { MobileMoneyProvider } from '@/types/money';

export * from './PaymentProvider';
export { AirtelMoneyProvider } from './AirtelMoneyProvider';
export { MtnMomoProvider } from './MtnMomoProvider';
export { SandboxPaymentProvider } from './SandboxPaymentProvider';

export function enabledPaymentProviders(env = process.env.GOALPLACE_ENABLED_PAYMENT_PROVIDERS): Set<PaymentProviderName> {
  return new Set(
    (env ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value): value is PaymentProviderName =>
        ['sandbox', 'airtel_money', 'mtn_momo'].includes(value),
      ),
  );
}

export function paymentProviderFromEnvironment(name?: PaymentProviderName): PaymentProvider {
  if (!name) {
    throw new PaymentProviderConfigurationError('Select an enabled payment provider.');
  }
  if (!enabledPaymentProviders().has(name)) {
    throw new PaymentProviderConfigurationError(`${name} is not enabled for this deployment.`);
  }
  switch (name) {
    case 'sandbox': return new SandboxPaymentProvider();
    case 'airtel_money': return new AirtelMoneyProvider();
    case 'mtn_momo': return new MtnMomoProvider();
    default: throw new PaymentProviderConfigurationError('A sandbox provider must be explicitly selected before payments can be initiated.');
  }
}

export function requireEnabledMobileMoneyProvider(name: MobileMoneyProvider): PaymentProvider {
  return paymentProviderFromEnvironment(name);
}

export function paymentCallbackBaseUrl(value = process.env.GOALPLACE_PAYMENT_CALLBACK_BASE_URL) {
  if (!value) throw new PaymentProviderConfigurationError('GOALPLACE_PAYMENT_CALLBACK_BASE_URL is required.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PaymentProviderConfigurationError('GOALPLACE_PAYMENT_CALLBACK_BASE_URL must be a valid URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new PaymentProviderConfigurationError('The payment callback base URL must be a clean HTTPS origin.');
  }
  return url.origin;
}

export function providerCallbackUrl(name: PaymentProviderName) {
  return `${paymentCallbackBaseUrl()}${providerCallbackPath(name)}`;
}

export function providerCallbackPath(name: PaymentProviderName) {
  return `/api/payments/webhooks/${name === 'airtel_money' ? 'airtel' : name === 'mtn_momo' ? 'mtn' : 'provider'}`;
}
