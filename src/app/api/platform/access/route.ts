import { adminDb } from '@/lib/firebase/admin';
import { accessIndexId } from '@/lib/auth/access';
import { normalizeAccessAssignment } from '@/lib/auth/accessProjection';
import { jsonError, requireAuthenticatedUser } from '@/server/api/security';
import { securePlatformCommand } from '@/server/platform/commands/securePlatformCommand';

export const runtime = 'nodejs';

/**
 * The canonical access desk read model.
 *
 * `/admin/access` previously loaded and revoked legacy `teamAssignments` in the browser,
 * which produced an operational illusion: a Platform Admin could revoke there and leave
 * the canonical assignment — the thing that actually grants access — untouched.
 *
 * This returns canonical `accessAssignments` with the projection state alongside, so the
 * desk shows the authority that Firestore Rules read. Legacy records are returned
 * separately and clearly labelled, never mixed into the same list.
 *
 * Server-paginated: the browser must not pull hundreds of assignment documents to render
 * a directory.
 */

const PAGE_SIZE = 50;

type ScopeLabel = { name: string; leagueName?: string };

function toIso(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  const date = (value as { toDate?: () => Date } | undefined)?.toDate?.();
  return date instanceof Date ? date.toISOString() : undefined;
}

async function labelsFor(scopeType: string, scopeIds: string[]): Promise<Map<string, ScopeLabel>> {
  const labels = new Map<string, ScopeLabel>();
  if (!scopeIds.length) return labels;
  const collection = scopeType === 'league' ? 'leagues' : scopeType === 'team' ? 'teams' : scopeType === 'athlete' ? 'athletes' : null;
  if (!collection) return labels;

  // Chunked: Firestore rejects an `in` filter with more than 30 values.
  for (let offset = 0; offset < scopeIds.length; offset += 30) {
    const chunk = scopeIds.slice(offset, offset + 30);
    const snapshot = await adminDb.collection(collection)
      .where('__name__', 'in', chunk)
      .get()
      .catch(() => null);
    for (const document of snapshot?.docs ?? []) {
      const data = document.data();
      labels.set(document.id, {
        name: typeof data.name === 'string' ? data.name : document.id,
        leagueName: typeof data.leagueId === 'string' ? data.leagueId : undefined,
      });
    }
  }
  return labels;
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response ?? jsonError('Authentication required.', 401);

  const guarded = await securePlatformCommand({
    actor: auth.actor,
    command: 'access.directory.read',
    requiredCapability: 'platform.audit.read',
    handler: async ({ requestId }) => {
      const url = new URL(request.url);
      const status = url.searchParams.get('status');
      const scopeType = url.searchParams.get('scopeType');
      const cursor = url.searchParams.get('cursor');
      const limit = Math.min(Number(url.searchParams.get('limit') ?? PAGE_SIZE) || PAGE_SIZE, 100);

      let query = adminDb.collection('accessAssignments').orderBy('__name__');
      if (status) query = query.where('status', '==', status);
      if (scopeType) query = query.where('scopeType', '==', scopeType);
      if (cursor) query = query.startAfter(cursor);

      const snapshot = await query.limit(limit + 1).get();
      const documents = snapshot.docs.slice(0, limit);
      const nextCursor = snapshot.docs.length > limit ? documents[documents.length - 1]?.id : null;

      const nowIso = new Date().toISOString();
      const assignments = documents.map((document) =>
        normalizeAccessAssignment(document.id, document.data(), nowIso));

      const userIds = [...new Set(assignments.map((assignment) => assignment.userId))].filter(Boolean);
      const userLabels = new Map<string, { email?: string; accountClass?: string; accountStatus?: string }>();
      for (let offset = 0; offset < userIds.length; offset += 30) {
        const chunk = userIds.slice(offset, offset + 30);
        const users = await adminDb.collection('users').where('__name__', 'in', chunk).get().catch(() => null);
        for (const document of users?.docs ?? []) {
          const data = document.data();
          userLabels.set(document.id, {
            email: typeof data.email === 'string' ? data.email : undefined,
            accountClass: typeof data.accountClass === 'string' ? data.accountClass : undefined,
            accountStatus: typeof data.accountStatus === 'string' ? data.accountStatus : undefined,
          });
        }
      }

      const scopeLabels = new Map<string, Map<string, ScopeLabel>>();
      for (const type of ['league', 'team', 'athlete']) {
        const ids = [...new Set(assignments.filter((a) => a.scopeType === type).map((a) => a.scopeId))];
        scopeLabels.set(type, await labelsFor(type, ids));
      }

      // The projection is what Rules actually read, so surface it next to the assignment:
      // a mismatch here is exactly the drift the projector exists to prevent.
      const projections = await Promise.all(assignments.map(async (assignment) => {
        const document = await adminDb.collection('accessIndex')
          .doc(accessIndexId(assignment.scopeType, assignment.scopeId, assignment.userId))
          .get();
        return {
          id: assignment.id,
          projected: document.exists,
          capabilities: Array.isArray(document.data()?.capabilities) ? document.data()!.capabilities as string[] : [],
        };
      }));
      const projectionById = new Map(projections.map((entry) => [entry.id, entry]));

      return Response.json({
        requestId,
        assignments: assignments.map((assignment) => {
          const projection = projectionById.get(assignment.id);
          return {
            ...assignment,
            scopeLabel: scopeLabels.get(assignment.scopeType)?.get(assignment.scopeId)?.name ?? assignment.scopeId,
            account: userLabels.get(assignment.userId) ?? {},
            projected: projection?.projected ?? false,
            projectedCapabilities: projection?.capabilities ?? [],
            validFrom: toIso(assignment.validFrom),
            validUntil: toIso(assignment.validUntil),
          };
        }),
        nextCursor,
      }, { headers: { 'cache-control': 'no-store' } });
    },
  });

  // The guard may return a rejection without a body; never fall through to undefined.
  if ('response' in guarded) {
    return guarded.response ?? jsonError('You do not have permission to read scoped access.', 403);
  }
  return guarded.result;
}

export async function POST() {
  return jsonError('Access assignments are changed through the trusted admin command.', 405);
}
