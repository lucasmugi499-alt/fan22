import { FieldValue } from 'firebase-admin/firestore';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { parseJsonBody, requireAuthenticatedUser, requireRole } from '@/server/api/security';
import { accessIndexId } from '@/lib/auth/access';
import { sendAthleteInvitationEmail } from '@/server/email/athleteInvitation';

export const runtime = 'nodejs';

const athleteCreateSchema = z.object({
  teamId: z.string().trim().min(1).max(180),
  name: z.string().trim().min(2).max(160),
  position: z.string().trim().min(1).max(80),
  ageGroup: z.enum(['U18', 'U21', 'Senior']),
  invitedEmail: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
});

function indexHasCapability(
  snapshot: FirebaseFirestore.DocumentSnapshot,
  capability: 'team.athlete.create' | 'league.roster.verify',
) {
  const capabilities = snapshot.data()?.capabilities;
  return Array.isArray(capabilities) && capabilities.includes(capability);
}

async function hasScopedAthleteCreateAccess(userId: string, teamId: string, leagueId: string) {
  const [teamAccess, leagueAccess, platformAccess] = await Promise.all([
    adminDb.collection('accessIndex').doc(accessIndexId('team', teamId, userId)).get(),
    adminDb.collection('accessIndex').doc(accessIndexId('league', leagueId, userId)).get(),
    adminDb.collection('accessIndex').doc(accessIndexId('platform', 'global', userId)).get(),
  ]);
  return indexHasCapability(teamAccess, 'team.athlete.create')
    || indexHasCapability(leagueAccess, 'league.roster.verify')
    || indexHasCapability(platformAccess, 'team.athlete.create');
}

function publicBaseUrl(request: Request) {
  return process.env.NEXT_PUBLIC_APP_URL
    ?? request.headers.get('origin')
    ?? new URL(request.url).origin;
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;
  const forbidden = requireRole(auth.actor, ['team_admin', 'league_admin', 'platform_admin', 'super_admin'], 'Team Admin access required.');
  if (forbidden) return forbidden;

  const parsed = await parseJsonBody(request, athleteCreateSchema, { maxBytes: 4 * 1024 });
  if ('response' in parsed) return Response.json({ error: 'Team, name, position, and age group are required.' }, { status: parsed.response.status });

  const actor = auth.actor;
  const { teamId, name, position, ageGroup, invitedEmail } = parsed.data;
  const team = await adminDb.collection('teams').doc(teamId).get();
  if (!team.exists) return Response.json({ error: 'Team not found.' }, { status: 404 });
  const teamData = team.data()!;
  const league = await adminDb.collection('leagues').doc(teamData.leagueId).get();
  const assigned = teamData.adminUserIds?.includes(actor.uid) || league.data()?.adminUserIds?.includes(actor.uid);
  const scoped = await hasScopedAthleteCreateAccess(actor.uid, team.id, teamData.leagueId);
  if (!['platform_admin', 'super_admin'].includes(String(actor.role)) && !assigned && !scoped) {
    return Response.json({ error: 'You are not assigned to this team.' }, { status: 403 });
  }

  const athleteRef = adminDb.collection('athletes').doc();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const actionUrl = `/register?next=${encodeURIComponent(`/athletes/${athleteRef.id}?claim=${encodeURIComponent(token)}`)}`;
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
      invitedEmail,
      invitationTokenHash: tokenHash,
      invitationActionUrl: actionUrl,
      invitationExpiresAt: expiresAt,
      createdByUserId: actor.uid,
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
  const email = await sendAthleteInvitationEmail({
    to: invitedEmail,
    inviteUrl: new URL(actionUrl, publicBaseUrl(request)).toString(),
    athleteName: name,
    teamName: String(teamData.name ?? team.id),
    inviterName: String(actor.name ?? actor.email ?? 'your Team Admin'),
    expiresAt,
    athleteId: athleteRef.id,
  });
  await athleteRef.set({
    emailProvider: 'resend',
    emailDelivery: email.status,
    ...(email.id ? {
      emailMessageId: email.id,
      emailSentAt: FieldValue.serverTimestamp(),
    } : {}),
    ...(email.error ? { emailError: email.error.slice(0, 500) } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return Response.json({
    ok: true,
    id: athleteRef.id,
    actionUrl,
    emailDelivery: email.status,
    emailMessageId: email.id,
    emailError: email.error,
  });
}
