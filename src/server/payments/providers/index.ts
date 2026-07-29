import { AirtelMoneyProvider } from './AirtelMoneyProvider';
import { MtnMomoProvider } from './MtnMomoProvider';
import { PaymentProviderConfigurationError, type PaymentProvider, type PaymentProviderName } from './PaymentProvider';
import { SandboxPaymentProvider } from './SandboxPaymentProvider';

export * from './PaymentProvider';
export { AirtelMoneyProvider } from './AirtelMoneyProvider';
export { MtnMomoProvider } from './MtnMomoProvider';
export { SandboxPaymentProvider } from './SandboxPaymentProvider';

export function paymentProviderFromEnvironment(name = process.env.GOALPLACE_PAYMENT_PROVIDER): PaymentProvider {
  switch (name) {
    case 'sandbox': return new SandboxPaymentProvider();
    case 'airtel_money': return new AirtelMoneyProvider();
    case 'mtn_momo': return new MtnMomoProvider();
    default: throw new PaymentProviderConfigurationError('A sandbox provider must be explicitly selected before payments can be initiated.');
  }
}

export function providerCallbackPath(name: PaymentProviderName) {
  return `/api/payments/webhooks/${name === 'airtel_money' ? 'airtel' : name === 'mtn_momo' ? 'mtn' : 'provider'}`;
}
