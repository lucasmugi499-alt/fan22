import { FieldValue } from 'firebase-admin/firestore';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { parseJsonBody, requireAuthenticatedUser, requireRole } from '@/server/api/security';
import { accessIndexId, type PermissionCapability } from '@/lib/auth/access';
import { indexGrantsCapability } from '@/server/access/capabilities';
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
  capability: PermissionCapability,
) {
  // Routed through the shared check so an expired projection is refused here too, rather
  // than this route re-implementing the capability lookup without the expiry rule.
  return indexGrantsCapability(snapshot.data(), capability);
}

async function hasScopedAthleteCreateAccess(userId: string, teamId: string, leagueId: string) {
  const [teamAccess, leagueAccess, platformAccess] = await Promise.all([
    adminDb.collection('accessIndex').doc(accessIndexId('team', teamId, userId)).get(),
    adminDb.collection('accessIndex').doc(accessIndexId('league', leagueId, userId)).get(),
    adminDb.collection('accessIndex').doc(accessIndexId('platform', 'global', userId)).get(),
  ]);
  return indexHasCapability(teamAccess, 'team.athlete.create')
    || indexHasCapability(leagueAccess, 'league.roster.verify')
    // `platform.athlete.manage` rather than the team capability repeated at platform scope:
    // super_admin is governance and holds no `team.*` capabilities at all, so asking for the
    // team one here would lock super_admins out the moment the role bypass was removed.
    || indexHasCapability(platformAccess, 'platform.athlete.manage');
}

/**
 * The base URL for invitation links, from configuration only.
 *
 * This used to fall back to the request's `Origin` header. That is caller-controlled, so an
 * authenticated operator could send a request with a hostile origin and make GoalPlace's own
 * mail identity deliver an invitation pointing at a site they control — a phishing primitive
 * borrowed from the platform's credibility, whether or not the link itself grants anything.
 *
 * `GOALPLACE_APP_BASE_URL` is what App Hosting actually sets, which is why it is checked
 * first; `NEXT_PUBLIC_APP_URL` remains for local development. If neither is configured the
 * caller gets an error rather than a link built from whatever they sent.
 */
function publicBaseUrl() {
  const configured = process.env.GOALPLACE_APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!configured) {
    throw new Error('GOALPLACE_APP_BASE_URL is not configured, so invitation links cannot be generated.');
  }
  return configured.replace(/\/+$/, '');
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
  // Canonical only. `hasScopedAthleteCreateAccess` already resolves team, league and
  // platform scope from accessIndex; the legacy `adminUserIds` arm that used to sit beside
  // it could authorize an operator whose canonical assignment had been revoked, and the
  // Admin SDK bypasses the Rules that would have denied it.
  //
  // Verified before removal: all 16 league-admin and 100 team-admin legacy entries already
  // hold the canonical capability for their scope, so nobody loses access.
  // Platform authority resolves through a capability, not through the role string.
  //
  // This previously exempted anyone holding `platform_admin` or `super_admin` from the
  // scoped check entirely, so a Platform Admin could create an athlete under any team
  // without holding the capability that is supposed to authorize it — the same role-as-
  // capability shape the rest of this codebase has been removing. `platform.athlete.manage`
  // is held by both platform bundles, so this is narrower than the status quo, not stricter.
  const scoped = await hasScopedAthleteCreateAccess(actor.uid, team.id, teamData.leagueId);
  if (!scoped) {
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
    inviteUrl: new URL(actionUrl, publicBaseUrl()).toString(),
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
