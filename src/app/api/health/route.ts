import { adminDb } from '@/lib/firebase/admin';
import { goalPlaceEnvironment } from '@/lib/environment';

export const runtime = 'nodejs';

/**
 * Liveness and dependency health for the origin serving this request.
 *
 * Deliberately unauthenticated so an uptime probe, a deployment check or a future
 * gateway health check can call it without credentials — and deliberately terse for the
 * same reason. It reports whether a dependency answered, never why it did not: an
 * unauthenticated endpoint must not become a reconnaissance surface that describes the
 * backend's internal failure to an anonymous caller.
 *
 * `environment:status` uses this to report what the deployed origin actually says,
 * rather than what local activation state claims.
 */

const DEPENDENCY_TIMEOUT_MS = 3000;

async function withTimeout<T>(work: Promise<T>, label: string): Promise<'ok' | 'unavailable'> {
  const timeout = new Promise<'unavailable'>((resolve) => {
    setTimeout(() => resolve('unavailable'), DEPENDENCY_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([work.then(() => 'ok' as const), timeout]);
    return result;
  } catch (cause) {
    // Logged server-side with detail; the response carries none.
    console.error(`Health check dependency failed: ${label}`, cause);
    return 'unavailable';
  }
}

export async function GET(): Promise<Response> {
  // A single cheap read proves credentials, network path and database id together.
  // A count over an empty collection is the least intrusive way to do that.
  const firestore = await withTimeout(
    adminDb.collection('sports').limit(1).get(),
    'firestore',
  );

  const checks = { firestore };
  const healthy = Object.values(checks).every((state) => state === 'ok');

  return Response.json({
    status: healthy ? 'ok' : 'degraded',
    environment: goalPlaceEnvironment(),
    checks,
    checkedAt: new Date().toISOString(),
  }, {
    // 503 so an uptime monitor and a deployment gate can act on the status code alone.
    status: healthy ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  });
}
