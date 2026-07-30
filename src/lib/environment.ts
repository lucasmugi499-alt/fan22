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

  if (problems.length) {
    throw new Error(`Unsafe GoalPlace256 production configuration: ${problems.join('; ')}.`);
  }
}
