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

async function loadSources(includeClosed = false) {
  const [applications, athletes, operationalExceptions, reconciliationExceptions, trustReports, payees, settlements, failedJobs] = await Promise.all([
    adminDb.collection('leagueAdminApplications').where('status', 'in', includeClosed ? ['approved', 'rejected', 'closed'] : ['submitted', 'pending', 'under_review', 'requested_information', 'needs_information']).get(),
    adminDb.collection('athletes').where('verificationStatus', 'in', includeClosed ? ['verified', 'rejected'] : ['pending', 'disputed']).get(),
    adminDb.collection('matchOperationalExceptions').where('status', 'in', includeClosed ? ['resolved', 'superseded', 'closed'] : ['open', 'acknowledged', 'escalated', 'pending']).get(),
    adminDb.collection('reconciliationExceptions').where('status', 'in', includeClosed ? ['resolved', 'superseded', 'closed'] : ['open', 'acknowledged', 'escalated', 'pending']).get(),
    adminDb.collection('reports').where('status', 'in', includeClosed ? ['resolved', 'dismissed', 'closed'] : ['open', 'investigating', 'escalated', 'pending']).get(),
    adminDb.collection('athletePayees').where('status', 'in', includeClosed ? ['verified', 'revoked', 'suspended'] : ['submitted', 'rejected']).get(),
    adminDb.collection('settlements').where('status', 'in', includeClosed ? ['released', 'completed', 'revoked'] : ['held', 'review_required']).get(),
    adminDb.collection('finalizations').where('status', '==', includeClosed ? 'completed' : 'failed').get(),
  ]);
  return {
    applications: rows(applications),
    athletes: rows(athletes),
    operationalExceptions: rows(operationalExceptions),
    reconciliationExceptions: rows(reconciliationExceptions),
    trustReports: rows(trustReports),
    payees: rows(payees),
    settlements: rows(settlements),
    failedJobs: rows(failedJobs),
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

  return Response.json({
    generatedAt: new Date().toISOString(),
    filter,
    total: filtered.length,
    counts,
    items,
    nextCursor: hasMore && items.length ? encodeCursor(items[items.length - 1]) : null,
  }, { headers: { 'cache-control': 'private, no-store' } });
}
