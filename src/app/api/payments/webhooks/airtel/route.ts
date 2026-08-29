import { AirtelMoneyProvider, enabledPaymentProviders, PaymentProviderConfigurationError } from '@/server/payments/providers';
import { processVerifiedPaymentEvent } from '@/server/payments/settlement';
import { throttlePaymentCallback } from '@/server/payments/webhookThrottle';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!enabledPaymentProviders().has('airtel_money')) return Response.json({ error: 'Airtel Money is not configured.' }, { status: 404 });
  // Applied here too, even though the Airtel contract is unimplemented and fails closed
  // today. When that contract lands it will make the same outbound status query MTN does,
  // and a throttle added at the same time as the caller is one that cannot be forgotten.
  const throttled = await throttlePaymentCallback(request, 'airtel_money');
  if (throttled) return throttled;
  try {
    const event = await new AirtelMoneyProvider().verifyCallback(request);
    if (!event) return Response.json({ error: 'Invalid Airtel Money callback.' }, { status: 401 });
    const result = await processVerifiedPaymentEvent(event);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof PaymentProviderConfigurationError) return Response.json({ error: error.message }, { status: 503 });
    console.error('Airtel Money callback failed', error);
    return Response.json({ error: 'Airtel Money callback processing failed.' }, { status: 500 });
  }
}
