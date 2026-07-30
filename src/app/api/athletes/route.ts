import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { parseJsonBody, requireAuthenticatedUser, requireRole } from '@/server/api/security';

export const runtime = 'nodejs';

const athleteCreateSchema = z.object({
  teamId: z.string().trim().min(1).max(180),
  name: z.string().trim().min(2).max(160),
  position: z.string().trim().min(1).max(80),
  ageGroup: z.enum(['U18', 'U21', 'Senior']),
});

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;
  const forbidden = requireRole(auth.actor, ['team_admin', 'league_admin', 'platform_admin', 'super_admin'], 'Team Admin access required.');
  if (forbidden) return forbidden;

  const parsed = await parseJsonBody(request, athleteCreateSchema, { maxBytes: 4 * 1024 });
  if ('response' in parsed) return Response.json({ error: 'Team, name, position, and age group are required.' }, { status: parsed.response.status });

  const actor = auth.actor;
  const { teamId, name, position, ageGroup } = parsed.data;
  const team = await adminDb.collection('teams').doc(teamId).get();
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
      ageGroup,
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
