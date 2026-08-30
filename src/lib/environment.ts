/**
 * `unconfigured` is not a place anything runs. It is the value the un-overlaid
 * `apphosting.yaml` carries so that a backend created without naming an overlay fails at
 * build instead of silently coming up as demo and writing to the demo database.
 *
 * It is deliberately distinct from an unset variable, which still resolves to `local` so
 * that `next dev` and the test suites keep working with no configuration at all. Only an
 * explicit `GOALPLACE_ENVIRONMENT=unconfigured` trips the build gate.
 */
export type GoalPlaceEnvironment =
  | 'local'
  | 'unconfigured'
  | 'demo'
  | 'beta'
  | 'production'
  | 'maintenance';

export type DataOrigin = 'synthetic_demo' | 'beta_test' | 'verified_pilot' | 'production';

export type EnvironmentFlags = {
  allowDemoLogin: boolean;
  allowSeeding: boolean;
  allowRealPayments: boolean;
  enableInvestorTools: boolean;
};

export type PublicEnvironment = {
  environment: GoalPlaceEnvironment;
  environmentVersion: string;
  firebaseProjectId: string;
  dataMode: string;
};

const ENVIRONMENTS = new Set<GoalPlaceEnvironment>([
  'local',
  'unconfigured',
  'demo',
  'beta',
  'production',
  'maintenance',
]);

/**
 * The overlays a backend may actually name. `local` is the no-configuration default and
 * `unconfigured` is the refusal sentinel, so neither is deployable.
 */
export const DEPLOYABLE_ENVIRONMENTS: readonly GoalPlaceEnvironment[] = [
  'demo',
  'beta',
  'production',
  'maintenance',
];

export function booleanEnv(value: string | undefined) {
  return value === 'true';
}

export function goalPlaceEnvironment(env: NodeJS.ProcessEnv = process.env): GoalPlaceEnvironment {
  const raw = env.GOALPLACE_ENVIRONMENT ?? env.NEXT_PUBLIC_GOALPLACE_ENVIRONMENT;
  if (raw && ENVIRONMENTS.has(raw as GoalPlaceEnvironment)) return raw as GoalPlaceEnvironment;
  return 'local';
}

export function environmentFlags(env: NodeJS.ProcessEnv = process.env): EnvironmentFlags {
  return {
    allowDemoLogin: booleanEnv(env.GOALPLACE_ALLOW_DEMO_LOGIN) || booleanEnv(env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN),
    allowSeeding: booleanEnv(env.GOALPLACE_ALLOW_SEEDING),
    allowRealPayments: booleanEnv(env.GOALPLACE_ALLOW_REAL_PAYMENTS),
    enableInvestorTools:
      booleanEnv(env.GOALPLACE_ENABLE_INVESTOR_TOOLS) ||
      booleanEnv(env.NEXT_PUBLIC_GOALPLACE_ENABLE_INVESTOR_TOOLS),
  };
}

export function publicEnvironment(env: NodeJS.ProcessEnv = process.env): PublicEnvironment {
  const runtimeFirebaseProjectId = env.GOALPLACE_ADMIN_PROJECT_ID ?? env.GCLOUD_PROJECT;
  const dataMode = env.NEXT_PUBLIC_DATA_MODE ?? (runtimeFirebaseProjectId ? 'firebase' : 'mock');

  return {
    environment: goalPlaceEnvironment(env),
    environmentVersion:
      env.NEXT_PUBLIC_GOALPLACE_ENVIRONMENT_VERSION ??
      env.GOALPLACE_ENVIRONMENT_VERSION ??
      env.K_REVISION ??
      'local-dev',
    firebaseProjectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? runtimeFirebaseProjectId ?? 'unconfigured',
    dataMode,
  };
}

export function assertSafeProductionEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const environment = goalPlaceEnvironment(env);

  if (environment === 'unconfigured') {
    throw new Error(
      'GoalPlace256 has no environment overlay selected. GOALPLACE_ENVIRONMENT is the '
      + '`unconfigured` sentinel, which is not a runnable configuration. Build against one of '
      + `${DEPLOYABLE_ENVIRONMENTS.join(', ')} `
      + '(apphosting.demo.yaml, apphosting.beta.yaml, apphosting.production.yaml).',
    );
  }

  assertConfigMatchesProject(env);

  if (environment !== 'production') return;

  const flags = environmentFlags(env);
  const problems: string[] = [];

  if (flags.allowDemoLogin) problems.push('demo login is enabled');
  if (flags.allowSeeding) problems.push('seeding is enabled');
  if (flags.enableInvestorTools) problems.push('investor tools are enabled');
  if ((env.NEXT_PUBLIC_DATA_MODE ?? 'mock') !== 'firebase') problems.push('mock fallback is enabled');
  if ((env.GOALPLACE_DATA_ORIGIN ?? '') !== 'production') problems.push('synthetic or non-production data mode is active');
  if (env.GOALPLACE_PAYMENTS_MODE === 'sandbox') problems.push('sandbox payments are active');
  if (flags.allowRealPayments) problems.push('real payments are enabled before the money launch gate');
  if (env.NEXT_PUBLIC_GOALPLACE_ENVIRONMENT === 'demo' || env.NEXT_PUBLIC_GOALPLACE_ENVIRONMENT === 'beta') {
    problems.push('demo or beta banner is enabled');
  }
  if ((env.GOALPLACE_PAYMENT_CALLBACK_BASE_URL ?? '').includes('demo.')) {
    problems.push('demo callback URL is configured');
  }
  if ((env.GOALPLACE_PAYMENT_CALLBACK_BASE_URL ?? '').includes('beta.')) {
    problems.push('beta callback URL is configured');
  }
  // Production must never fall through to the code default. `legacy` and `compare` both
  // return the legacy projection, so either would run production on authority that
  // canonical assignments do not govern — silently, and looking correct.
  const accessMode = env.GOALPLACE_ACCESS_ENGINE_MODE;
  if (accessMode !== 'assignments') {
    problems.push(accessMode
      ? `access engine mode is '${accessMode}' rather than 'assignments'`
      : 'access engine mode is not set (GOALPLACE_ACCESS_ENGINE_MODE)');
  }

  if (problems.length) {
    throw new Error(`Unsafe GoalPlace256 production configuration: ${problems.join('; ')}.`);
  }
}

/**
 * The configuration in force must belong to the project it is being built for.
 *
 * ## What this replaces, and why
 *
 * App Hosting reads `apphosting.yaml` when a backend names no overlay, and that file was a
 * copy of the demo configuration — demo project id, demo API key, demo login on. So a backend
 * created for beta and given no overlay came up as DEMO and wrote to the demo database. That
 * needed no mistake in the beta config, only a forgotten flag at backend-creation time.
 *
 * The first attempt at closing this made the base declare `unconfigured` and fail the build.
 * That was the wrong shape, and the demo rollout proved it within minutes: **the live demo
 * backend is itself un-overlaid.** It builds from `apphosting.yaml`, so a sentinel there
 * fails the one backend that legitimately relies on the default. The premise was right — an
 * un-overlaid backend does inherit whatever the base says — and the conclusion was wrong,
 * because "names no overlay" is not the same thing as "is misconfigured".
 *
 * What actually matters is narrower and checkable: does the configuration in force name the
 * SAME project this build is running against? A beta backend reading demo's config declares
 * `manifest-quasar-479416-s7` while Cloud Build reports `goalplace-beta`. That mismatch is the
 * failure itself rather than a proxy for it, and it catches the case whether or not an overlay
 * was named.
 *
 * ## Why it skips when the ambient project is unknown
 *
 * `GCLOUD_PROJECT` is set by App Hosting and Cloud Build; it is not set for `next dev`, a
 * local `next build`, or CI. Failing closed on its absence would break every build that is not
 * on Google infrastructure, which is not a trade worth making for a check whose whole purpose
 * is to catch a deploy-time mistake. When there is nothing to compare against, there is no
 * disagreement to report.
 */
export function assertConfigMatchesProject(env: NodeJS.ProcessEnv = process.env) {
  const declared = env.GOALPLACE_ADMIN_PROJECT_ID ?? env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const ambient = env.GCLOUD_PROJECT ?? env.GOOGLE_CLOUD_PROJECT;

  // Nothing to compare. See the note above: absence is not evidence of a mismatch.
  if (!declared || !ambient) return;
  if (declared.startsWith('REPLACE_WITH_')) return; // The readiness gate owns placeholders.
  if (declared === ambient) return;

  throw new Error(
    `Unsafe GoalPlace256 configuration: this build is running against project '${ambient}', but `
    + `the App Hosting configuration in force names '${declared}'. That is what happens when a `
    + 'backend is built without selecting its overlay — it inherits apphosting.yaml, which '
    + 'belongs to a different environment. Build with the matching apphosting.<environment>.yaml.',
  );
}

/**
 * Beta and production must pin the access engine explicitly. Demo may run `compare`
 * during the migration, but never by omission — an unset variable silently selects the
 * legacy authority.
 */
export function assertExplicitAccessEngineMode(env: NodeJS.ProcessEnv = process.env) {
  const environment = goalPlaceEnvironment(env);
  if (environment === 'local') return;

  const accessMode = env.GOALPLACE_ACCESS_ENGINE_MODE;
  if (!accessMode) {
    throw new Error(
      `GoalPlace256 ${environment} must set GOALPLACE_ACCESS_ENGINE_MODE explicitly. `
      + 'Leaving it unset selects the legacy authority through the code default.',
    );
  }
  if (!['legacy', 'compare', 'assignments'].includes(accessMode)) {
    throw new Error(`GOALPLACE_ACCESS_ENGINE_MODE '${accessMode}' is not a supported access engine mode.`);
  }
  if ((environment === 'beta' || environment === 'production') && accessMode !== 'assignments') {
    throw new Error(
      `GoalPlace256 ${environment} requires GOALPLACE_ACCESS_ENGINE_MODE=assignments, not '${accessMode}'.`,
    );
  }
}
