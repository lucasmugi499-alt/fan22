import { clientIpFrom, enforceRateLimit } from '@/server/api/security';

/**
 * Rate limiting for the mobile-money callback endpoints.
 *
 * ## What this is not protecting against
 *
 * Not settlement fraud. The callback design is already right: a provider notification is
 * treated as a TRIGGER, never as proof, and `verifyCallback` re-verifies by querying the
 * provider for the status of the intent's own stored `providerRequestReference` before
 * anything reaches the ledger. A forged callback settles nothing, and no amount of them
 * moves money.
 *
 * ## What it is protecting against
 *
 * Cost, and your provider integration's standing with the provider.
 *
 * These endpoints are unauthenticated by nature — the provider posts to them from its own
 * infrastructure and there is no shared credential to check. Each request carrying a
 * valid-looking `externalId` costs one Firestore read plus **one outbound HTTP call to MTN**.
 * Anyone who learns a single intent id can therefore force unbounded outbound calls to the
 * provider, and the realistic damage is not a bill but a throttled or suspended integration:
 * the payment provider rate-limits GoalPlace, and real contributions start failing.
 *
 * `/api/search` and `/api/result-submissions/{id}/events` already limit by IP. These are the
 * two public routes that did not, and they are the two that make an outbound call.
 *
 * ## Two buckets, deliberately
 *
 * By IP, which stops a single source hammering the endpoint. And by `externalId`, which is
 * the one that actually caps outbound provider calls — a distributed set of sources all
 * replaying the same intent id would pass an IP limit individually while producing exactly
 * the fan-out this exists to prevent.
 */

/**
 * Generous, because a provider legitimately retries. MTN redelivers on non-2xx and a
 * matchday burst of contributions is real traffic. This is an abuse ceiling, not a shaping
 * policy — the per-intent limit below is the one doing the meaningful work.
 */
const CALLBACK_IP_LIMIT = 120;

/**
 * Tight, because this is the number that maps one-to-one onto outbound provider calls.
 *
 * A genuine payment resolves in a handful of notifications: pending, then settled or failed.
 * Six per minute per intent absorbs provider retry behaviour with room to spare, and a
 * seventh in the same minute for the same intent is not a payment progressing.
 */
const CALLBACK_INTENT_LIMIT = 6;

const WINDOW_SECONDS = 60;

/**
 * The intent id, read without consuming the request body.
 *
 * `request.clone()` matters: `verifyCallback` calls `request.json()` itself, and a body can
 * only be read once. Peeking at the original would leave the provider implementation reading
 * an already-consumed stream, which surfaces as every legitimate callback failing.
 *
 * A body this cannot parse yields `undefined` and only the IP limit applies. That is correct
 * — an unparseable callback never reaches the outbound status query, so it is not the request
 * shape the per-intent limit exists to bound.
 */
async function intentIdFrom(request: Request): Promise<string | undefined> {
  try {
    const payload = await request.clone().json() as Record<string, unknown> | null;
    const candidate = payload?.externalId ?? payload?.external_id ?? payload?.transaction_id;
    return typeof candidate === 'string' && candidate.length <= 200 ? candidate : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Returns a 429 response to send back, or `null` to proceed.
 *
 * Callers must return the response rather than continue: a rate-limited callback that still
 * ran the status query would defeat the purpose entirely.
 */
export async function throttlePaymentCallback(
  request: Request,
  provider: 'mtn_momo' | 'airtel_money',
): Promise<Response | null> {
  const byIp = await enforceRateLimit({
    bucket: `payment_callback_ip:${provider}`,
    identity: [clientIpFrom(request)],
    limit: CALLBACK_IP_LIMIT,
    windowSeconds: WINDOW_SECONDS,
  });
  if (byIp) return byIp;

  const intentId = await intentIdFrom(request);
  if (!intentId) return null;

  return enforceRateLimit({
    bucket: `payment_callback_intent:${provider}`,
    identity: [intentId],
    limit: CALLBACK_INTENT_LIMIT,
    windowSeconds: WINDOW_SECONDS,
  });
}
