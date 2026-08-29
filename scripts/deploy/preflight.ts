import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertDeployTarget,
  describeTarget,
  type DeployEnvironment,
} from '../lib/deployTarget';

/**
 * The gate every deploy script runs before `firebase deploy`.
 *
 * Invoked as:
 *   tsx scripts/deploy/preflight.ts --environment=production --project=production
 *
 * It prints the resolved project and database and exits non-zero when they disagree with
 * the environment registry, so the `&&` in the npm script stops the deploy. Chaining it in
 * front of the deploy rather than wrapping the deploy in it keeps the actual command
 * visible in package.json, where an operator reviewing the runbook can read it.
 */

function flag(argv: string[], name: string): string | undefined {
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  if (index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--')) return argv[index + 1];
  return undefined;
}

const ENVIRONMENTS: DeployEnvironment[] = ['demo', 'beta', 'production', 'staging'];

export function main(argv = process.argv.slice(2)) {
  const environment = flag(argv, 'environment');
  const requestedProject = flag(argv, 'project');
  const configFile = flag(argv, 'config');

  if (!environment || !ENVIRONMENTS.includes(environment as DeployEnvironment)) {
    throw new Error(
      `--environment must be one of ${ENVIRONMENTS.join(', ')}, got '${environment ?? 'nothing'}'.`,
    );
  }
  if (!requestedProject) {
    throw new Error('--project is required. A deploy with no stated target is not reviewable.');
  }

  const target = assertDeployTarget({
    environment: environment as DeployEnvironment,
    requestedProject,
    configFile,
  });

  console.log('Deploy target preflight passed.');
  console.log(describeTarget(target));
  return target;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
