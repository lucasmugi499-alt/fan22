import { adminDb } from '@/lib/firebase/admin';
import { accessIndexId } from '@/lib/auth/access';
import { resolveAccountClass } from '@/lib/auth/accountClass';
import { indexGrantsCapability } from '@/server/access/capabilities';
import { requireActivePrincipal, requireAuthenticatedUser, requireRole } from '@/server/api/security';
import { buildEscalationRows, buildLiveIntegrityCards, type IntegritySourceRow } from '@/server/platform/integrity/integrityReadModel';

export const runtime = 'nodejs';

function rows(snapshot: FirebaseFirestore.QuerySnapshot): IntegritySourceRow[] {
  return snapshot.docs.map((document) => ({ id: document.id, data: document.data() }));
}

function chunks<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));
}

async function related(collection: string, matchIds: string[]) {
  if (!matchIds.length) return [];
  const snapshots = await Promise.all(chunks(matchIds, 30).map((ids) => adminDb.collection(collection).where('matchId', 'in', ids).get()));
  return snapshots.flatMap(rows);
}

async function platformGuard(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth;
  const forbidden = requireRole(auth.actor, ['platform_admin', 'super_admin'], 'Platform Admin access required.');
  if (forbidden) return { response: forbidden };
  const inactive = await requireActivePrincipal(auth.actor);
  if (inactive) return { response: inactive };
  const [profile, access] = await Promise.all([
    adminDb.collection('users').doc(auth.actor.uid).get(),
    adminDb.collection('accessIndex').doc(accessIndexId('platform', 'global', auth.actor.uid)).get(),
  ]);
  const data = profile.data() ?? {};
  const accountClass = resolveAccountClass({ accountClass: auth.actor.accountClass ?? data.accountClass, role: auth.actor.role ?? data.role });
  if (accountClass !== 'platform_operator') return { response: Response.json({ error: 'A dedicated Platform Operator account is required.' }, { status: 403 }) };
  if (!indexGrantsCapability(access.data(), 'platform.audit.read')) return { response: Response.json({ error: 'Missing platform capability: platform.audit.read.' }, { status: 403 }) };
  return { actor: auth.actor };
}

async function qualityCount(tier?: string) {
  const query = tier ? adminDb.collection('finalizations').where('dataQuality.tier', '==', tier) : adminDb.collection('finalizations');
  const snapshot = await query.count().get();
  return snapshot.data().count;
}

export async function GET(request: Request) {
  const guarded = await platformGuard(request);
  if ('response' in guarded) return guarded.response;
  const view = new URL(request.url).searchParams.get('view') ?? 'live';
  try {
    if (view === 'quality') {
      const [total, gold, silver, bronze, legacy, settings] = await Promise.all([
        qualityCount(), qualityCount('gold'), qualityCount('silver'), qualityCount('bronze'), qualityCount('legacy'),
        adminDb.collection('platformSettings').doc('global').get(),
      ]);
      const graded = gold + silver + bronze + legacy;
      return Response.json({
        view,
        distribution: { total, gold, silver, bronze, legacy, ungraded: Math.max(0, total - graded) },
        policyFloor: settings.data()?.capturePolicyFloor ?? 'POST_MATCH_ALLOWED',
        policyVersion: Number(settings.data()?.version ?? 0),
        provenance: 'finalizations.dataQuality.tier',
      }, { headers: { 'cache-control': 'private, no-store' } });
    }
    if (view === 'escalations') {
      const snapshot = await adminDb.collection('matchOperationalExceptions')
        .where('status', 'in', ['open', 'proposed', 'escalated', 'acknowledged', 'pending'])
        .get();
      const items = buildEscalationRows(rows(snapshot), new Date());
      return Response.json({ view, items, total: items.length }, { headers: { 'cache-control': 'private, no-store' } });
    }
    if (view !== 'live') return Response.json({ error: 'Unsupported integrity view.' }, { status: 400 });

    const matchSnapshot = await adminDb.collection('matches').where('status', '==', 'live').limit(90).get();
    const matches = rows(matchSnapshot);
    const matchIds = matches.map((match) => match.id);
    const [clocks, assignments, sessions, reports, exceptions] = await Promise.all([
      related('matchClockStates', matchIds),
      related('fieldManagerAssignments', matchIds),
      related('matchAccessSessions', matchIds),
      related('matchReports', matchIds),
      related('matchOperationalExceptions', matchIds),
    ]);
    return Response.json({
      view,
      generatedAt: new Date().toISOString(),
      cards: buildLiveIntegrityCards({ matches, clocks, assignments, sessions, reports, exceptions }),
    }, { headers: { 'cache-control': 'private, no-store' } });
  } catch {
    return Response.json({ error: 'Integrity operations are temporarily unavailable.' }, { status: 503 });
  }
}
