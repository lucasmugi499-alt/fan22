import { AirtelMoneyProvider, enabledPaymentProviders, PaymentProviderConfigurationError } from '@/server/payments/providers';
import { processVerifiedPaymentEvent } from '@/server/payments/settlement';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!enabledPaymentProviders().has('airtel_money')) return Response.json({ error: 'Airtel Money is not configured.' }, { status: 404 });
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
