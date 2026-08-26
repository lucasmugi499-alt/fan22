import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedUser, requireRole } from '@/server/api/security';
import { hasCapability } from '@/server/access/capabilities';
import {
  ACTIVATION_VARIABLES,
  activationForSource,
  type FinalizationSource,
} from '@/server/finalizerActivation';
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


  return Response.json({
    demo: {
      environment: process.env.GOALPLACE_ENVIRONMENT ?? 'unknown',
      active: true,
      publicBaseUrl: process.env.GOALPLACE_APP_BASE_URL ?? null,
    },
    /**
     * The finalizer switches as THIS runtime reads them, one per intake source.
     *
     * Two things an operator has to be able to see separately, and could not while a single
     * flag governed every source: which door is open, and how wide. A pipeline that has never
     * been cloud-verified reading `enabled` is the report that should stop a release, and it
     * is unreadable from a single aggregate mode.
     *
     * `modeThisOrigin`, not `mode`. The Cloud Functions runtime holds its own copy of every
     * one of these, and it is the copy that governs the two trigger-driven sources — this
     * runtime cannot reach field capture or league entry at all. Reporting these as global
     * state would be a lie of exactly the kind this endpoint exists to refuse.
     */
    finalizer: {
      modeThisOrigin: activationForSource('legacy_submission').mode,
      canaryAllowlistSize: activationForSource('legacy_submission').canaryAllowlist.length,
      sources: sourceActivationReport(),
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

/**
 * Every source gate, named by the variable that sets it.
 *
 * The variable name is reported alongside the value because the failure this endpoint keeps
 * being asked about is "we thought it was on": an operator reading `off` needs the exact
 * string to grep for and set, not a label they then have to map back to configuration.
 *
 * `governedBy` says which runtime's copy actually decides, so nobody reads a mode off this
 * origin and concludes the trigger will honour it.
 */
function sourceActivationReport() {
  const governedBy: Record<FinalizationSource, string> = {
    legacy_submission: 'App Hosting routes and onResultSubmissionWritten',
    field_capture: 'onMatchReportWritten',
    league_post_match: 'onMatchReportWritten',
  };
  return (Object.keys(ACTIVATION_VARIABLES) as FinalizationSource[]).map((source) => {
    const activation = activationForSource(source);
    // Whether a claim of this source can reach the finalizer THROUGH THIS RUNTIME at all.
    // Field and league reports arrive on a Firestore trigger, so App Hosting reads their
    // variables and never acts on them: reporting `off` for one of those without saying so
    // would read as "field capture is disabled", which is not what this origin knows.
    const reachable = source === 'legacy_submission';
    return {
      source,
      modeThisOrigin: reachable ? activation.mode : null,
      canaryAllowlistSize: reachable ? activation.canaryAllowlist.length : null,
      reachableFromThisOrigin: reachable,
      variable: ACTIVATION_VARIABLES[source].mode,
      canaryVariable: ACTIVATION_VARIABLES[source].canaryIds,
      governedBy: governedBy[source],
    };
  });
}
