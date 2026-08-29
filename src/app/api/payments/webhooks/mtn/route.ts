import { enabledPaymentProviders, MtnMomoProvider, PaymentProviderConfigurationError } from '@/server/payments/providers';
import { processVerifiedPaymentEvent } from '@/server/payments/settlement';
import { throttlePaymentCallback } from '@/server/payments/webhookThrottle';

export const runtime = 'nodejs';

async function handle(request: Request) {
  if (!enabledPaymentProviders().has('mtn_momo')) return Response.json({ error: 'MTN MoMo is not configured.' }, { status: 404 });
  // Before verifyCallback, because verifyCallback is what makes the outbound MTN status
  // query. Throttling after it would rate-limit the response and not the cost.
  const throttled = await throttlePaymentCallback(request, 'mtn_momo');
  if (throttled) return throttled;
  try {
    const event = await new MtnMomoProvider().verifyCallback(request);
    if (!event) return Response.json({ error: 'Invalid MTN MoMo callback.' }, { status: 401 });
    const result = await processVerifiedPaymentEvent(event);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof PaymentProviderConfigurationError) return Response.json({ error: error.message }, { status: 503 });
    console.error('MTN MoMo callback failed', error);
    return Response.json({ error: 'MTN MoMo callback processing failed.' }, { status: 500 });
  }
}

export const POST = handle;
export const PUT = handle;
