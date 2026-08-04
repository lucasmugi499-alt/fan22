import { publicEnvironment } from '@/lib/environment';

export const runtime = 'nodejs';

/**
 * Environment identity, served by the origin that is actually answering.
 *
 * `EnvironmentBoundary` previously compared only build-time `NEXT_PUBLIC_*` constants,
 * which are baked into the bundle. That detects a redeploy, but not a gateway swapping
 * to a different origin while a browser still holds a cached bundle — precisely the case
 * the one-public-URL model creates. Asking the server who it is closes that gap, because
 * the answer comes from the runtime serving the request rather than from the artefact
 * the browser happens to be running.
 *
 * Public and unauthenticated: it exposes only what a client already needs in order to
 * decide whether its local state belongs to this environment.
 */
export function GET(request: Request) {
  const identity = publicEnvironment();

  return Response.json({
    ...identity,
    // The origin actually serving this request, so a client can tell it has been moved
    // even when the configured public URL has not changed.
    servedBy: new URL(request.url).host,
    publicBaseUrl: process.env.GOALPLACE_APP_BASE_URL ?? null,
    // Reported so the boundary and an operator can see enforcement state without
    // guessing. Gateway-only protection is deliberately off for the direct demo origin.
    gatewayRequired: process.env.GOALPLACE_REQUIRE_GATEWAY_SECRET === 'true',
  }, {
    headers: {
      // Never cached: a stale identity is worse than none, since the entire purpose is
      // to notice that the answer changed.
      'cache-control': 'no-store',
    },
  });
}
