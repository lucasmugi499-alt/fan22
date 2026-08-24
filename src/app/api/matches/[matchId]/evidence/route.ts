import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { hasLeagueCapabilityForTeam } from '@/server/access/leagueScope';
import { hasCapability } from '@/server/access/capabilities';
import { jsonError, requireAuthenticatedUser } from '@/server/api/security';

export const runtime = 'nodejs';

/**
 * Trusted read access to match evidence.
 *
 * Storage Rules grant evidence reads to the uploader and platform operators only. That
 * left the two parties the verification workflow actually depends on unable to see it:
 * the opposing Team Admin, who is asked to confirm or dispute the result, and the
 * assigned League Admin, who adjudicates the dispute. They were being asked to rule on
 * evidence they could not open.
 *
 * Access is granted here rather than by widening the Storage Rules, because the rule
 * would have to encode "is on the other team in this match", which requires reading the
 * match document and is exactly the kind of authority that belongs on the server.
 * Responses are short-lived signed reads, never durable public URLs.
 */

const READ_URL_TTL_SECONDS = 300;

async function canReadMatchEvidence(userId: string, role: unknown, matchId: string) {
  if (role === 'platform_admin' || role === 'super_admin') return true;

  const match = await adminDb.collection('matches').doc(matchId).get();
  if (!match.exists) return false;
  const data = match.data() ?? {};
  const teamIds = [data.homeTeamId, data.awayTeamId].filter((id): id is string => typeof id === 'string');

  /**
   * Either team in the fixture, resolved through the league that governs them.
   *
   * This used to ask each team scope for `team.result.submit` or `team.result.confirm`.
   * ADR-004 zeroed both, so the loop became an expensive way to return false. Evidence for a
   * fixture is visible to whoever can enter or adjudicate its result, which is the League.
   */
  for (const teamId of teamIds) {
    if (await hasLeagueCapabilityForTeam(userId, teamId, 'league.result.enter')) return true;
  }

  if (typeof data.leagueId === 'string') {
    const scope = { scopeType: 'league' as const, scopeId: data.leagueId };
    if (await hasCapability(userId, scope, 'league.result.resolve')) return true;
    if (await hasCapability(userId, scope, 'league.result.enter')) return true;
  }

  return false;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ matchId: string }> },
): Promise<Response> {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response ?? jsonError('Authentication required.', 401);

  const { matchId } = await context.params;
  if (!matchId) return jsonError('A match id is required.', 400);

  if (!await canReadMatchEvidence(auth.actor.uid, auth.actor.role, matchId)) {
    return jsonError('You are not authorized to review evidence for this match.', 403);
  }

  const snapshot = await adminDb.collection('mediaRecords')
    .where('kind', '==', 'match_evidence')
    .where('matchId', '==', matchId)
    .get();

  const bucket = adminStorage.bucket();
  const evidence = await Promise.all(snapshot.docs.map(async (document) => {
    const data = document.data();
    const [readUrl] = await bucket.file(String(data.storagePath)).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + READ_URL_TTL_SECONDS * 1000,
    }).catch(() => [null]);

    return {
      id: document.id,
      teamId: data.teamId ?? null,
      contentType: data.contentType ?? null,
      size: data.size ?? null,
      moderationStatus: data.moderationStatus ?? 'pending_review',
      uploadedByUserId: data.actorUserId ?? null,
      createdAt: data.createdAt ?? null,
      readUrl,
      expiresInSeconds: READ_URL_TTL_SECONDS,
    };
  }));

  return Response.json({ matchId, evidence }, { headers: { 'cache-control': 'no-store' } });
}
