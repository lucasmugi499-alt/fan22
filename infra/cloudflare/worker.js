/**
 * GoalPlace256 edge gateway — UNATTACHED.
 *
 * Routes one public hostname to exactly one origin at a time. Switching environments is
 * a change to ACTIVE_ORIGIN, not a DNS change, which is what makes activation instant
 * and reversible.
 *
 * Not attached to goalplace256.com. Deploying this publishes to *.workers.dev only,
 * because wrangler.toml declares no route.
 */

const gateway = {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    const origin = new URL(env.ACTIVE_ORIGIN);

    const target = new URL(incoming.pathname + incoming.search, origin);
    const forwarded = new Request(target, request);

    // Preserve the public hostname the visitor used, so the origin can log and build
    // absolute URLs against it rather than against its own internal address.
    forwarded.headers.set('x-forwarded-host', incoming.host);
    forwarded.headers.set('x-goalplace-gateway-environment', env.ACTIVE_ENVIRONMENT ?? 'unknown');

    // Only attached once the secret exists. While unset the origin is reachable
    // directly and GOALPLACE_REQUIRE_GATEWAY_SECRET is false, so sending nothing is
    // correct; sending an empty value would be worse than sending none.
    if (env.EDGE_ORIGIN_SECRET) {
      forwarded.headers.set('x-goalplace-origin-secret', env.EDGE_ORIGIN_SECRET);
    }

    // A client must never be able to forge the gateway's own header.
    forwarded.headers.delete('x-goalplace-staff-preview-secret');

    const response = await fetch(forwarded);

    // Surfaced so a probe can confirm which environment answered without trusting the
    // gateway's own configuration file.
    const headers = new Headers(response.headers);
    headers.set('x-goalplace-served-environment', env.ACTIVE_ENVIRONMENT ?? 'unknown');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

export default gateway;
