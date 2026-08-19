import process from 'node:process';
import { pathToFileURL } from 'node:url';

/**
 * Probes a deployed origin and reports what it actually says.
 *
 * `environment:status` reads local activation JSON — a record of intent, not of reality.
 * If a deploy failed, or an origin is serving an older build, the local file is
 * unchanged and still reports success. This asks the origin instead.
 *
 * Read-only and unauthenticated: it calls the public identity and health endpoints.
 *
 *   npm run environment:probe -- --url https://fan22--project.us-east4.hosted.app
 *   npm run environment:probe -- --url ... --expect-environment demo
 */

export type ProbeResult = {
  url: string;
  reachable: boolean;
  status: 'ok' | 'degraded' | 'unreachable';
  environment?: string;
  environmentVersion?: string;
  firebaseProjectId?: string;
  servedBy?: string;
  gatewayRequired?: boolean;
  finalizerMode?: string;
  checks?: Record<string, string>;
  problems: string[];
};

function valueAfter(argv: string[], flag: string) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function getJson(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) };
  } catch {
    return { ok: false, status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeOrigin(
  baseUrl: string,
  options: { expectEnvironment?: string; expectProject?: string; timeoutMs?: number } = {},
): Promise<ProbeResult> {
  const url = baseUrl.replace(/\/$/, '');
  const timeoutMs = options.timeoutMs ?? 8000;
  const problems: string[] = [];

  const [identity, health] = await Promise.all([
    getJson(`${url}/api/environment`, timeoutMs),
    getJson(`${url}/api/health`, timeoutMs),
  ]);

  if (!identity.body) {
    return { url, reachable: false, status: 'unreachable', problems: ['Identity endpoint did not respond.'] };
  }

  const body = identity.body as Record<string, unknown>;
  const environment = typeof body.environment === 'string' ? body.environment : undefined;
  const firebaseProjectId = typeof body.firebaseProjectId === 'string' ? body.firebaseProjectId : undefined;

  // The point of a probe is to catch a deploy that reported success while serving the
  // wrong thing, so the expectations are compared rather than merely displayed.
  if (options.expectEnvironment && environment !== options.expectEnvironment) {
    problems.push(`Expected environment ${options.expectEnvironment}, origin reports ${environment ?? 'unknown'}.`);
  }
  if (options.expectProject && firebaseProjectId !== options.expectProject) {
    problems.push(`Expected project ${options.expectProject}, origin reports ${firebaseProjectId ?? 'unknown'}.`);
  }

  const healthBody = (health.body ?? {}) as Record<string, unknown>;
  const healthStatus = typeof healthBody.status === 'string' ? healthBody.status : 'unknown';
  if (healthStatus !== 'ok') problems.push(`Health endpoint reports ${healthStatus}.`);

  return {
    url,
    reachable: true,
    status: problems.length ? 'degraded' : 'ok',
    environment,
    environmentVersion: typeof body.environmentVersion === 'string' ? body.environmentVersion : undefined,
    firebaseProjectId,
    servedBy: typeof body.servedBy === 'string' ? body.servedBy : undefined,
    gatewayRequired: body.gatewayRequired === true,
    finalizerMode: typeof body.finalizerMode === 'string' ? body.finalizerMode : undefined,
    checks: (healthBody.checks ?? {}) as Record<string, string>,
    problems,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const url = valueAfter(argv, '--url') ?? process.env.GOALPLACE_APP_BASE_URL;
  if (!url) throw new Error('Usage: environment/probe.ts --url <origin> [--expect-environment demo] [--expect-project id]');

  const result = await probeOrigin(url, {
    expectEnvironment: valueAfter(argv, '--expect-environment'),
    expectProject: valueAfter(argv, '--expect-project'),
  });

  console.log('GoalPlace256 origin probe');
  console.log(`URL: ${result.url}`);
  console.log(`Status: ${result.status}`);
  console.log(`Environment: ${result.environment ?? 'unknown'} (${result.environmentVersion ?? 'unknown'})`);
  console.log(`Project: ${result.firebaseProjectId ?? 'unknown'}`);
  console.log(`Served by: ${result.servedBy ?? 'unknown'}`);
  console.log(`Gateway required: ${result.gatewayRequired ? 'yes' : 'no'}`);
  // The activation this origin would apply to a correction or a /finalize call. `off` here
  // while the Cloud Functions are `enabled` means the two runtimes disagree.
  console.log(`Finalizer mode (this origin): ${result.finalizerMode ?? 'unreported'}`);
  console.log(`Dependencies: ${JSON.stringify(result.checks ?? {})}`);
  for (const problem of result.problems) console.log(`  ! ${problem}`);

  if (result.status !== 'ok') process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
