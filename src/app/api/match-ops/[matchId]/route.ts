import { adminDb } from '@/lib/firebase/admin';
import { requireMatchOpsSession } from '@/server/matchOps/session';
import { buildMatchPackage } from '@/lib/matchOps/package';
import { normalizeAthleteIdentities } from '@/lib/athleteIdentity';
import type { Athlete, Match } from '@/types';

export const runtime = 'nodejs';

/**
 * The match package, cached on the device before kickoff.
 *
 * Read through the Admin SDK and assembled by an allow-list, never handed to the client as a
 * Firestore query. A Field Manager holds a bearer token, not an identity, so there is no
 * Rules-enforced boundary between them and the collection: the boundary is this function
 * deciding what to put in the response.
 */
export async function GET(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const auth = await requireMatchOpsSession(request, matchId);
  if ('response' in auth) return auth.response;

  const matchSnapshot = await adminDb.collection('matches').doc(matchId).get();
  if (!matchSnapshot.exists) return Response.json({ error: 'Match not found.' }, { status: 404 });
  const match = { id: matchSnapshot.id, ...matchSnapshot.data() } as Match;

  const [homeTeam, awayTeam, homeAthletes, awayAthletes] = await Promise.all([
    adminDb.collection('teams').doc(match.homeTeamId).get(),
    adminDb.collection('teams').doc(match.awayTeamId).get(),
    adminDb.collection('athletes').where('teamId', '==', match.homeTeamId).limit(60).get(),
    adminDb.collection('athletes').where('teamId', '==', match.awayTeamId).limit(60).get(),
  ]);

  const toAthletes = (snapshot: FirebaseFirestore.QuerySnapshot) =>
    normalizeAthleteIdentities(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Athlete));

  const pack = buildMatchPackage({
    match,
    homeTeamName: String(homeTeam.data()?.name ?? 'Home'),
    awayTeamName: String(awayTeam.data()?.name ?? 'Away'),
    homeAthletes: toAthletes(homeAthletes),
    awayAthletes: toAthletes(awayAthletes),
    // Changes whenever the League reissues, so a device can tell its cached copy is stale
    // rather than silently capturing against a roster that has moved on.
    packageVersion: String(matchSnapshot.updateTime?.toMillis() ?? Date.now()),
  });

  const clock = await adminDb.collection('matchClockStates').doc(matchId).get();

  return Response.json({
    ok: true,
    package: pack,
    clock: clock.exists ? clock.data() : null,
    sessionGeneration: auth.session.sessionGeneration,
  });
}
