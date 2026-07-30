import { createHash, randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { parseJsonBody, requireAuthenticatedUser, requireRole, type AuthenticatedActor } from '@/server/api/security';
import { sendTeamInvitationEmail } from '@/server/email/teamInvitation';

export const runtime = 'nodejs';

function audit(
  actorUserId: string,
  action: string,
  targetCollection: string,
  targetId: string,
  note?: string,
) {
  return {
    actorUserId,
    action,
    targetCollection,
    targetId,
    ...(note ? { note } : {}),
    createdAt: FieldValue.serverTimestamp(),
  };
}

function hasRole(actor: AuthenticatedActor, roles: string[]) {
  return roles.includes(String(actor.role));
}

function publicBaseUrl(request: Request) {
  return process.env.GOALPLACE_APP_BASE_URL
    ?? process.env.NEXT_PUBLIC_APP_URL
    ?? new URL(request.url).origin;
}

function slugPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'league';
}

const adminActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_league'),
    name: z.string().trim().min(3).max(120),
    sport: z.enum(['football', 'basketball', 'rugby']),
    city: z.string().trim().min(2).max(100),
    description: z.string().trim().max(1000).optional().default(''),
    status: z.enum(['draft', 'community', 'verified', 'partner', 'suspended']).optional().default('community'),
    plan: z.enum(['free', 'pro', 'partner']).optional().default('free'),
  }),
  z.object({
    action: z.literal('create_team_invitation'),
    teamId: z.string().trim().min(1).max(160),
    leagueId: z.string().trim().min(1).max(160),
    seasonId: z.string().trim().min(1).max(160),
    invitedEmail: z.string().trim().email().max(200).transform((value) => value.toLowerCase()),
  }),
  z.object({
    action: z.literal('create_teams'),
    teams: z.array(z.object({
      id: z.string().trim().min(1).max(160),
      name: z.string().trim().min(2).max(120),
      sport: z.union([z.enum(['football', 'basketball', 'rugby']), z.enum(['Football', 'Basketball', 'Rugby'])]),
      leagueId: z.string().trim().min(1).max(160),
      city: z.string().trim().min(2).max(100),
      location: z.string().trim().max(160).optional(),
      country: z.literal('Uganda'),
      description: z.string().trim().max(1000),
      plan: z.enum(['free', 'pro']),
      verified: z.boolean(),
      adminUserIds: z.array(z.string()).default([]),
      totalSupport: z.number().nonnegative(),
      supportersCount: z.number().nonnegative(),
      wins: z.number().nonnegative(),
      draws: z.number().nonnegative().optional(),
      losses: z.number().nonnegative(),
      pointsFor: z.number().nonnegative(),
      pointsAgainst: z.number().nonnegative(),
      leaguePoints: z.number().nonnegative(),
      verificationStatus: z.enum(['pending', 'verified', 'rejected', 'disputed']).optional(),
      teamAdminEmail: z.string().trim().email().optional(),
      createdAt: z.string().optional(),
    })).min(1).max(40),
  }),
  z.object({
    action: z.literal('update_league_profile'),
    leagueId: z.string().trim().min(1).max(160),
    name: z.string().trim().min(3).max(120).optional(),
    city: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(1000).optional(),
    status: z.enum(['draft', 'community', 'verified', 'partner', 'suspended']).optional(),
    plan: z.enum(['free', 'pro', 'partner']).optional(),
    verified: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('review_approval'),
    targetCollection: z.enum(['athletes', 'leagues', 'leagueAdminApplications']),
    targetId: z.string().trim().min(1).max(160),
    decision: z.enum(['approved', 'rejected', 'requested_information']),
    note: z.string().trim().max(1200).optional().default(''),
  }),
  z.object({
    action: z.literal('revoke_team_assignment'),
    assignmentId: z.string().trim().min(1).max(160),
    note: z.string().trim().max(1200).optional().default(''),
  }),
  z.object({
    action: z.literal('resolve_report'),
    reportId: z.string().trim().min(1).max(160),
    decision: z.enum(['resolved', 'dismissed']),
    note: z.string().trim().max(1200).optional().default(''),
  }),
]);

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;

  const parsed = await parseJsonBody(request, adminActionSchema, { maxBytes: 64 * 1024 });
  if ('response' in parsed) return parsed.response;

  const actor = auth.actor;
  const body = parsed.data;

  try {
    if (body.action === 'create_league') {
      const forbidden = requireRole(actor, ['platform_admin', 'super_admin'], 'Platform Admin access required.');
      if (forbidden) return forbidden;
      const now = new Date();
      const year = now.getUTCFullYear();
      const unique = createHash('sha256')
        .update(`${body.name}:${body.city}:${body.sport}:${actor.uid}:${now.toISOString()}`)
        .digest('hex')
        .slice(0, 8);
      const leagueId = `league_${slugPart(body.name)}_${unique}`;
      const seasonId = `season_${leagueId}_${year}`;
      await adminDb.runTransaction(async (transaction) => {
        transaction.set(adminDb.collection('leagues').doc(leagueId), {
          id: leagueId,
          name: body.name,
          sport: body.sport,
          city: body.city,
          country: 'Uganda',
          description: body.description,
          status: body.status,
          plan: body.plan,
          verified: body.status === 'verified' || body.status === 'partner',
          adminUserIds: [],
          season: `${year} Season`,
          currentSeasonId: seasonId,
          teamsCount: 0,
          athletesCount: 0,
          matchesCount: 0,
          matchCompletionRate: 0,
          verifiedResultsRate: 0,
          goalPlaceIndex: 45,
          ranking: 1,
          totalSupport: 0,
          supportersCount: 0,
          verificationRules: {
            requiresLeagueAdminApproval: true,
            requiresRefereeConfirmation: false,
            allowsPerformancePledges: true,
          },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(adminDb.collection('seasons').doc(seasonId), {
          id: seasonId,
          leagueId,
          name: `${year} Season`,
          sport: body.sport,
          status: 'registration',
          startDate: now.toISOString().slice(0, 10),
          competitionFormat: 'league',
          scoring: body.sport === 'basketball'
            ? { win: 2, draw: null, loss: 0 }
            : body.sport === 'rugby'
              ? { win: 4, draw: 2, loss: 0 }
              : { win: 3, draw: 1, loss: 0 },
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.set(adminDb.collection('adminAuditEvents').doc(), audit(
          actor.uid,
          'created',
          'leagues',
          leagueId,
          `Created ${body.name} from Platform Admin console.`,
        ));
      });
      return Response.json({ ok: true, id: leagueId, seasonId });
    }

    if (body.action === 'update_league_profile') {
      const forbidden = requireRole(actor, ['platform_admin', 'super_admin'], 'Platform Admin access required.');
      if (forbidden) return forbidden;
      const { leagueId } = body;
      const updates = {
        name: body.name,
        city: body.city,
        description: body.description,
        status: body.status,
        plan: body.plan,
        verified: body.verified,
      };
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, value]) => value !== undefined),
      );
      if (!Object.keys(cleanUpdates).length) {
        return Response.json({ error: 'Provide at least one league field to update.' }, { status: 400 });
      }
      const leagueRef = adminDb.collection('leagues').doc(leagueId);
      await adminDb.runTransaction(async (transaction) => {
        const league = await transaction.get(leagueRef);
        if (!league.exists) throw new Error('League not found.');
        transaction.update(leagueRef, {
          ...cleanUpdates,
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(adminDb.collection('adminAuditEvents').doc(), audit(
          actor.uid,
          'updated',
          'leagues',
          leagueId,
          'Updated league profile from Platform Admin console.',
        ));
      });
      return Response.json({ ok: true, id: leagueId });
    }

    if (body.action === 'create_team_invitation') {
      const forbidden = requireRole(actor, ['league_admin', 'platform_admin', 'super_admin'], 'League Admin access required.');
      if (forbidden) return forbidden;
      const { teamId, leagueId, seasonId, invitedEmail } = body;
      const league = await adminDb.collection('leagues').doc(leagueId).get();
      const leagueData = league.data();
      if (
        !hasRole(actor, ['platform_admin', 'super_admin'])
        && !leagueData?.adminUserIds?.includes(actor.uid)
      ) {
        return Response.json({ error: 'You do not manage this league.' }, { status: 403 });
      }
      const team = await adminDb.collection('teams').doc(teamId).get();
      const teamData = team.data();
      if (!team.exists || teamData?.leagueId !== leagueId) {
        return Response.json({ error: 'The selected team does not belong to this league.' }, { status: 409 });
      }
      const season = await adminDb.collection('seasons').doc(seasonId).get();
      const seasonData = season.data();

      const invitationKey = createHash('sha256')
        .update(`${leagueId}:${seasonId}:${teamId}:${invitedEmail}`)
        .digest('hex')
        .slice(0, 32);
      const invitationRef = adminDb.collection('teamAssignments').doc(`invite_${invitationKey}`);
      const token = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const actionUrl = `/invitations/team/${invitationRef.id}?token=${encodeURIComponent(token)}`;
      await adminDb.runTransaction(async (transaction) => {
        const existing = await transaction.get(invitationRef);
        if (
          existing.exists
          && ['invited', 'active'].includes(String(existing.data()?.status))
          && (!existing.data()?.expiresAt || Date.parse(existing.data()!.expiresAt) > Date.now())
        ) {
          throw new Error('An active invitation already exists for this email, team, and season.');
        }
        transaction.set(invitationRef, {
          id: invitationRef.id,
          userId: '',
          teamId,
          leagueId,
          seasonId,
          role: 'team_admin',
          status: 'invited',
          invitedByUserId: actor.uid,
          invitedEmail,
          tokenHash,
          expiresAt,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(adminDb.collection('adminAuditEvents').doc(), audit(
          actor.uid,
          'invited',
          'teamAssignments',
          invitationRef.id,
          `Invitation expires ${expiresAt}.`,
        ));
      });
      const email = await sendTeamInvitationEmail({
        to: invitedEmail,
        inviteUrl: new URL(actionUrl, publicBaseUrl(request)).toString(),
        assignmentId: invitationRef.id,
        teamName: String(teamData?.name ?? teamId),
        leagueName: String(leagueData?.name ?? leagueId),
        seasonName: String(seasonData?.name ?? seasonId),
        inviterName: String(actor.name ?? actor.email ?? 'your League Admin'),
        expiresAt,
      });
      await invitationRef.set({
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
        id: invitationRef.id,
        token,
        expiresAt,
        actionUrl,
        emailDelivery: email.status,
        emailMessageId: email.id,
        emailError: email.error,
      });
    }

    if (body.action === 'create_teams') {
      const forbidden = requireRole(actor, ['league_admin', 'platform_admin', 'super_admin'], 'League Admin access required.');
      if (forbidden) return forbidden;
      const leagueIds = [...new Set(body.teams.map((team) => team.leagueId))];
      const leagueSnapshots = await Promise.all(leagueIds.map((leagueId) => adminDb.collection('leagues').doc(leagueId).get()));
      const leagueById = new Map(leagueSnapshots.map((snapshot) => [snapshot.id, snapshot]));
      for (const leagueId of leagueIds) {
        const league = leagueById.get(leagueId);
        if (!league?.exists) return Response.json({ error: `League ${leagueId} not found.` }, { status: 404 });
        if (
          !hasRole(actor, ['platform_admin', 'super_admin'])
          && !league.data()?.adminUserIds?.includes(actor.uid)
        ) {
          return Response.json({ error: `You do not manage league ${leagueId}.` }, { status: 403 });
        }
      }
      await adminDb.runTransaction(async (transaction) => {
        const teamRefs = body.teams.map((team) => adminDb.collection('teams').doc(team.id));
        const existingTeams = await Promise.all(teamRefs.map((teamRef) => transaction.get(teamRef)));
        existingTeams.forEach((existing, index) => {
          if (existing.exists) throw new Error(`Team ${body.teams[index].name} already exists.`);
        });
        for (const [index, team] of body.teams.entries()) {
          const teamRef = teamRefs[index];
          transaction.set(teamRef, {
            ...team,
            adminUserIds: [],
            createdAt: team.createdAt ?? FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          transaction.update(adminDb.collection('leagues').doc(team.leagueId), {
            teamsCount: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        transaction.set(adminDb.collection('adminAuditEvents').doc(), audit(
          actor.uid,
          'created',
          'teams',
          body.teams[0].id,
          `Created ${body.teams.length} team(s) by trusted League Admin workflow.`,
        ));
      });
      return Response.json({ ok: true, id: body.teams[0].id, count: body.teams.length });
    }

    if (body.action === 'review_approval') {
      const forbidden = requireRole(actor, ['platform_admin', 'super_admin'], 'Platform Admin access required.');
      if (forbidden) return forbidden;
      const { targetCollection, targetId, decision, note } = body;
      if (targetCollection === 'leagueAdminApplications' && decision === 'approved') {
        return Response.json({ error: 'League Admin approval uses the access workflow.' }, { status: 409 });
      }
      const targetRef = adminDb.collection(targetCollection).doc(targetId);
      await adminDb.runTransaction(async (transaction) => {
        const target = await transaction.get(targetRef);
        if (!target.exists) throw new Error('Target record not found.');
        const update = targetCollection === 'athletes'
          ? { verified: decision === 'approved', verificationStatus: decision === 'approved' ? 'verified' : 'pending' }
          : targetCollection === 'leagues'
            ? { verified: decision === 'approved', status: decision === 'approved' ? 'verified' : 'draft' }
            : {
                status: decision === 'requested_information' ? 'needs_information' : decision,
                reviewedByUserId: actor.uid,
              };
        transaction.update(targetRef, { ...update, updatedAt: FieldValue.serverTimestamp() });
        transaction.set(adminDb.collection('adminAuditEvents').doc(), audit(
          actor.uid,
          decision,
          targetCollection,
          targetId,
          note,
        ));
      });
      return Response.json({ ok: true, id: targetId });
    }

    if (body.action === 'revoke_team_assignment') {
      const forbidden = requireRole(actor, ['platform_admin', 'super_admin'], 'Platform Admin access required.');
      if (forbidden) return forbidden;
      const { assignmentId, note } = body;
      const assignmentRef = adminDb.collection('teamAssignments').doc(assignmentId);
      await adminDb.runTransaction(async (transaction) => {
        const assignment = await transaction.get(assignmentRef);
        if (!assignment.exists) throw new Error('Team assignment not found.');
        if (assignment.data()?.status === 'revoked') throw new Error('Team assignment is already revoked.');
        transaction.update(assignmentRef, {
          status: 'revoked',
          revokedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(adminDb.collection('adminAuditEvents').doc(), audit(
          actor.uid,
          'revoked',
          'teamAssignments',
          assignmentId,
          note,
        ));
      });
      return Response.json({ ok: true, id: assignmentId });
    }

    if (body.action === 'resolve_report') {
      const forbidden = requireRole(actor, ['platform_admin', 'super_admin'], 'Platform Admin access required.');
      if (forbidden) return forbidden;
      const { reportId, decision, note } = body;
      const reportRef = adminDb.collection('reports').doc(reportId);
      await adminDb.runTransaction(async (transaction) => {
        const report = await transaction.get(reportRef);
        if (!report.exists) throw new Error('Report not found.');
        transaction.update(reportRef, {
          status: decision,
          updatedAt: FieldValue.serverTimestamp(),
          ...(note ? { actionHistory: FieldValue.arrayUnion(note) } : {}),
        });
        transaction.set(adminDb.collection('adminAuditEvents').doc(), audit(
          actor.uid,
          decision,
          'reports',
          reportId,
          note,
        ));
      });
      return Response.json({ ok: true, id: reportId });
    }

    return Response.json({ error: 'Unsupported admin action.' }, { status: 400 });
  } catch (error) {
    console.error('Trusted admin action failed', error);
    return Response.json({
      error: error instanceof Error ? error.message : 'The trusted action failed.',
    }, { status: 500 });
  }
}
