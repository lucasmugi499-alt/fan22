# Cloudflare gateway — UNATTACHED

Configuration for the future one-public-URL gateway. **Nothing here is attached to
`goalplace256.com`, and no DNS record points at it.**

## Current state

| Item | State |
| --- | --- |
| Public Demo URL | Firebase App Hosting default domain |
| Custom domain | Not purchased / not attached |
| DNS | Unchanged |
| Worker | Deployable to `*.workers.dev` for testing only |
| Origin gateway enforcement | **Disabled** (`GOALPLACE_REQUIRE_GATEWAY_SECRET=false`) |

The demo origin is served directly and must stay reachable directly. Do not enable
`GOALPLACE_REQUIRE_GATEWAY_SECRET` on it — the app-level proxy (`src/proxy.ts`) would
then reject every request that did not arrive through a gateway that is not yet in
front of it, taking the demo offline.

## What the Worker does

Routes one public hostname to exactly one origin at a time, and attaches the origin
secret the app-level proxy expects once enforcement is switched on.

Switching environments is a change to `ACTIVE_ORIGIN`, not a DNS change — which is why
this is the piece that makes `environment:prepare:*` become a real activation.

## Testing without a domain

```bash
cd infra/cloudflare
npx wrangler deploy --name goalplace256-gateway-test
npm run environment:probe -- --url https://goalplace256-gateway-test.<subdomain>.workers.dev --expect-environment demo
```

The probe compares what the origin reports against what you expected, so a Worker
pointing at the wrong origin fails loudly rather than looking fine.

## Before attaching the custom domain

1. Purchase and delegate `goalplace256.com`.
2. Set `EDGE_ORIGIN_SECRET` as a Worker secret, matching `GOALPLACE_EDGE_ORIGIN_SECRET`
   on the origin.
3. Enable `GOALPLACE_REQUIRE_GATEWAY_SECRET=true` on the origin **only after** the
   Worker is confirmed to be attaching the header — verify with a direct-origin request
   that must then be refused.
4. Point DNS at the Worker route.
5. Re-probe through the public hostname.

Steps 3 and 4 are the ones that can take the site down; do them in that order, and
confirm each before the next.
