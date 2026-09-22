import { adminDb } from '@/lib/firebase/admin';
import { resolveAccountClass } from '@/lib/auth/accountClass';
import { accessIndexId } from '@/lib/auth/access';
import { platformCaseMatchesFilter, type PlatformCase } from '@/lib/platform/platformCases';
import { indexGrantsCapability } from '@/server/access/capabilities';
import { requireActivePrincipal, requireAuthenticatedUser, requireRole } from '@/server/api/security';
import { assemblePlatformCases, type DeskSourceRow } from '@/server/platform/desk/platformDesk';

export const runtime = 'nodejs';

const FILTERS = new Set(['all', 'mine', 'applications', 'integrity', 'trust', 'money', 'history']);

function rows(snapshot: FirebaseFirestore.QuerySnapshot): DeskSourceRow[] {
  return snapshot.docs.map((document) => ({ id: document.id, data: document.data() }));
}

function encodeCursor(item: PlatformCase) {
  return Buffer.from(JSON.stringify({ id: item.id }), 'utf8').toString('base64url');
}

function decodeCursor(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { id?: unknown };
    return typeof parsed.id === 'string' ? parsed.id : null;
  } catch {
    return null;
  }
}

/**
 * How many documents one source contributes to a single desk read.
 *
 * The queue used to read every matching document in all eight collections and paginate the
 * result in memory. On the history filter that is every verified athlete on the platform —
 * a hundred thousand documents read to render thirty rows, on every page load. The cap
 * bounds the work; the exact totals below come from aggregation queries instead, so
 * bounding what is READ never makes the desk understate what is WAITING.
 */
const SOURCE_LIMIT = 200;

function sourceQueries(includeClosed: boolean) {
  return {
    applications: adminDb.collection('leagueAdminApplications').where('status', 'in', includeClosed ? ['approved', 'rejected', 'closed'] : ['submitted', 'pending', 'under_review', 'requested_information', 'needs_information']),
    athletes: adminDb.collection('athletes').where('verificationStatus', 'in', includeClosed ? ['verified', 'rejected'] : ['pending', 'disputed']),
    operationalExceptions: adminDb.collection('matchOperationalExceptions').where('status', 'in', includeClosed ? ['resolved', 'superseded', 'closed'] : ['open', 'acknowledged', 'escalated', 'pending']),
    reconciliationExceptions: adminDb.collection('reconciliationExceptions').where('status', 'in', includeClosed ? ['resolved', 'superseded', 'closed'] : ['open', 'acknowledged', 'escalated', 'pending']),
    trustReports: adminDb.collection('reports').where('status', 'in', includeClosed ? ['resolved', 'dismissed', 'closed'] : ['open', 'investigating', 'escalated', 'pending']),
    payees: adminDb.collection('athletePayees').where('status', 'in', includeClosed ? ['verified', 'revoked', 'suspended'] : ['submitted', 'rejected']),
    settlements: adminDb.collection('settlements').where('status', 'in', includeClosed ? ['released', 'completed', 'revoked'] : ['held', 'review_required']),
    failedJobs: adminDb.collection('finalizations').where('status', '==', includeClosed ? 'completed' : 'failed'),
  };
}

async function loadSources(includeClosed = false) {
  const queries = sourceQueries(includeClosed);
  const names = Object.keys(queries) as Array<keyof ReturnType<typeof sourceQueries>>;
  /*
   * Documents capped, totals exact. `count()` is an aggregation served by the same
   * single-field index the filter already uses, so the true size of each queue costs one
   * cheap query rather than reading the queue.
   */
  const [snapshots, totals] = await Promise.all([
    Promise.all(names.map((name) => queries[name].limit(SOURCE_LIMIT).get())),
    Promise.all(names.map((name) => queries[name].count().get().catch(() => null))),
  ]);

  const sourceTotals: Record<string, number> = {};
  let truncated = false;
  names.forEach((name, index) => {
    // A failed aggregation falls back to what was read, which can only understate, never
    // invent. That is the only case where a printed total could be short.
    const total = totals[index]?.data().count ?? snapshots[index].size;
    sourceTotals[name] = total;
    if (total > snapshots[index].size) truncated = true;
  });

  const read = (name: keyof ReturnType<typeof sourceQueries>) => rows(snapshots[names.indexOf(name)]);
  return {
    applications: read('applications'),
    athletes: read('athletes'),
    operationalExceptions: read('operationalExceptions'),
    reconciliationExceptions: read('reconciliationExceptions'),
    trustReports: read('trustReports'),
    payees: read('payees'),
    settlements: read('settlements'),
    failedJobs: read('failedJobs'),
    sourceTotals,
    truncated,
  };
}

/** One authenticated, complete open-case read model; pagination happens after normalization. */
export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const requestedFilter = url.searchParams.get('filter') ?? 'all';
  const filter = FILTERS.has(requestedFilter) ? requestedFilter : 'all';
  const search = (url.searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 100);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 30) || 30));

  let source;
  let deferrals: FirebaseFirestore.QuerySnapshot | null = null;
  try {
    [source, deferrals] = await Promise.all([
      loadSources(filter === 'history'),
      adminDb.collection('platformCaseDeferrals').where('userId', '==', auth.actor.uid).get(),
    ]);
  } catch {
    return Response.json({ error: 'The unified case queue is temporarily unavailable.' }, { status: 503 });
  }
  const now = new Date();
  const deferredIds = new Set((deferrals?.docs ?? [])
    .map((document) => document.data())
    .filter((data) => data.status === 'active' && typeof data.deferUntil === 'string' && Date.parse(data.deferUntil) > now.valueOf())
    .map((data) => String(data.caseId)));
  const all = assemblePlatformCases(source, now, { includeClosed: filter === 'history' });
  const filtered = all
    .filter((item) => filter === 'history' || !deferredIds.has(item.id))
    .filter((item) => platformCaseMatchesFilter(item, filter, auth.actor.uid))
    .filter((item) => !search || `${item.title} ${item.summary} ${item.waitingOn} ${item.kind}`.toLowerCase().includes(search));

  const cursorId = decodeCursor(url.searchParams.get('cursor'));
  const cursorIndex = cursorId ? filtered.findIndex((item) => item.id === cursorId) : -1;
  const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  const items = filtered.slice(start, start + limit);
  const hasMore = start + limit < filtered.length;
  const counts = all.reduce<Record<string, number>>((result, item) => {
    result[item.kind] = (result[item.kind] ?? 0) + 1;
    return result;
  }, {});

  /*
   * `total` and `counts` describe what was ASSEMBLED, which is now a capped read. When a
   * source is larger than its cap, the true size travels beside it: a desk that says "30
   * waiting" when a hundred thousand are waiting is worse than a slow desk.
   */
  return Response.json({
    generatedAt: new Date().toISOString(),
    filter,
    total: filtered.length,
    counts,
    sourceTotals: source.sourceTotals,
    truncated: source.truncated,
    items,
    nextCursor: hasMore && items.length ? encodeCursor(items[items.length - 1]) : null,
  }, { headers: { 'cache-control': 'private, no-store' } });
}
