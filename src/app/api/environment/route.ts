import { publicEnvironment } from '@/lib/environment';
import { activationFromEnvironment } from '@/server/finalizerActivation';
import { currentTeamAuthorityStage } from '@/lib/auth/teamAuthorityStage';
import { schedulerAuthDiagnostics } from '@/server/api/security';

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
    // The PUBLIC host this request arrived on, so a client can tell it has been moved
    // even when the configured public URL has not changed.
    //
    // Not `new URL(request.url).host`: inside App Hosting that is the internal container
    // address (0.0.0.0:8080), identical for every backend, which would make this field
    // useless for the origin-change detection it exists to provide.
    servedBy: request.headers.get('x-forwarded-host')
      ?? request.headers.get('host')
      ?? new URL(request.url).host,
    // Set by the edge gateway when one is in front; absent on a direct origin.
    servedVia: request.headers.get('x-goalplace-gateway-environment'),
    publicBaseUrl: process.env.GOALPLACE_APP_BASE_URL ?? null,
    // Reported so the boundary and an operator can see enforcement state without
    // guessing. Gateway-only protection is deliberately off for the direct demo origin.
    gatewayRequired: process.env.GOALPLACE_REQUIRE_GATEWAY_SECRET === 'true',
    // The finalizer activation this runtime believes it is in.
    //
    // The gate binds to the finalization path, and App Hosting reaches that path through
    // the correction and /finalize routes, so this runtime has its own copy of the switch.
    // An unset variable resolves to `off`, which would silently stop those routes
    // finalizing — reporting the mode makes that visible instead of a mystery. It is the
    // mode only, never the canary allowlist: submission ids are not public.
    finalizerMode: activationFromEnvironment().mode,
    /**
     * The team authority sunset stage THIS runtime is in.
     *
     * Reported for the same reason as the finalizer mode, and with more at stake. This
     * variable decides what a team bundle grants at the moment a projection is BUILT, and two
     * runtimes build projections: this one whenever an assignment changes, and
     * `convergeLifecycle` hourly. If they disagree, the one on the older stage quietly writes
     * retired capabilities back, one user at a time, and `access:sunset-invariants` passes on
     * the day it is run and fails a week later with nothing having changed.
     *
     * Until now there was no way to observe this on either runtime — the migration's most
     * consequential variable was the one nobody could read back. An unset value resolves to
     * `frozen`, so a deployment that failed to declare it looks identical to one that chose
     * it, which is exactly the ambiguity worth removing. It is a stage name, not a secret.
     */
    teamAuthorityStage: currentTeamAuthorityStage(),
    /**
     * Whether each scheduler-authenticated route can authenticate a scheduler at all.
     *
     * Same reason as the two above: a variable that decides whether scheduled work runs, and
     * which nothing could read back. `safeSecretEquals` returns false when the expected value
     * is undefined, so a route whose credential was never declared answers 401 forever and
     * looks identical to a caller with the wrong secret — the Cloud Function logs it and
     * moves on, and scheduled work silently does not happen.
     *
     * Names variables and operations only. No secret value, and no indication of what a
     * correct credential looks like, so it is safe on a public endpoint.
     */
    schedulerAuth: schedulerAuthDiagnostics(),
  }, {
    headers: {
      // Never cached: a stale identity is worse than none, since the entire purpose is
      // to notice that the answer changed.
      'cache-control': 'no-store',
    },
  });
}
