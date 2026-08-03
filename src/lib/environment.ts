export type GoalPlaceEnvironment = 'local' | 'demo' | 'beta' | 'production' | 'maintenance';

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
  'demo',
  'beta',
  'production',
  'maintenance',
]);

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
