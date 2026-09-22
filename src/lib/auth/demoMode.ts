import {
  environmentFlags,
  environmentNameIsRecognised,
  goalPlaceEnvironment,
  type GoalPlaceEnvironment,
} from '@/lib/environment';

/**
 * Demo mode lets anyone assume a role client-side without authenticating. Firestore rules
 * key off real custom claims, so no data is exposed — but every internal surface renders as
 * though the session were real, so it must never be reachable on an unguarded deployment.
 *
 * Enabled in development, or in a demo build that opts in explicitly with
 * NEXT_PUBLIC_ENABLE_DEMO_LOGIN=true.
 *
 * ## Two conditions, not one
 *
 * The environment must be one that may ever host demo accounts, AND the flag must be set.
 * This used to be a denylist of exactly one name — anything that was not `production` could
 * turn demo login on with a flag alone. Beta is not production, so a beta backend that
 * inherited `NEXT_PUBLIC_ENABLE_DEMO_LOGIN: "true"` from the base overlay (which is the demo
 * overlay, and sets it true) would have shipped a click-to-become-anyone switch to real beta
 * users. That is the "one misconfiguration from leaking" the audit named, and a denylist
 * cannot close it because the dangerous case is the environment nobody thought to list.
 *
 * An allowlist fails the safe way instead: an unrecognised or missing environment name is
 * not demo-capable, so the flag alone can never be enough.
 */
const DEMO_CAPABLE_ENVIRONMENTS = new Set<GoalPlaceEnvironment>(['local', 'unconfigured', 'demo']);

export const isDemoModeEnabled =
  // A declared-but-unrecognised name resolves to 'local', which is demo-capable — so a typo
  // in an overlay would have turned demo login ON. Recognised first, then capable.
  environmentNameIsRecognised() &&
  DEMO_CAPABLE_ENVIRONMENTS.has(goalPlaceEnvironment()) &&
  (
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === 'true' ||
    environmentFlags().allowDemoLogin
  );
