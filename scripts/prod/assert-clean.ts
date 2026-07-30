import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { assertSafeProductionEnvironment } from '../../src/lib/environment';

const ROOT = process.cwd();
const ACTIVE_FILE = path.join(ROOT, 'config/active-environment.json');

function readActiveEnvironment() {
  if (!existsSync(ACTIVE_FILE)) return null;
  return JSON.parse(readFileSync(ACTIVE_FILE, 'utf8')) as {
    activeEnvironment?: string;
  };
}

function assertNoTrackedDemoProductionConfig() {
  const productionConfig = readFileSync(path.join(ROOT, 'apphosting.production.yaml'), 'utf8');
  const forbidden = [
    'synthetic_demo',
    'NEXT_PUBLIC_ENABLE_DEMO_LOGIN\n    value: "true"',
    'GOALPLACE_ENABLE_INVESTOR_TOOLS\n    value: "true"',
    'GOALPLACE_PAYMENTS_MODE\n    value: sandbox',
  ];
  const found = forbidden.filter((pattern) => productionConfig.includes(pattern));
  if (found.length) {
    throw new Error(`Production App Hosting config contains forbidden demo/beta setting(s): ${found.join(', ')}.`);
  }
  if (productionConfig.includes('REPLACE_WITH_')) {
    throw new Error('Production App Hosting config still contains REPLACE_WITH_* placeholders.');
  }
}

function main() {
  assertSafeProductionEnvironment({
    ...process.env,
    NODE_ENV: 'production',
    GOALPLACE_ENVIRONMENT: process.env.GOALPLACE_ENVIRONMENT ?? 'production',
    NEXT_PUBLIC_GOALPLACE_ENVIRONMENT: process.env.NEXT_PUBLIC_GOALPLACE_ENVIRONMENT ?? 'production',
    GOALPLACE_DATA_ORIGIN: process.env.GOALPLACE_DATA_ORIGIN ?? 'production',
    NEXT_PUBLIC_DATA_MODE: process.env.NEXT_PUBLIC_DATA_MODE ?? 'firebase',
  });

  assertNoTrackedDemoProductionConfig();

  const active = readActiveEnvironment();
  if (active?.activeEnvironment && active.activeEnvironment !== 'production') {
    console.warn(`Gateway state is ${active.activeEnvironment}; this guard only validates production configuration.`);
  }

  console.log('Production clean-start assertion passed.');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
