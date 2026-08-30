import { adminDb } from '@/lib/firebase/admin';
import { hasCapabilityOrPlatformGrant } from '@/server/access/capabilities';
import { requireActivePrincipal, requireAuthenticatedUser } from '@/server/api/security';
import { buildLeagueCommand } from '@/lib/league/operations';
import type { Match, Team } from '@/types';

export const runtime = 'nodejs';

/**
 * The League Command Centre read model.
 *
 * Assembled on the server because the pieces a League Admin needs on a matchday do not live in
 * one place and two of them are not client-readable at all: Field Manager assignments carry
 * access windows and session state, and operational exceptions are restricted to the governing
 * league. A client that tried to build this picture would either be denied or would show a
 * confident half-answer, which on a matchday is worse than showing nothing.
 *
 * Read-only. Every action this surface offers is a separate trusted command.
 */

/** Bounded so one league's busy weekend cannot pull an unbounded read. */
const MATCH_WINDOW_DAYS = 21;
const MATCH_LIMIT = 200;

/**
 * The cap for the whole-season read.
 *
 * A twenty-club double round robin is 380 fixtures, so this holds a full season for any league
 * this platform is built for. Past it the response says it was truncated rather than presenting
 * a slice as the season.
 */
const FULL_MATCH_LIMIT = 500;

/**
 * How much of the league's schedule to return.
 *
 * `window` is the matchday picture the Command Centre needs: three weeks either side of now,
 * bounded, and the only thing that surface reads. `season` is everything, and exists because
 * the Matches workspace is not a matchday view — it is where a League Admin goes to find a
 * fixture, and one filtered to three weeks either side of today showed a league with 146
 * fixtures four segments all reading zero. Nothing on the screen said it was windowed, so
 * publishing a schedule and seeing no change was indistinguishable from the publish failing.
 */
type Scope = 'window' | 'season';

function iso(value: unknown): string | null {
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;
  const inactive = await requireActivePrincipal(auth.actor);
  if (inactive) return inactive;

  const leagueId = new URL(request.url).searchParams.get('leagueId')?.trim();
  if (!leagueId) {
    return Response.json({ error: 'A league is required.' }, { status: 400 });
  }

  /*
   * Capability is checked against this specific league rather than against the role, so a
   * League Admin of one league cannot read another's operational picture by changing the
   * query parameter.
   */
  const permitted = await hasCapabilityOrPlatformGrant(
    auth.actor.uid,
    { scopeType: 'league', scopeId: leagueId },
    'league.fixture.manage',
  );
  if (!permitted) {
    return Response.json({ error: 'You do not administer this league.' }, { status: 403 });
  }

  const now = new Date();
  const scope: Scope = new URL(request.url).searchParams.get('scope') === 'season' ? 'season' : 'window';
  const windowStart = new Date(now.getTime() - MATCH_WINDOW_DAYS * 86_400_000).toISOString();
  const windowEnd = new Date(now.getTime() + MATCH_WINDOW_DAYS * 86_400_000).toISOString();

  /*
   * Newest first for the season read, so a truncated response holds the most recent fixtures
   * rather than the oldest. Both queries are served by the existing
   * (leagueId ASC, scheduledAt ASC) composite index, which Firestore also traverses in reverse.
   */
  const matchQuery = scope === 'season'
    ? adminDb.collection('matches')
      .where('leagueId', '==', leagueId)
      .orderBy('scheduledAt', 'desc')
      .limit(FULL_MATCH_LIMIT)
    : adminDb.collection('matches')
      .where('leagueId', '==', leagueId)
      .where('scheduledAt', '>=', windowStart)
      .where('scheduledAt', '<=', windowEnd)
      .limit(MATCH_LIMIT);

  const [matchSnapshot, teamSnapshot] = await Promise.all([
    matchQuery.get(),
    adminDb.collection('teams').where('leagueId', '==', leagueId).limit(200).get(),
  ]);

  const matches = matchSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Match);
  /*
   * `>=`, not `>`. Firestore returning exactly as many documents as it was asked for gives no
   * way to know whether more existed, and treating that as complete is how a list quietly
   * becomes a slice.
   */
  const truncated = matches.length >= (scope === 'season' ? FULL_MATCH_LIMIT : MATCH_LIMIT);
  const teams = teamSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Team);

  /*
   * Assignments and exceptions are read for the matches actually in the window rather than for
   * the whole league. Firestore caps `in` at thirty values, so the ids are chunked.
   */
  const matchIds = matches.map((match) => match.id);
  const chunks: string[][] = [];
  for (let index = 0; index < matchIds.length; index += 30) {
    chunks.push(matchIds.slice(index, index + 30));
  }

  const [assignmentChunks, exceptionChunks] = await Promise.all([
    Promise.all(chunks.map((chunk) => adminDb.collection('fieldManagerAssignments')
      .where('matchId', 'in', chunk).get().catch(() => null))),
    Promise.all(chunks.map((chunk) => adminDb.collection('matchOperationalExceptions')
      .where('matchId', 'in', chunk)
      .where('status', 'in', ['open', 'acknowledged', 'escalated', 'pending'])
      .get().catch(() => null))),
  ]);

  /*
   * Field Manager display names live on the `fieldManagers` record, not the assignment, so the
   * names are resolved in one pass rather than per row.
   */
  const assignmentDocs = assignmentChunks.flatMap((snapshot) => snapshot?.docs ?? []);
  const fieldManagerIds = [...new Set(assignmentDocs
    .map((doc) => doc.data().fieldManagerId)
    .filter((value): value is string => typeof value === 'string'))];
  const fieldManagerDocs = await Promise.all(fieldManagerIds
    .map((id) => adminDb.collection('fieldManagers').doc(id).get().catch(() => null)));
  const nameById = new Map(fieldManagerDocs
    .filter((doc): doc is NonNullable<typeof doc> => Boolean(doc?.exists))
    .map((doc) => [doc.id, String(doc.data()?.displayName ?? '')]));

  const assignmentsByMatchId: Record<string, { displayName: string | null; lastSyncAt: string | null; status: string }> = {};
  for (const doc of assignmentDocs) {
    const data = doc.data();
    const matchId = typeof data.matchId === 'string' ? data.matchId : null;
    if (!matchId) continue;
    assignmentsByMatchId[matchId] = {
      displayName: nameById.get(String(data.fieldManagerId ?? '')) || null,
      // The last observed sync, never an assumed one. See fieldManagerPresence.
      lastSyncAt: iso(data.lastSyncAt ?? data.lastHeartbeatAt),
      status: String(data.status ?? 'assigned'),
    };
  }

  const openExceptionMatchIds = [...new Set(exceptionChunks
    .flatMap((snapshot) => snapshot?.docs ?? [])
    .map((doc) => String(doc.data().matchId ?? ''))
    .filter(Boolean))];

  const [registrationIssues, unclaimed] = await Promise.all([
    adminDb.collection('athletes')
      .where('leagueId', '==', leagueId)
      .where('verificationStatus', 'in', ['pending', 'disputed'])
      .count().get().then((snapshot) => snapshot.data().count).catch(() => 0),
    adminDb.collection('athletes')
      .where('leagueId', '==', leagueId)
      .where('claimStatus', '==', 'unclaimed')
      .count().get().then((snapshot) => snapshot.data().count).catch(() => 0),
  ]);

  const model = buildLeagueCommand({
    matches,
    teams,
    assignmentsByMatchId,
    openExceptionMatchIds,
    registrationIssueCount: registrationIssues,
    unclaimedAthleteCount: unclaimed,
    now: now.toISOString(),
  });

  return Response.json(
    { leagueId, generatedAt: now.toISOString(), scope, truncated, ...model },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}
