import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  const actor = token ? await adminAuth.verifyIdToken(token).catch(() => null) : null;
  if (!actor) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  if (!['team_admin', 'league_admin', 'platform_admin', 'super_admin'].includes(String(actor.role))) {
    return Response.json({ error: 'Team Admin access required.' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({})) as {
    teamId?: string;
    name?: string;
    position?: string;
    ageGroup?: 'U18' | 'U21' | 'Senior';
  };
  const name = body.name?.trim();
  const position = body.position?.trim();
  if (!body.teamId || !name || !position || !body.ageGroup) {
    return Response.json({ error: 'Team, name, position, and age group are required.' }, { status: 400 });
  }

  const team = await adminDb.collection('teams').doc(body.teamId).get();
  if (!team.exists) return Response.json({ error: 'Team not found.' }, { status: 404 });
  const teamData = team.data()!;
  const league = await adminDb.collection('leagues').doc(teamData.leagueId).get();
  const assigned = teamData.adminUserIds?.includes(actor.uid) || league.data()?.adminUserIds?.includes(actor.uid);
  if (!['platform_admin', 'super_admin'].includes(String(actor.role)) && !assigned) {
    return Response.json({ error: 'You are not assigned to this team.' }, { status: 403 });
  }

  const athleteRef = adminDb.collection('athletes').doc();
  await adminDb.runTransaction(async (transaction) => {
    transaction.set(athleteRef, {
      id: athleteRef.id,
      name,
      sport: teamData.sport,
      position,
      teamId: team.id,
      leagueId: teamData.leagueId,
      city: teamData.city,
      country: 'Uganda',
      ageGroup: body.ageGroup,
      bio: `${name} is building a verified sporting record with ${teamData.name}.`,
      verified: false,
      verificationStatus: 'pending',
      totalSupport: 0,
      supportersCount: 0,
      goalPlacePoints: 0,
      stats: {},
      impactNeeds: [],
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.set(adminDb.collection('adminAuditEvents').doc(), {
      actorUserId: actor.uid,
      action: 'created',
      targetCollection: 'athletes',
      targetId: athleteRef.id,
      note: `Pending athlete profile created for team ${team.id}.`,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return Response.json({ ok: true, id: athleteRef.id });
}
