import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { parseJsonBody, requireAuthenticatedUser, requireRole } from '@/server/api/security';
import { sendTeamInvitationEmail } from '@/server/email/teamInvitation';
import { platformAuditEvent, secureLeagueCommand, securePlatformCommand } from '@/server/platform/commands/securePlatformCommand';
import type {
  AccessAssignment,
  AccessAssignmentStatus,
  PermissionCapability,
} from '@/lib/auth/access';
import { hasCapabilityOrPlatformGrant } from '@/server/access/capabilities';
import { normalizeAccessAssignment, readScopeProjection, rebuildUserProjections } from '@/server/access/projector';

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

function transitionPatch(status: AccessAssignmentStatus, nowIso: string, note?: string) {
  const base = {
    status,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (status === 'active') {
    return {
      ...base,
      suspendedAt: FieldValue.delete(),
      revokedAt: FieldValue.delete(),
      revocationReason: FieldValue.delete(),
      validUntil: FieldValue.delete(),
    };
  }
  if (status === 'suspended') {
    return {
      ...base,
      suspendedAt: FieldValue.serverTimestamp(),
    };
  }
  if (status === 'revoked') {
    return {
      ...base,
      revokedAt: FieldValue.serverTimestamp(),
      revocationReason: note ?? 'Revoked by Platform Admin.',
    };
  }
  return {
    ...base,
    validUntil: nowIso,
  };
}

/**
 * The league capability on that exact league, or the platform-global operating grant.
 *
 * The platform fallback is `platform.admin.manage`, not the league capability repeated. A
 * super_admin holds no league.* capabilities at all — governance, not operations — so
 * asking for the same capability at platform scope would have locked super_admins out the
 * moment the surrounding role bypass was removed.
 */
async function hasScopedLeagueCapability(userId: string, leagueId: string, capability: PermissionCapability) {
  return hasCapabilityOrPlatformGrant(userId, { scopeType: 'league', scopeId: leagueId }, capability);
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

function seasonIdPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'season';
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
    action: z.literal('create_season'),
    id: z.string().trim().min(1).max(180).optional(),
    leagueId: z.string().trim().min(1).max(160),
    name: z.string().trim().min(3).max(120),
    sport: z.enum(['football', 'basketball', 'rugby']),
    status: z.enum(['draft', 'registration', 'active', 'completed', 'archived']).optional().default('registration'),
    startDate: z.string().trim().min(4).max(40),
    endDate: z.string().trim().min(4).max(40).optional(),
    competitionFormat: z.enum(['league', 'knockout', 'group_knockout']),
    scoring: z.object({
      win: z.number().finite().min(0).max(20),
      draw: z.number().finite().min(0).max(20).nullable(),
      loss: z.number().finite().min(0).max(20),
    }),
  }),
  z.object({
    action: z.literal('transition_season'),
    seasonId: z.string().trim().min(1).max(180),
    status: z.enum(['draft', 'registration', 'active', 'completed', 'archived']),
    note: z.string().trim().max(1200).optional().default(''),
  }),
  z.object({
    action: z.literal('create_fixtures'),
    fixtures: z.array(z.object({
      id: z.string().trim().min(1).max(180),
      sport: z.union([z.enum(['football', 'basketball', 'rugby']), z.enum(['Football', 'Basketball', 'Rugby'])]),
      leagueId: z.string().trim().min(1).max(160),
      seasonId: z.string().trim().min(1).max(180),
      homeTeamId: z.string().trim().min(1).max(180),
      teamAId: z.string().trim().min(1).max(180).optional(),
      awayTeamId: z.string().trim().min(1).max(180),
      teamBId: z.string().trim().min(1).max(180).optional(),
      venue: z.string().trim().min(2).max(180),
      city: z.string().trim().min(2).max(100),
      scheduledAt: z.string().trim().min(4).max(40),
      date: z.string().trim().min(4).max(40).optional(),
      status: z.literal('scheduled'),
      score: z.object({ home: z.null(), away: z.null() }),
      verificationStatus: z.literal('pending'),
      supportersCount: z.number().nonnegative().optional().default(0),
      totalSupport: z.number().nonnegative().optional().default(0),
      events: z.array(z.object({
        minute: z.number().int().nonnegative().optional(),
        period: z.string().trim().max(40).optional(),
        type: z.string().trim().min(1).max(80),
        athleteId: z.string().trim().max(180).optional(),
        teamId: z.string().trim().min(1).max(180),
        description: z.string().trim().min(1).max(240),
      })).optional().default([]),
      createdAt: z.string().optional(),
    })).min(1).max(250),
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
    note: z.string().trim().max(1200).optional().default(''),
  }),
  z.object({
    action: z.literal('update_team_profile'),
    teamId: z.string().trim().min(1).max(160),
    name: z.string().trim().min(2).max(120).optional(),
    city: z.string().trim().min(2).max(100).optional(),
    location: z.string().trim().max(160).optional(),
    description: z.string().trim().max(1000).optional(),
    plan: z.enum(['free', 'pro']).optional(),
    verified: z.boolean().optional(),
    verificationStatus: z.enum(['pending', 'verified', 'rejected', 'disputed']).optional(),
    note: z.string().trim().max(1200).optional().default(''),
  }),
  z.object({
    action: z.literal('update_user_account'),
    userId: z.string().trim().min(1).max(160),
    accountStatus: z.enum(['invited', 'active', 'suspended', 'disabled', 'deletion_pending']),
    note: z.string().trim().max(1200).optional().default(''),
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
    action: z.literal('transition_access_assignment'),
    assignmentId: z.string().trim().min(1).max(180),
    status: z.enum(['active', 'suspended', 'expired', 'revoked']),
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

  const parsed = await parseJsonBody(request, adminActionSchema, { maxBytes: 512 * 1024 });
  if ('response' in parsed) return parsed.response;

  const actor = auth.actor;
  const body = parsed.data;

  try {
    if (body.action === 'create_league') {
      const guarded = await securePlatformCommand({
        actor,
        command: 'organization.create',
        requiredCapability: 'platform.organization.create',
        handler: async ({ requestId }) => {
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
            transaction.set(adminDb.collection('adminAuditEvents').doc(), platformAuditEvent({
              actor,
              requestId,
              action: 'created',
              targetCollection: 'leagues',
              targetId: leagueId,
              note: `Created ${body.name} from Platform Admin console.`,
              afterSummary: { name: body.name, city: body.city, sport: body.sport, status: body.status, plan: body.plan },
            }));
          });
          return Response.json({ ok: true, id: leagueId, seasonId, requestId });
        },
      });
      return 'response' in guarded ? guarded.response : guarded.result;
    }

    if (body.action === 'update_league_profile') {
      const guarded = await securePlatformCommand({
        actor,
        command: 'league.update_identity',
        requiredCapability: 'platform.organizations.identity.manage',
        reason: body.note,
        requireReason: body.status === 'suspended',
        handler: async ({ requestId, reason }) => {
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
            transaction.set(adminDb.collection('adminAuditEvents').doc(), platformAuditEvent({
              actor,
              requestId,
              action: body.status === 'suspended' ? 'suspended' : 'updated',
              targetCollection: 'leagues',
              targetId: leagueId,
              note: reason || 'Updated league profile from Platform Admin console.',
              beforeSummary: { status: league.data()?.status, plan: league.data()?.plan },
              afterSummary: cleanUpdates,
            }));
          });
          return Response.json({ ok: true, id: leagueId, requestId });
        },
      });
      return 'response' in guarded ? guarded.response : guarded.result;
    }

    if (body.action === 'update_team_profile') {
      const guarded = await securePlatformCommand({
        actor,
        command: 'team.update_verification',
        requiredCapability: 'platform.verification.team.manage',
        reason: body.note,
        requireReason: Boolean(body.verificationStatus || body.verified !== undefined || body.plan !== undefined),
        handler: async ({ requestId, reason }) => {
          const { teamId } = body;
          const updates = {
            name: body.name,
            city: body.city,
            location: body.location,
            description: body.description,
            plan: body.plan,
            verified: body.verified,
            verificationStatus: body.verificationStatus,
          };
          const cleanUpdates = Object.fromEntries(
            Object.entries(updates).filter(([, value]) => value !== undefined),
          );
          if (!Object.keys(cleanUpdates).length) {
            return Response.json({ error: 'Provide at least one team field to update.' }, { status: 400 });
          }
          const teamRef = adminDb.collection('teams').doc(teamId);
          await adminDb.runTransaction(async (transaction) => {
            const team = await transaction.get(teamRef);
            if (!team.exists) throw new Error('Team not found.');
            transaction.update(teamRef, {
              ...cleanUpdates,
              updatedAt: FieldValue.serverTimestamp(),
            });
            transaction.set(adminDb.collection('adminAuditEvents').doc(), platformAuditEvent({
              actor,
              requestId,
              action: body.verificationStatus === 'rejected' ? 'blocked' : body.verificationStatus === 'verified' ? 'verified' : 'updated',
              targetCollection: 'teams',
              targetId: teamId,
              note: reason || 'Updated team record from Platform Admin console.',
              beforeSummary: { verificationStatus: team.data()?.verificationStatus, verified: team.data()?.verified, plan: team.data()?.plan },
              afterSummary: cleanUpdates,
            }));
          });
          return Response.json({ ok: true, id: teamId, requestId });
        },
      });
      return 'response' in guarded ? guarded.response : guarded.result;
    }

    if (body.action === 'update_user_account') {
      const guarded = await securePlatformCommand({
        actor,
        command: 'account.lifecycle',
        requiredCapability: 'platform.accounts.lifecycle',
        reason: body.note,
        requireReason: true,
        handler: async ({ requestId, reason }) => {
          const { userId, accountStatus } = body;
          const userRef = adminDb.collection('users').doc(userId);
          await adminDb.runTransaction(async (transaction) => {
            const user = await transaction.get(userRef);
            if (!user.exists) throw new Error('User account not found.');
            transaction.update(userRef, {
              accountStatus,
              status: accountStatus === 'active' ? 'active' : accountStatus === 'invited' ? 'pending' : 'suspended',
              accessVersion: FieldValue.increment(1),
              updatedAt: FieldValue.serverTimestamp(),
            });
            transaction.set(adminDb.collection('adminAuditEvents').doc(), platformAuditEvent({
              actor,
              requestId,
              action: accountStatus === 'active' ? 'activated' : accountStatus === 'suspended' ? 'suspended' : 'disabled',
              targetCollection: 'users',
              targetId: userId,
              note: reason,
              beforeSummary: { accountStatus: user.data()?.accountStatus, status: user.data()?.status },
              afterSummary: { accountStatus, status: accountStatus === 'active' ? 'active' : accountStatus === 'invited' ? 'pending' : 'suspended' },
            }));
          });
          if (['suspended', 'disabled', 'deletion_pending'].includes(accountStatus)) {
            // Suspending an account has to suspend the AUTHORITY the account holds, not just
            // the account record.
            //
            // Revoking refresh tokens alone left every accessIndex projection standing, so
            // Firestore Rules and any capability check went on granting `team.result.submit`
            // and the rest from a projection nobody had told about the suspension. The UI
            // said "suspended" while the principal still held operational authority — the
            // exact inversion an authority engine must not have.
            //
            // Assignments are suspended first, then the projection is rebuilt from them, so
            // the projector stays the single owner of accessIndex writes rather than this
            // route reaching in and editing projections directly.
            const assignments = await adminDb
              .collection('accessAssignments')
              .where('userId', '==', userId)
              .where('status', '==', 'active')
              .get();
            const suspendedAt = new Date().toISOString();
            await Promise.all(assignments.docs.map((assignmentDoc) => assignmentDoc.ref.update({
              status: 'suspended',
              suspendedAt,
              updatedAt: FieldValue.serverTimestamp(),
            })));
            await rebuildUserProjections(userId);
            await adminAuth.revokeRefreshTokens(userId);
            await adminDb.collection('adminAuditEvents').add({
              ...platformAuditEvent({
                actor,
                requestId,
                action: 'access.suspended_with_account',
                targetCollection: 'accessAssignments',
                targetId: userId,
                note: reason,
                afterSummary: { suspendedAssignments: assignments.size, accountStatus },
              }),
              createdAt: FieldValue.serverTimestamp(),
            });
          }
          if (accountStatus === 'disabled' || accountStatus === 'deletion_pending') {
            await adminAuth.updateUser(userId, { disabled: true });
          } else if (accountStatus === 'active') {
            await adminAuth.updateUser(userId, { disabled: false }).catch(() => undefined);
          }
          return Response.json({ ok: true, id: userId, requestId });
        },
      });
      return 'response' in guarded ? guarded.response : guarded.result;
    }

    if (body.action === 'create_season') {
      const guarded = await secureLeagueCommand({
        actor,
        command: 'league.create_season',
        leagueId: body.leagueId,
        requiredCapability: 'league.season.manage',
        handler: async ({ requestId, reason, league }) => {
          const seasonId = body.id ?? `season_${seasonIdPart(body.leagueId)}_${seasonIdPart(body.name)}_${Date.now().toString(36)}`;
          const seasonRef = adminDb.collection('seasons').doc(seasonId);
          const leagueRef = adminDb.collection('leagues').doc(body.leagueId);
          await adminDb.runTransaction(async (transaction) => {
            const existingSeason = await transaction.get(seasonRef);
            if (existingSeason.exists) throw new Error('Season already exists.');
            const seasonRecord = {
              id: seasonId,
              leagueId: body.leagueId,
              name: body.name,
              sport: body.sport,
              status: body.status,
              startDate: body.startDate,
              ...(body.endDate ? { endDate: body.endDate } : {}),
              competitionFormat: body.competitionFormat,
              scoring: body.scoring,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            };
            transaction.set(seasonRef, seasonRecord);
            transaction.update(leagueRef, {
              currentSeasonId: seasonId,
              season: body.name,
              updatedAt: FieldValue.serverTimestamp(),
            });
            transaction.set(adminDb.collection('adminAuditEvents').doc(), platformAuditEvent({
              actor,
              requestId,
              action: 'created',
              targetCollection: 'seasons',
              targetId: seasonId,
              note: reason || `Created season ${body.name}.`,
              beforeSummary: { leagueId: body.leagueId, previousCurrentSeasonId: league.data()?.currentSeasonId },
              afterSummary: { leagueId: body.leagueId, status: body.status, competitionFormat: body.competitionFormat },
            }));
          });
          return Response.json({ ok: true, id: seasonId, requestId });
        },
      });
      return 'response' in guarded ? guarded.response : guarded.result;
    }

    if (body.action === 'transition_season') {
      const seasonSnapshot = await adminDb.collection('seasons').doc(body.seasonId).get();
      if (!seasonSnapshot.exists) return Response.json({ error: 'Season not found.' }, { status: 404 });
      const leagueId = String(seasonSnapshot.data()?.leagueId ?? '');
      if (!leagueId) return Response.json({ error: 'Season is missing its league relationship.' }, { status: 409 });
      const guarded = await secureLeagueCommand({
        actor,
        command: 'league.transition_season',
        leagueId,
        requiredCapability: 'league.season.manage',
        reason: body.note,
        handler: async ({ requestId, reason }) => {
          const seasonRef = adminDb.collection('seasons').doc(body.seasonId);
          await adminDb.runTransaction(async (transaction) => {
            const season = await transaction.get(seasonRef);
            if (!season.exists) throw new Error('Season not found.');
            transaction.update(seasonRef, {
              status: body.status,
              updatedAt: FieldValue.serverTimestamp(),
            });
            transaction.set(adminDb.collection('adminAuditEvents').doc(), platformAuditEvent({
              actor,
              requestId,
              action: body.status,
              targetCollection: 'seasons',
              targetId: body.seasonId,
              note: reason || `Season moved to ${body.status}.`,
              beforeSummary: { status: season.data()?.status, leagueId },
              afterSummary: { status: body.status },
            }));
          });
          return Response.json({ ok: true, id: body.seasonId, status: body.status, requestId });
        },
      });
      return 'response' in guarded ? guarded.response : guarded.result;
    }

    if (body.action === 'create_fixtures') {
      const [firstFixture] = body.fixtures;
      if (!firstFixture) return Response.json({ error: 'Add at least one fixture.' }, { status: 400 });
      const leagueId = firstFixture.leagueId;
      const seasonId = firstFixture.seasonId;
      if (!body.fixtures.every((fixture) => fixture.leagueId === leagueId && fixture.seasonId === seasonId)) {
        return Response.json({ error: 'All fixtures must belong to one league and season.' }, { status: 400 });
      }
      const duplicateIds = new Set<string>();
      for (const fixture of body.fixtures) {
        if (duplicateIds.has(fixture.id)) return Response.json({ error: `Duplicate fixture id ${fixture.id}.` }, { status: 400 });
        duplicateIds.add(fixture.id);
      }
      const guarded = await secureLeagueCommand({
        actor,
        command: 'league.create_fixtures',
        leagueId,
        requiredCapability: 'league.season.manage',
        handler: async ({ requestId, reason }) => {
          const seasonRef = adminDb.collection('seasons').doc(seasonId);
          await adminDb.runTransaction(async (transaction) => {
            const season = await transaction.get(seasonRef);
            if (!season.exists || season.data()?.leagueId !== leagueId) {
              throw new Error('The selected season does not belong to this league.');
            }
            if (season.data()?.status === 'archived') {
              throw new Error('Archived seasons cannot receive new fixtures.');
            }

            const fixtureRefs = body.fixtures.map((fixture) => adminDb.collection('matches').doc(fixture.id));
            const existingFixtures = await Promise.all(fixtureRefs.map((fixtureRef) => transaction.get(fixtureRef)));
            existingFixtures.forEach((existing, index) => {
              if (existing.exists) throw new Error(`Fixture ${body.fixtures[index].id} already exists.`);
            });

            const teamIds = [...new Set(body.fixtures.flatMap((fixture) => [fixture.homeTeamId, fixture.awayTeamId]))];
            const teamSnapshots = await Promise.all(
              teamIds.map((teamId) => transaction.get(adminDb.collection('teams').doc(teamId))),
            );
            teamSnapshots.forEach((team, index) => {
              if (!team.exists || team.data()?.leagueId !== leagueId) {
                throw new Error(`Team ${teamIds[index]} does not belong to this league.`);
              }
            });

            body.fixtures.forEach((fixture, index) => {
              transaction.set(fixtureRefs[index], {
                ...fixture,
                score: { home: null, away: null },
                verificationStatus: 'pending',
                supportersCount: fixture.supportersCount ?? 0,
                totalSupport: fixture.totalSupport ?? 0,
                events: fixture.events ?? [],
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
              });
            });
            transaction.update(adminDb.collection('leagues').doc(leagueId), {
              matchesCount: FieldValue.increment(body.fixtures.length),
              updatedAt: FieldValue.serverTimestamp(),
            });
            transaction.set(adminDb.collection('adminAuditEvents').doc(), platformAuditEvent({
              actor,
              requestId,
              action: 'created',
              targetCollection: 'matches',
              targetId: firstFixture.id,
              note: reason || `Created ${body.fixtures.length} fixture(s) for ${seasonId}.`,
              beforeSummary: { leagueId, seasonId, existingFixtureCount: 0 },
              afterSummary: { leagueId, seasonId, fixtureCount: body.fixtures.length },
            }));
          });
          return Response.json({ ok: true, id: firstFixture.id, count: body.fixtures.length, requestId });
        },
      });
      return 'response' in guarded ? guarded.response : guarded.result;
    }

    if (body.action === 'create_team_invitation') {
      /**
       * Closed by ADR-004, Stage B of the migration: no new Team Admin assignment or
       * invitation is issued.
       *
       * Refused here rather than removed, because the action name is part of a shipped API
       * and a caller that still sends it deserves to be told why instead of receiving an
       * unknown-action error. `league.team_admin.invite`, which used to gate this, is
       * deprecated and no bundle grants it any more, so the check below would refuse
       * everyone regardless; saying so plainly is better than a 403 that reads like a
       * permissions problem.
       */
      return Response.json({
        error: 'Team administration has moved to League Operations. Athletes and rosters are managed from the league.',
      }, { status: 410 });
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
        // Capability only; see the invitation command above.
        if (!(await hasScopedLeagueCapability(actor.uid, leagueId, 'league.team.create'))) {
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
      const guarded = await securePlatformCommand({
        actor,
        command: 'application.review',
        requiredCapability: 'platform.application.review',
        reason: body.note,
        requireReason: body.decision !== 'approved',
        handler: async ({ requestId, reason }) => {
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
            transaction.set(adminDb.collection('adminAuditEvents').doc(), platformAuditEvent({
              actor,
              requestId,
              action: decision,
              targetCollection,
              targetId,
              note: reason || note,
              beforeSummary: { status: target.data()?.status, verificationStatus: target.data()?.verificationStatus },
              afterSummary: update,
            }));
          });
          return Response.json({ ok: true, id: targetId, requestId });
        },
      });
      return 'response' in guarded ? guarded.response : guarded.result;
    }

    if (body.action === 'revoke_team_assignment') {
      const guarded = await securePlatformCommand({
        actor,
        command: 'assignment.revoke',
        requiredCapability: 'platform.access.revoke',
        reason: body.note,
        requireReason: true,
        handler: async ({ requestId, reason }) => {
          const { assignmentId } = body;
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
            transaction.set(adminDb.collection('adminAuditEvents').doc(), platformAuditEvent({
              actor,
              requestId,
              action: 'revoked',
              targetCollection: 'teamAssignments',
              targetId: assignmentId,
              note: reason,
              beforeSummary: { status: assignment.data()?.status, teamId: assignment.data()?.teamId, userId: assignment.data()?.userId },
              afterSummary: { status: 'revoked' },
            }));
          });
          return Response.json({ ok: true, id: assignmentId, requestId });
        },
      });
      return 'response' in guarded ? guarded.response : guarded.result;
    }

    if (body.action === 'transition_access_assignment') {
      const guarded = await securePlatformCommand({
        actor,
        command: 'assignment.transition',
        requiredCapability: 'platform.access.manage',
        reason: body.note,
        requireReason: true,
        handler: async ({ requestId, reason }) => {
          const { assignmentId, status } = body;
          const assignmentRef = adminDb.collection('accessAssignments').doc(assignmentId);
          const now = new Date();
          const nowIso = now.toISOString();
          await adminDb.runTransaction(async (transaction) => {
            const assignmentSnapshot = await transaction.get(assignmentRef);
            if (!assignmentSnapshot.exists) throw new Error('Access assignment not found.');
            const current = normalizeAccessAssignment(assignmentSnapshot.id, assignmentSnapshot.data()!, nowIso);
            const nextAssignment: AccessAssignment = {
              ...current,
              status,
              updatedAt: nowIso,
              ...(status === 'active' ? {
                suspendedAt: undefined,
                revokedAt: undefined,
                revocationReason: undefined,
                validUntil: undefined,
              } : {}),
              ...(status === 'suspended' ? { suspendedAt: nowIso } : {}),
              ...(status === 'revoked' ? { revokedAt: nowIso, revocationReason: reason || 'Revoked by Platform Admin.' } : {}),
              ...(status === 'expired' ? { validUntil: nowIso } : {}),
            };
            // Revocation is the operation that must never fail open. The projector
            // rebuilds the whole scope, so a revoked assignment's capabilities cannot
            // survive in the projection, and the document is deleted outright when no
            // active assignment remains.
            const projection = await readScopeProjection(transaction, {
              userId: current.userId,
              scopeType: current.scopeType,
              scopeId: current.scopeId,
            }, {
              now,
              pending: [{ operation: 'upsert', assignment: nextAssignment }],
            });

            transaction.update(assignmentRef, transitionPatch(status, nowIso, reason));
            projection.apply(transaction);
            transaction.set(adminDb.collection('adminAuditEvents').doc(), platformAuditEvent({
              actor,
              requestId,
              action: status,
              targetCollection: 'accessAssignments',
              targetId: assignmentId,
              note: reason,
              beforeSummary: { status: current.status, roleKey: current.roleKey, scopeType: current.scopeType, scopeId: current.scopeId },
              afterSummary: { status, accessIndexRebuilt: true },
            }));
          });
          return Response.json({ ok: true, id: assignmentId, status, requestId });
        },
      });
      return 'response' in guarded ? guarded.response : guarded.result;
    }

    if (body.action === 'resolve_report') {
      const guarded = await securePlatformCommand({
        actor,
        command: 'trust_case.decision',
        requiredCapability: 'platform.trust.decide',
        reason: body.note,
        requireReason: true,
        handler: async ({ requestId, reason }) => {
          const { reportId, decision } = body;
          const reportRef = adminDb.collection('reports').doc(reportId);
          await adminDb.runTransaction(async (transaction) => {
            const report = await transaction.get(reportRef);
            if (!report.exists) throw new Error('Report not found.');
            transaction.update(reportRef, {
              status: decision,
              updatedAt: FieldValue.serverTimestamp(),
              actionHistory: FieldValue.arrayUnion(reason),
            });
            transaction.set(adminDb.collection('adminAuditEvents').doc(), platformAuditEvent({
              actor,
              requestId,
              action: decision,
              targetCollection: 'reports',
              targetId: reportId,
              note: reason,
              beforeSummary: { status: report.data()?.status, severity: report.data()?.severity },
              afterSummary: { status: decision },
            }));
          });
          return Response.json({ ok: true, id: reportId, requestId });
        },
      });
      return 'response' in guarded ? guarded.response : guarded.result;
    }

    return Response.json({ error: 'Unsupported admin action.' }, { status: 400 });
  } catch (error) {
    // Internal failure text can carry collection names, document IDs and provider
    // details. Log it server-side and hand the caller only a correlation ID so an
    // operator can quote it to support without the response leaking internals.
    const errorId = randomUUID();
    console.error('Trusted admin action failed', { errorId, error });
    return Response.json({
      error: 'The trusted action failed. Quote this reference when reporting it.',
      errorId,
    }, { status: 500 });
  }
}
