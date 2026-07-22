/**
 * Demo mode lets anyone assume a role client-side without authenticating. Firestore rules
 * key off real custom claims, so no data is exposed — but every internal surface renders as
 * though the session were real, so it must never be reachable on an unguarded deployment.
 *
 * Enabled in development, or in any build that opts in explicitly with
 * NEXT_PUBLIC_ENABLE_DEMO_LOGIN=true (used for pilot/demo deployments).
 */
export const isDemoModeEnabled =
  process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === 'true';
