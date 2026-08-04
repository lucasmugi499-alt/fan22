import { adminDb } from '@/lib/firebase/admin';
import { accessEngineMode } from '@/lib/auth/accessMode';
import { environmentFlags, goalPlaceEnvironment } from '@/lib/environment';
import { jsonError, requireAuthenticatedUser } from '@/server/api/security';
import { securePlatformCommand } from '@/server/platform/commands/securePlatformCommand';

export const runtime = 'nodejs';

/**
 * Server-truth system health.
 *
 * The System Health screen read `process.env.GOALPLACE_REQUIRE_APP_CHECK` from a client
 * component. That variable is server-only, so in the browser it is always undefined and
 * the panel always reported App Check as "optional" — including in an environment that
 * requires it. A safety indicator that cannot be wrong in the safe direction is worse
 * than no indicator. It also displayed a hardcoded "No secrets exposed" badge, which
 * asserted a control nobody had checked.
 *
 * Everything here is read on the server, from the runtime that actually enforces it.
 */

async function countWhere(collection: string, filters: Record<string, string | boolean> = {}) {
  const query = Object.entries(filters).reduce<FirebaseFirestore.Query>(
    (current, [field, value]) => current.where(field, '==', value),
    adminDb.collection(collection),
  ) as FirebaseFirestore.Query & {
    count?: () => { get: () => Promise<{ data: () => { count?: number } }> };
  };
  if (typeof query.count === 'function') {
    const snapshot = await query.count().get();
    return Number(snapshot.data().count ?? 0);
  }
  const snapshot = await query.limit(250).get();
  return snapshot.size;
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response ?? jsonError('Authentication required.', 401);

  const guarded = await securePlatformCommand({
    actor: auth.actor,
    command: 'system.health.read',
    requiredCapability: 'platform.audit.read',
    handler: async ({ requestId }) => {
      const environment = goalPlaceEnvironment();
      const flags = environmentFlags();
      const mode = accessEngineMode();

      const [
        failedFinalizations,
        projectionBacklog,
        pendingMedia,
        rejectedUploads,
        accessDivergences,
      ] = await Promise.all([
        countWhere('finalizations', { status: 'failed' }),
        countWhere('matches', { status: 'completed', verificationStatus: 'pending' }),
        countWhere('mediaRecords', { moderationStatus: 'pending_review' }),
        countWhere('uploadSessions', { status: 'rejected' }),
        // Legacy and canonical authority disagreeing. This must reach zero before the
        // legacy authorization path is removed.
        countWhere('securityEvents', { type: 'access_authority_divergence' }),
      ]);

      return Response.json({
        requestId,
        environment: {
          name: environment,
          firebaseProjectId: process.env.GOALPLACE_ADMIN_PROJECT_ID ?? null,
          firestoreDatabaseId: process.env.GOALPLACE_FIRESTORE_DATABASE_ID ?? null,
        },
        // Read from the server runtime that enforces them, not from a client bundle.
        safeguards: {
          appCheckRequired: process.env.GOALPLACE_REQUIRE_APP_CHECK === 'true',
          schedulerAuthMode: process.env.GOALPLACE_SCHEDULER_AUTH_MODE ?? 'unset',
          accessEngineMode: mode,
          // 'compare' and 'legacy' both answer from the legacy projection.
          accessAuthorityIsCanonical: mode === 'assignments',
          demoLoginEnabled: flags.allowDemoLogin,
          seedingEnabled: flags.allowSeeding,
          realPaymentsEnabled: flags.allowRealPayments,
          investorToolsEnabled: flags.enableInvestorTools,
        },
        backlogs: {
          failedFinalizations,
          projectionBacklog,
          pendingMediaModeration: pendingMedia,
          rejectedUploads,
          accessAuthorityDivergences: accessDivergences,
        },
      }, { headers: { 'cache-control': 'no-store' } });
    },
  });

  if ('response' in guarded) {
    return guarded.response ?? jsonError('You do not have permission to read system health.', 403);
  }
  return guarded.result;
}
