import { adminDb } from '@/lib/firebase/admin';
import { hasCapabilityOrPlatformGrant } from '@/server/access/capabilities';
import { requireActivePrincipal, requireAuthenticatedUser } from '@/server/api/security';
import type { Match } from '@/types';

export const runtime = 'nodejs';

/**
 * What has happened to a fixture, for the people who run it.
 *
 * Scoped to the governing league and read-only. This exists so the match page can show a
 * readable timeline instead of pushing a League Admin into the raw audit trail for an ordinary
 * question like "why did this move".
 */
export async function GET(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;
  const inactive = await requireActivePrincipal(auth.actor);
  if (inactive) return inactive;

  const matchSnapshot = await adminDb.collection('matches').doc(matchId).get();
  if (!matchSnapshot.exists) return Response.json({ error: 'Match not found.' }, { status: 404 });
  const match = { id: matchSnapshot.id, ...matchSnapshot.data() } as Match;

  const permitted = await hasCapabilityOrPlatformGrant(
    auth.actor.uid,
    { scopeType: 'league', scopeId: match.leagueId },
    'league.fixture.manage',
  );
  if (!permitted) {
    return Response.json({ error: 'You do not administer this league.' }, { status: 403 });
  }

  const snapshot = await adminDb.collection('matchScheduleChanges')
    .where('matchId', '==', matchId)
    .limit(50)
    .get()
    .catch(() => null);

  const changes = (snapshot?.docs ?? [])
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((left, right) =>
      Date.parse(String((right as { createdAt?: string }).createdAt ?? '')) -
      Date.parse(String((left as { createdAt?: string }).createdAt ?? '')));

  return Response.json({ matchId, changes }, { headers: { 'cache-control': 'private, no-store' } });
}
