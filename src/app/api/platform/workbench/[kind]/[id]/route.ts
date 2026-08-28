import { adminDb } from '@/lib/firebase/admin';
import { accessIndexId } from '@/lib/auth/access';
import { resolveAccountClass } from '@/lib/auth/accountClass';
import { getPlatformWorkbench, type PlatformWorkbenchKind } from '@/lib/platform/workbenches';
import { indexGrantsCapability } from '@/server/access/capabilities';
import { requireActivePrincipal, requireAuthenticatedUser, requireRole } from '@/server/api/security';
import { buildPlatformWorkbenchView, type WorkbenchSourceRow } from '@/server/platform/workbenches/platformWorkbench';

export const runtime = 'nodejs';

type Filter = { field: string; value: string };
type RelatedQuery = { collection: string; filters: Filter[] };

const ENTITY_COLLECTION: Record<PlatformWorkbenchKind, string> = {
  league: 'leagues',
  team: 'teams',
  athlete: 'athletes',
  person: 'users',
  match: 'matches',
};

function queriesFor(kind: PlatformWorkbenchKind, tab: string, id: string, entity: Record<string, unknown>): RelatedQuery[] {
  if (tab === 'history') {
    return [
      { collection: 'adminAuditEvents', filters: [{ field: 'targetId', value: id }] },
      ...(kind === 'person' ? [{ collection: 'adminAuditEvents', filters: [{ field: 'actorUserId', value: id }] }] : []),
    ];
  }
  if (kind === 'league') {
    if (tab === 'seasons') return [{ collection: 'seasons', filters: [{ field: 'leagueId', value: id }] }];
    if (tab === 'teams') return [{ collection: 'teams', filters: [{ field: 'leagueId', value: id }] }];
    if (tab === 'accountability') return [{ collection: 'accessAssignments', filters: [{ field: 'scopeId', value: id }] }];
    if (tab === 'quality') return [{ collection: 'finalizations', filters: [{ field: 'leagueId', value: id }] }];
    if (tab === 'incidents') return [
      { collection: 'matchOperationalExceptions', filters: [{ field: 'leagueId', value: id }] },
      { collection: 'reconciliationExceptions', filters: [{ field: 'leagueId', value: id }] },
      { collection: 'reports', filters: [{ field: 'leagueId', value: id }] },
    ];
  }
  if (kind === 'team') {
    if (tab === 'roster') return [{ collection: 'athletes', filters: [{ field: 'teamId', value: id }] }];
    if (tab === 'administrators') return [{ collection: 'teamAssignments', filters: [{ field: 'teamId', value: id }] }];
    if (tab === 'fixtures') return [
      { collection: 'matches', filters: [{ field: 'homeTeamId', value: id }] },
      { collection: 'matches', filters: [{ field: 'awayTeamId', value: id }] },
    ];
    if (tab === 'media') return [{ collection: 'mediaRecords', filters: [{ field: 'entityId', value: id }] }];
    if (tab === 'incidents') return [{ collection: 'reports', filters: [{ field: 'targetId', value: id }] }];
  }
  if (kind === 'athlete') {
    if (tab === 'persona') return [{ collection: 'athletePersonas', filters: [{ field: 'athleteId', value: id }] }];
    if (tab === 'team' && typeof entity.teamId === 'string') return [{ collection: 'teams', filters: [{ field: 'id', value: entity.teamId }] }];
    if (tab === 'verification') return [
      { collection: 'athleteVerificationRecords', filters: [{ field: 'athleteId', value: id }] },
      { collection: 'reports', filters: [{ field: 'targetId', value: id }] },
    ];
    if (tab === 'payee') return [{ collection: 'athletePayees', filters: [{ field: 'athleteId', value: id }] }];
  }
  if (kind === 'person') {
    if (tab === 'assignments' || tab === 'organizations') return [{ collection: 'accessAssignments', filters: [{ field: 'userId', value: id }] }];
    if (tab === 'security') return [{ collection: 'accessIndex', filters: [{ field: 'userId', value: id }] }];
    if (tab === 'cases') return [
      { collection: 'reports', filters: [{ field: 'targetId', value: id }] },
      { collection: 'reports', filters: [{ field: 'reporterId', value: id }] },
    ];
  }
  if (kind === 'match') {
    if (tab === 'operations') return [
      { collection: 'fieldManagerAssignments', filters: [{ field: 'matchId', value: id }] },
      { collection: 'matchAccessSessions', filters: [{ field: 'matchId', value: id }] },
      { collection: 'matchClockStates', filters: [{ field: 'matchId', value: id }] },
    ];
    if (tab === 'exceptions') return [
      { collection: 'matchOperationalExceptions', filters: [{ field: 'matchId', value: id }] },
      { collection: 'reconciliationExceptions', filters: [{ field: 'matchId', value: id }] },
    ];
    if (tab === 'quality') return [{ collection: 'finalizations', filters: [{ field: 'matchId', value: id }] }];
    if (tab === 'provenance') return [
      { collection: 'finalizations', filters: [{ field: 'matchId', value: id }] },
      { collection: 'matchReports', filters: [{ field: 'matchId', value: id }] },
      { collection: 'resultSubmissions', filters: [{ field: 'matchId', value: id }] },
    ];
  }
  return [];
}

function encodeCursor(id: string) {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeCursor(value: string | null) {
  if (!value) return null;
  try { return Buffer.from(value, 'base64url').toString('utf8'); } catch { return null; }
}

function timeValue(value: unknown) {
  if (typeof value === 'object' && value && 'toMillis' in value && typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value !== 'string') return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function loadRelated(specs: RelatedQuery[]) {
  const snapshots = await Promise.all(specs.map(async (spec) => {
    let query: FirebaseFirestore.Query = adminDb.collection(spec.collection);
    for (const filter of spec.filters) query = query.where(filter.field, '==', filter.value);
    const snapshot = await query.limit(250).get();
    return snapshot.docs.map((document) => ({
      id: document.id,
      data: { ...document.data(), sourceCollection: spec.collection },
    } satisfies WorkbenchSourceRow));
  }));
  const deduplicated = new Map<string, WorkbenchSourceRow>();
  for (const item of snapshots.flat()) deduplicated.set(`${String(item.data.sourceCollection)}:${item.id}`, item);
  return [...deduplicated.values()].sort((left, right) => {
    const rightTime = timeValue(right.data.updatedAt ?? right.data.createdAt ?? right.data.issuedAt);
    const leftTime = timeValue(left.data.updatedAt ?? left.data.createdAt ?? left.data.issuedAt);
    return rightTime - leftTime || left.id.localeCompare(right.id);
  });
}

/** Server-owned, redacted and paginated read surface for all Platform entity workbenches. */
export async function GET(
  request: Request,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;
  const forbidden = requireRole(auth.actor, ['platform_admin', 'super_admin'], 'Platform Admin access required.');
  if (forbidden) return forbidden;
  const inactive = await requireActivePrincipal(auth.actor);
  if (inactive) return inactive;

  const [profile, access] = await Promise.all([
    adminDb.collection('users').doc(auth.actor.uid).get(),
    adminDb.collection('accessIndex').doc(accessIndexId('platform', 'global', auth.actor.uid)).get(),
  ]);
  const profileData = profile.data() ?? {};
  const accountClass = resolveAccountClass({
    accountClass: auth.actor.accountClass ?? profileData.accountClass,
    role: typeof auth.actor.role === 'string' ? auth.actor.role : profileData.role,
  });
  if (accountClass !== 'platform_operator') {
    return Response.json({ error: 'A dedicated Platform Operator account is required.' }, { status: 403 });
  }
  if (!indexGrantsCapability(access.data(), 'platform.audit.read')) {
    return Response.json({ error: 'Missing platform capability: platform.audit.read.' }, { status: 403 });
  }

  const { kind: requestedKind, id } = await context.params;
  const definition = getPlatformWorkbench(requestedKind);
  if (!definition) return Response.json({ error: 'Unsupported workbench.' }, { status: 404 });
  const kind = requestedKind as PlatformWorkbenchKind;
  const url = new URL(request.url);
  const requestedTab = url.searchParams.get('tab') ?? definition.tabs[0].id;
  const tab = definition.tabs.some((item) => item.id === requestedTab) ? requestedTab : definition.tabs[0].id;
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 30) || 30));

  try {
    const entitySnapshot = await adminDb.collection(ENTITY_COLLECTION[kind]).doc(id).get();
    if (!entitySnapshot.exists) return Response.json({ error: `${definition.eyebrow.replace(' workbench', '')} not found.` }, { status: 404 });
    const entity: WorkbenchSourceRow = { id, data: entitySnapshot.data() ?? {} };
    const related = await loadRelated(queriesFor(kind, tab, id, entity.data));
    const cursorId = decodeCursor(url.searchParams.get('cursor'));
    const cursorIndex = cursorId ? related.findIndex((item) => item.id === cursorId) : -1;
    const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    const page = related.slice(start, start + limit);
    const view = buildPlatformWorkbenchView({ kind, entityId: id, tab, entity, related: page });
    const hasMore = start + limit < related.length;
    return Response.json({
      view,
      total: related.length,
      nextCursor: hasMore && page.length ? encodeCursor(page[page.length - 1].id) : null,
    }, { headers: { 'cache-control': 'private, no-store' } });
  } catch {
    return Response.json({ error: 'The workbench data is temporarily unavailable.' }, { status: 503 });
  }
}
