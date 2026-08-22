import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { platformAuditEvent, refuse, securePlatformCommand } from '@/server/platform/commands/securePlatformCommand';
import { networkDependencies, type NetworkObjectKind } from '@/server/platform/networkDependencies';
import {
  NO_DEPENDENCIES,
  decideLifecycleTransition,
  isPubliclyVisible,
  type LifecycleState,
} from '@/lib/platform/lifecycle';

export const runtime = 'nodejs';

/**
 * The only way the network changes.
 *
 * Client UI is a console; authority lives here. Every command on this route runs the same
 * four checks before it writes — the operator holds the capability, the account is a real
 * platform operator, a reason was given, and the transition is legal for the object's
 * current state — and every one of them leaves an audit entry naming the actor, the reason
 * and the before/after state.
 *
 * There is no delete command that deletes. `lifecycle` with `hard_delete` asks the lifecycle
 * module, which refuses for anything that ever became real and says which dependency
 * refused. Archiving is the answer almost every time, and the refusal says so.
 */

const COLLECTION: Record<NetworkObjectKind, string> = {
  league: 'leagues',
  team: 'teams',
  athlete: 'athletes',
};

const sportSchema = z.string().trim().min(2).max(40);
const shortText = z.string().trim().min(2).max(120);
const longText = z.string().trim().max(1500);
const idSchema = z.string().trim().min(1).max(200);
const reasonSchema = z.string().trim().min(4).max(500);

const bodySchema = z.discriminatedUnion('command', [
  z.object({
    command: z.literal('createLeague'),
    reason: reasonSchema,
    name: shortText,
    sport: sportSchema,
    city: shortText,
    description: longText.default(''),
  }),
  z.object({
    command: z.literal('updateLeague'),
    reason: reasonSchema,
    leagueId: idSchema,
    patch: z.object({
      name: shortText.optional(),
      city: shortText.optional(),
      description: longText.optional(),
      sport: sportSchema.optional(),
    }).strict(),
  }),
  z.object({
    command: z.literal('createTeam'),
    reason: reasonSchema,
    name: shortText,
    leagueId: idSchema,
    city: shortText,
    description: longText.default(''),
  }),
  z.object({
    command: z.literal('updateTeam'),
    reason: reasonSchema,
    teamId: idSchema,
    patch: z.object({
      name: shortText.optional(),
      city: shortText.optional(),
      location: shortText.optional(),
      description: longText.optional(),
      leagueId: idSchema.optional(),
    }).strict(),
  }),
  z.object({
    command: z.literal('createAthlete'),
    reason: reasonSchema,
    name: shortText,
    teamId: idSchema,
    position: z.string().trim().min(1).max(60),
    ageGroup: z.enum(['U18', 'U21', 'Senior']),
    bio: longText.default(''),
  }),
  z.object({
    command: z.literal('updateAthlete'),
    reason: reasonSchema,
    athleteId: idSchema,
    patch: z.object({
      name: shortText.optional(),
      position: z.string().trim().min(1).max(60).optional(),
      bio: longText.optional(),
      ageGroup: z.enum(['U18', 'U21', 'Senior']).optional(),
      teamId: idSchema.optional(),
      // Deliberately absent: anything to do with payout identity. That is not a profile
      // field and cannot be reached from a profile edit. See src/lib/platform/athletePayee.ts.
    }).strict(),
  }),
  z.object({
    command: z.literal('lifecycle'),
    reason: reasonSchema,
    kind: z.enum(['league', 'team', 'athlete']),
    id: idSchema,
    action: z.enum(['activate', 'suspend', 'archive', 'restore', 'hard_delete']),
  }),
]);

/**
 * Leagues carry a wider `lifecycleStatus` union than the lifecycle module models
 * (`onboarding`, `ready_to_launch`, `completed`, …). Anything outside the four operational
 * states is treated as `active`, because those extra values all describe a live league —
 * mapping them to `draft` would make a running competition look deletable.
 */
function currentLifecycleState(data: FirebaseFirestore.DocumentData | undefined): LifecycleState {
  const raw = data?.lifecycleStatus;
  if (raw === 'draft' || raw === 'suspended' || raw === 'archived' || raw === 'active') return raw;
  return 'active';
}

function slugId(prefix: string, name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return `${prefix}_${slug || 'unnamed'}_${randomUUID().slice(0, 8)}`;
}

function lifecycleAuditAction(kind: NetworkObjectKind, action: string) {
  const verb = action === 'hard_delete' ? 'delete' : action;
  const noun = kind === 'league' ? 'League' : kind === 'team' ? 'Team' : 'Profile';
  return `platform.${kind === 'athlete' ? 'athlete' : 'network'}.${verb}${noun}`;
}

export async function POST(request: Request) {
  const guarded = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 8 * 1024,
    invalidBodyError: 'A network command is required.',
    rateLimit: { bucket: 'platform_network', limit: 60, windowSeconds: 300 },
  });
  if ('response' in guarded) return guarded.response;
  const body = guarded.data;

  // Athlete commands are gated on the athlete capability, everything else on the network
  // one. Separated so a support operator who fixes athlete names cannot archive a league.
  const touchesAthlete = body.command === 'createAthlete'
    || body.command === 'updateAthlete'
    || (body.command === 'lifecycle' && body.kind === 'athlete');
  const requiredCapability = touchesAthlete
    ? ('platform.athlete.manage' as const)
    : ('platform.network.manage' as const);

  const outcome = await securePlatformCommand({
    actor: guarded.actor,
    command: `network.${body.command}`,
    requiredCapability,
    requireReason: true,
    reason: body.reason,
    handler: async ({ actor, requestId, reason }) => {
      const now = new Date().toISOString();

      const writeAudit = async (input: {
        action: string;
        collection: string;
        targetId: string;
        before?: Record<string, unknown>;
        after?: Record<string, unknown>;
      }) => {
        await adminDb.collection('adminAuditEvents').add({
          ...platformAuditEvent({
            actor,
            requestId,
            action: input.action,
            targetCollection: input.collection,
            targetId: input.targetId,
            note: reason,
            beforeSummary: input.before,
            afterSummary: input.after,
          }),
          createdAt: FieldValue.serverTimestamp(),
        });
      };

      if (body.command === 'createLeague') {
        const id = slugId('league', body.name);
        // Created as a draft, never as a live competition. A new league becomes public only
        // when someone deliberately activates it, and draft is also the only state from
        // which a mistake can still be deleted outright rather than archived forever.
        await adminDb.collection('leagues').doc(id).create({
          id,
          name: body.name,
          sport: body.sport,
          city: body.city,
          country: 'Uganda',
          description: body.description,
          status: 'community',
          lifecycleStatus: 'draft',
          publiclyVisible: false,
          plan: 'free',
          verified: false,
          adminUserIds: [],
          season: '',
          teamsCount: 0,
          athletesCount: 0,
          matchesCount: 0,
          matchCompletionRate: 0,
          verifiedResultsRate: 0,
          createdAt: now,
          updatedAt: now,
          createdByUserId: actor.uid,
        });
        await writeAudit({
          action: 'platform.network.createLeague',
          collection: 'leagues',
          targetId: id,
          after: { name: body.name, sport: body.sport, lifecycleStatus: 'draft' },
        });
        return { id, lifecycleStatus: 'draft' };
      }

      if (body.command === 'createTeam') {
        const league = await adminDb.collection('leagues').doc(body.leagueId).get();
        if (!league.exists) refuse('League not found.', 404);
        const id = slugId('team', body.name);
        await adminDb.collection('teams').doc(id).create({
          id,
          name: body.name,
          // Inherited rather than asked for: a team playing a different sport from its
          // league is a data error nobody would deliberately enter.
          sport: league.data()?.sport ?? 'football',
          leagueId: body.leagueId,
          city: body.city,
          country: 'Uganda',
          description: body.description,
          lifecycleStatus: 'draft',
          publiclyVisible: false,
          plan: 'free',
          verified: false,
          adminUserIds: [],
          totalSupport: 0,
          supportersCount: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          leaguePoints: 0,
          createdAt: now,
          updatedAt: now,
          createdByUserId: actor.uid,
        });
        await writeAudit({
          action: 'platform.network.createTeam',
          collection: 'teams',
          targetId: id,
          after: { name: body.name, leagueId: body.leagueId, lifecycleStatus: 'draft' },
        });
        return { id, lifecycleStatus: 'draft' };
      }

      if (body.command === 'createAthlete') {
        const team = await adminDb.collection('teams').doc(body.teamId).get();
        if (!team.exists) refuse('Team not found.', 404);
        const teamData = team.data() ?? {};
        const id = slugId('athlete', body.name);
        // A managed profile. `userId` is absent and stays absent unless the athlete later
        // claims the profile for their payee portal — existing in the sporting record does
        // not require an account, and holding an account grants no authority over this row.
        await adminDb.collection('athletes').doc(id).create({
          id,
          name: body.name,
          sport: teamData.sport ?? 'football',
          position: body.position,
          teamId: body.teamId,
          leagueId: teamData.leagueId ?? '',
          city: teamData.city ?? '',
          country: 'Uganda',
          ageGroup: body.ageGroup,
          bio: body.bio,
          lifecycleStatus: 'draft',
          publiclyVisible: false,
          verified: false,
          verificationStatus: 'pending',
          totalSupport: 0,
          supportersCount: 0,
          goalPlacePoints: 0,
          stats: {},
          impactNeeds: [],
          createdAt: now,
          updatedAt: now,
          createdByUserId: actor.uid,
        });
        await writeAudit({
          action: 'platform.athlete.createProfile',
          collection: 'athletes',
          targetId: id,
          after: { name: body.name, teamId: body.teamId, lifecycleStatus: 'draft' },
        });
        return { id, lifecycleStatus: 'draft' };
      }

      if (body.command === 'updateLeague' || body.command === 'updateTeam' || body.command === 'updateAthlete') {
        const kind: NetworkObjectKind = body.command === 'updateLeague'
          ? 'league'
          : body.command === 'updateTeam' ? 'team' : 'athlete';
        const targetId = body.command === 'updateLeague'
          ? body.leagueId
          : body.command === 'updateTeam' ? body.teamId : body.athleteId;
        const patch = body.patch as Record<string, unknown>;

        const ref = adminDb.collection(COLLECTION[kind]).doc(targetId);
        const snapshot = await ref.get();
        if (!snapshot.exists) refuse('Record not found.', 404);
        const before = snapshot.data() ?? {};

        // Only the fields that actually differ are written and recorded, so the audit trail
        // says what changed rather than that a form was submitted.
        const changed = Object.fromEntries(
          Object.entries(patch).filter(([key, value]) => before[key] !== value),
        );
        if (!Object.keys(changed).length) refuse('Nothing to change.');

        await ref.update({ ...changed, updatedAt: now, updatedByUserId: actor.uid });
        await writeAudit({
          action: kind === 'athlete'
            ? 'platform.athlete.updateProfile'
            : `platform.network.update${kind === 'league' ? 'League' : 'Team'}`,
          collection: COLLECTION[kind],
          targetId,
          before: Object.fromEntries(Object.keys(changed).map((key) => [key, before[key] ?? null])),
          after: changed,
        });
        return { id: targetId, changed: Object.keys(changed) };
      }

      const { kind, id, action } = body;
      const ref = adminDb.collection(COLLECTION[kind]).doc(id);
      const snapshot = await ref.get();
      if (!snapshot.exists) refuse('Record not found.', 404);
      const data = snapshot.data();
      const state = currentLifecycleState(data);

      // Dependencies are only counted where they can change the answer. Every other
      // transition is reversible, so making an operator wait on six count queries to suspend
      // a team would be cost without benefit.
      const dependencies = action === 'hard_delete'
        ? await networkDependencies(kind, id)
        : NO_DEPENDENCIES;

      const decision = decideLifecycleTransition({ action, state, dependencies });
      if (!decision.ok) refuse([decision.reason, ...decision.blockers].join(' '), 409);

      const auditAction = lifecycleAuditAction(kind, action);

      if (action === 'hard_delete') {
        // Reached only for a draft with nothing attached. The audit entry is written before
        // the row is removed and outlives it, which is the point: a deletion that leaves no
        // trace is indistinguishable from a record that never existed.
        await writeAudit({
          action: auditAction,
          collection: COLLECTION[kind],
          targetId: id,
          before: { name: data?.name ?? null, lifecycleStatus: state },
          after: { deleted: true },
        });
        await ref.delete();
        return { id, deleted: true };
      }

      await ref.update({
        lifecycleStatus: decision.nextState,
        // Derived from the lifecycle state rather than set separately, so an archived object
        // cannot be left publicly readable by a second write someone forgot to make.
        publiclyVisible: isPubliclyVisible(decision.nextState),
        updatedAt: now,
        updatedByUserId: actor.uid,
      });
      await writeAudit({
        action: auditAction,
        collection: COLLECTION[kind],
        targetId: id,
        before: { lifecycleStatus: state },
        after: { lifecycleStatus: decision.nextState },
      });
      return { id, lifecycleStatus: decision.nextState };
    },
  });

  if ('response' in outcome) return outcome.response;
  return Response.json({ ok: true, ...outcome.result });
}
