import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedUser, requireRole } from '@/server/api/security';
import { hasCapability } from '@/server/access/capabilities';
import { activationFromEnvironment } from '@/server/finalizerActivation';
import {
  environmentReadiness,
  routingMechanismAvailable,
  type EnvironmentReadiness,
} from '@/server/platform/environmentReadiness';

export const runtime = 'nodejs';

/**
 * Truthful control-plane state.
 *
 * Every field here is measured, not declared. The rule this endpoint exists to enforce is
 * that the console must never imply an ability the platform does not have: beta and
 * production report readiness, and readiness is not a switch. There is no activation action
 * on this route because no traffic-routing mechanism exists to action — App Hosting serves
 * one backend and nothing here can retarget it.
 *
 * Reporting "ready" for an environment whose config is still placeholders would be the
 * worst possible lie for an operator to act on.
 *
 * Readiness comes from the same module the activation workflow gates on, so the page that
 * says "not ready" and the workflow that refuses to approve can never drift into telling an
 * operator two different things about one environment.
 */

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;
  const forbidden = requireRole(auth.actor, ['platform_admin', 'super_admin'], 'Platform Admin access required.');
  if (forbidden) return forbidden;
  // Reading operational state is an audit capability, not a management one.
  if (!(await hasCapability(auth.actor.uid, { scopeType: 'platform', scopeId: 'global' }, 'platform.audit.read'))) {
    return Response.json({ error: 'Missing platform capability: platform.audit.read.' }, { status: 403 });
  }

  const routingAvailable = routingMechanismAvailable();
  const [beta, production, openCases] = await Promise.all([
    environmentReadiness('beta', routingAvailable),
    environmentReadiness('production', routingAvailable),
    adminDb.collection('reconciliationExceptions')
      .where('status', 'in', ['open', 'acknowledged', 'escalated'])
      .get()
      .then((snapshot) => snapshot.size)
      .catch(() => null),
  ]);

  const activation = activationFromEnvironment();

  return Response.json({
    demo: {
      environment: process.env.GOALPLACE_ENVIRONMENT ?? 'unknown',
      active: true,
      publicBaseUrl: process.env.GOALPLACE_APP_BASE_URL ?? null,
    },
    // The finalizer switch as THIS runtime reads it. The Cloud Functions runtime holds its
    // own copy, which is why the value is labelled by origin rather than stated globally.
    finalizer: {
      modeThisOrigin: activation.mode,
      canaryAllowlistSize: activation.canaryAllowlist.length,
    },
    // Every outstanding blocker is listed, not summarised to one line: an operator told
    // only about placeholders would fix them and expect to be ready, when the routing wall
    // is still there behind it. "Not ready" must never be read as "nearly ready".
    beta: environmentReport(beta),
    production: environmentReport(production),
    // Deployment state the console cannot infer from the app alone. Reported as unknown
    // rather than guessed: only the Firebase API knows what is deployed, and this runtime
    // does not query it.
    scheduledJobs: {
      state: 'unknown_from_app_runtime',
      note: 'Verify with `firebase functions:list`. The app cannot see the deployed function set.',
    },
    competitionIntegrity: {
      openCases,
      note: openCases === null ? 'Case count unavailable.' : undefined,
    },
    trafficSwitching: {
      available: routingAvailable,
      reason: 'Environment activation prepares configuration and records intent. It does not retarget traffic; no gateway or DNS control exists in this deployment.',
    },
  }, { headers: { 'cache-control': 'no-store' } });
}

function environmentReport(readiness: EnvironmentReadiness) {
  return {
    present: readiness.configPresent,
    placeholders: readiness.placeholderMarkers.length > 0,
    // Named so an operator can see WHY it is not ready rather than being told a verdict.
    placeholderMarkers: readiness.placeholderMarkers,
    ready: readiness.ready,
    blockers: readiness.blockers,
  };
}
