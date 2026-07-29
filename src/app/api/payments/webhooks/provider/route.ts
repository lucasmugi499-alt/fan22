import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { processVerifiedPaymentEvent } from '@/server/payments/settlement';

export const runtime = 'nodejs';

const eventSchema = z.object({
  eventId: z.string().min(1),
  paymentIntentId: z.string().min(1),
  status: z.enum(['settled', 'failed', 'held_for_review']),
  amountMinor: z.number().int().positive(),
  currency: z.literal('UGX'),
  occurredAt: z.string().datetime(),
  providerReference: z.string().min(1),
});

function validSignature(rawBody: string, supplied: string | null) {
  const secret = process.env.GOALPLACE_PAYMENT_WEBHOOK_SECRET;
  if (!secret || !supplied) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

/** Internal sandbox callback only. Airtel and MTN use their dedicated adapter routes. */
export async function POST(request: Request) {
  if (process.env.GOALPLACE_PAYMENT_PROVIDER !== 'sandbox') {
    return Response.json({ error: 'The generic callback is available only for the sandbox provider.' }, { status: 404 });
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > 64 * 1024) return Response.json({ error: 'Webhook payload is too large.' }, { status: 413 });
  if (!validSignature(rawBody, request.headers.get('x-goalplace-signature'))) {
    return Response.json({ error: 'Invalid sandbox webhook signature.' }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid sandbox webhook JSON.' }, { status: 400 });
  }
  const parsed = eventSchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: 'Invalid sandbox webhook event.' }, { status: 400 });
  const event = parsed.data;
  if (Math.abs(Date.now() - new Date(event.occurredAt).getTime()) > 5 * 60 * 1000) {
    return Response.json({ error: 'Webhook timestamp is outside the accepted window.' }, { status: 400 });
  }
  try {
    const result = await processVerifiedPaymentEvent({ ...event, provider: 'sandbox', verifiedByStatusQuery: true });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error('Sandbox payment webhook processing failed', error);
    return Response.json({ error: 'Sandbox webhook processing failed.' }, { status: 500 });
  }
}
