import { createHash, randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation, requireFanAccountPrincipal } from '@/server/api/security';

export const runtime = 'nodejs';

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    competitionId: z.string().trim().min(1).max(180),
    name: z.string().trim().min(3).max(50),
    description: z.string().trim().max(180).default(''),
    visibility: z.enum(['public', 'private']),
    approvalRequired: z.boolean(),
    memberLimit: z.number().int().min(2).max(100),
  }),
  z.object({
    action: z.literal('join'),
    inviteCode: z.string().trim().min(6).max(16),
  }),
  z.object({
    action: z.literal('moderate'),
    miniLeagueId: z.string().trim().min(1).max(180),
    memberUserId: z.string().trim().min(1).max(180),
    status: z.enum(['active', 'removed']),
  }),
  z.object({
    action: z.literal('rotate_invite_code'),
    miniLeagueId: z.string().trim().min(1).max(180),
  }),
]);

/** Codes are valid for 30 days unless rotated sooner. */
const INVITE_CODE_TTL_DAYS = 30;

/**
 * Invite codes are stored as a hash, never in plaintext.
 *
 * A stored plaintext code is a bearer credential sitting in a document that platform
 * operators and any future export can read, and it was queried by equality on the
 * plaintext value. Hashing means a database read cannot hand anyone a working code; the
 * only copy is the one shown once to the creator.
 *
 * Not salted per record, deliberately: the join path has to find a league from the code
 * alone, which requires a deterministic lookup. Guessing is bounded by the code's
 * entropy, the abuse limit on the join action, and expiry.
 */
function inviteCodeHash(code: string) {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

function issueInviteCode(now = new Date()) {
  const code = randomBytes(5).toString('hex').toUpperCase();
  return {
    code,
    hash: inviteCodeHash(code),
    expiresAt: new Date(now.getTime() + INVITE_CODE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function tokenFrom(request: Request) {
  const header = request.headers.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

function normalize(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if ('toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(normalize);
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, normalize(nested)]),
  );
}

export async function GET(request: Request) {
  const miniLeagueId = new URL(request.url).searchParams.get('miniLeagueId');
  if (!miniLeagueId) {
    return Response.json({ error: 'Mini-league ID is required.' }, { status: 400 });
  }
  const leagueRef = adminDb.collection('fantasyMiniLeagues').doc(miniLeagueId);
  const league = await leagueRef.get();
  if (!league.exists || league.data()?.status !== 'active') {
    return Response.json({ error: 'Mini-league not found.' }, { status: 404 });
  }
  const token = tokenFrom(request);
  const actor = token ? await adminAuth.verifyIdToken(token).catch(() => null) : null;
  if (league.data()?.visibility === 'private') {
    const membership = actor
      ? await adminDb.collection('fantasyMiniLeagueMembers')
        .doc(`${miniLeagueId}_${actor.uid}`)
        .get()
      : null;
    const authorized = actor && (
      league.data()?.ownerUserId === actor.uid
      || (membership?.exists && membership.data()?.status === 'active')
    );
    if (!authorized) {
      return Response.json({ error: 'Active mini-league membership is required.' }, { status: 403 });
    }
  }
  const [members, leaderboard] = await Promise.all([
    adminDb.collection('fantasyMiniLeagueMembers')
      .where('miniLeagueId', '==', miniLeagueId)
      .where('status', '==', 'active')
      .get(),
    adminDb.collection('fantasyLeaderboards')
      .where('competitionId', '==', league.data()!.competitionId)
      .get(),
  ]);
  return Response.json(normalize({
    league: { id: league.id, ...league.data() },
    members: members.docs.map((item) => ({ id: item.id, ...item.data() })),
    leaderboards: leaderboard.docs.map((item) => ({ id: item.id, ...item.data() })),
  }));
}

export async function POST(request: Request) {
  const guarded = await requireAuthenticatedMutation(request, requestSchema, {
    maxBytes: 4 * 1024,
    invalidBodyError: 'Invalid mini-league request.',
    authError: 'Sign in to manage mini-leagues.',
    // Joining by invite code is a guessing surface: codes are still stored in plaintext
    // with no expiry, so the abuse limit is the only thing bounding attempts today.
    rateLimit: {
      bucket: 'fantasy_mini_league',
      limit: 20,
      windowSeconds: 300,
      identity: ({ data }) => [data.action],
    },
  });
  if ('response' in guarded) return guarded.response;
  const actor = guarded.actor;
  const input = guarded.data;
  const fanAccount = await requireFanAccountPrincipal(actor, 'GoalPlace Fantasy is available to Fan accounts only.');
  if ('response' in fanAccount) return fanAccount.response;

  if (input.action === 'create') {
    const competition = await adminDb.collection('fantasyCompetitions')
      .doc(input.competitionId)
      .get();
    if (!competition.exists || competition.data()?.status !== 'active') {
      return Response.json({ error: 'Choose an active fantasy competition.' }, { status: 409 });
    }
    const fantasyTeam = await adminDb.collection('fantasyTeams')
      .doc(`${input.competitionId}_${actor.uid}`)
      .get();
    if (!fantasyTeam.exists) {
      return Response.json({ error: 'Submit your fantasy squad before creating a mini-league.' }, { status: 409 });
    }
    const leagueRef = adminDb.collection('fantasyMiniLeagues').doc();
    const memberRef = adminDb.collection('fantasyMiniLeagueMembers')
      .doc(`${leagueRef.id}_${actor.uid}`);
    const invite = issueInviteCode();
    const batch = adminDb.batch();
    batch.create(leagueRef, {
      id: leagueRef.id,
      competitionId: input.competitionId,
      ownerUserId: actor.uid,
      name: input.name,
      description: input.description,
      // The plaintext code is returned to the creator once and never stored.
      inviteCodeHash: invite.hash,
      inviteCodeExpiresAt: invite.expiresAt,
      visibility: input.visibility,
      approvalRequired: input.approvalRequired,
      memberLimit: input.memberLimit,
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.create(memberRef, {
      id: memberRef.id,
      miniLeagueId: leagueRef.id,
      competitionId: input.competitionId,
      userId: actor.uid,
      fantasyTeamId: fantasyTeam.id,
      role: 'owner',
      status: 'active',
      joinedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return Response.json({
      id: leagueRef.id,
      inviteCode: invite.code,
      inviteCodeExpiresAt: invite.expiresAt,
    }, { status: 201 });
  }

  if (input.action === 'rotate_invite_code') {
    const leagueRef = adminDb.collection('fantasyMiniLeagues').doc(input.miniLeagueId);
    const league = await leagueRef.get();
    if (!league.exists || league.data()?.ownerUserId !== actor.uid) {
      return Response.json({ error: 'Only the mini-league owner may rotate the invite code.' }, { status: 403 });
    }
    // Rotation is how a leaked code is revoked: the old hash stops matching immediately.
    const invite = issueInviteCode();
    await leagueRef.set({
      inviteCodeHash: invite.hash,
      inviteCodeExpiresAt: invite.expiresAt,
      inviteCodeRotatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return Response.json({
      id: input.miniLeagueId,
      inviteCode: invite.code,
      inviteCodeExpiresAt: invite.expiresAt,
    });
  }

  if (input.action === 'moderate') {
    const league = await adminDb.collection('fantasyMiniLeagues')
      .doc(input.miniLeagueId)
      .get();
    if (!league.exists || league.data()?.ownerUserId !== actor.uid) {
      return Response.json({ error: 'Only the mini-league owner may moderate members.' }, { status: 403 });
    }
    if (input.memberUserId === actor.uid && input.status === 'removed') {
      return Response.json({ error: 'The owner cannot remove their own membership.' }, { status: 409 });
    }
    const memberRef = adminDb.collection('fantasyMiniLeagueMembers')
      .doc(`${league.id}_${input.memberUserId}`);
    const member = await memberRef.get();
    if (!member.exists) return Response.json({ error: 'Mini-league member was not found.' }, { status: 404 });
    await memberRef.update({
      status: input.status,
      moderatedByUserId: actor.uid,
      moderatedAt: FieldValue.serverTimestamp(),
    });
    return Response.json({ id: member.id, status: input.status });
  }

  const leagueQuery = await adminDb.collection('fantasyMiniLeagues')
    .where('inviteCodeHash', '==', inviteCodeHash(input.inviteCode))
    .where('status', '==', 'active')
    .limit(1)
    .get();
  if (leagueQuery.empty) return Response.json({ error: 'Invite code was not found.' }, { status: 404 });
  const league = leagueQuery.docs[0];
  const inviteExpiresAt = league.data().inviteCodeExpiresAt;
  if (typeof inviteExpiresAt === 'string' && Date.parse(inviteExpiresAt) <= Date.now()) {
    // Same message as an unknown code: a distinct one would confirm the code is real.
    return Response.json({ error: 'Invite code was not found.' }, { status: 404 });
  }
  const fantasyTeam = await adminDb.collection('fantasyTeams')
    .doc(`${league.data().competitionId}_${actor.uid}`)
    .get();
  if (!fantasyTeam.exists) {
    return Response.json({ error: 'Submit a squad in this competition before joining.' }, { status: 409 });
  }
  const memberRef = adminDb.collection('fantasyMiniLeagueMembers')
    .doc(`${league.id}_${actor.uid}`);
  const memberStatus = await adminDb.runTransaction(async (transaction) => {
    const [latestLeague, existingMember, activeMembers] = await Promise.all([
      transaction.get(league.ref),
      transaction.get(memberRef),
      transaction.get(
        adminDb.collection('fantasyMiniLeagueMembers')
          .where('miniLeagueId', '==', league.id)
          .where('status', '==', 'active'),
      ),
    ]);
    if (!latestLeague.exists || latestLeague.data()?.status !== 'active') {
      throw new Error('MINI_LEAGUE_UNAVAILABLE');
    }
    if (existingMember.exists && ['active', 'pending'].includes(existingMember.data()?.status)) {
      return existingMember.data()!.status as 'active' | 'pending';
    }
    if (activeMembers.size >= Number(latestLeague.data()?.memberLimit)) {
      throw new Error('MINI_LEAGUE_FULL');
    }
    const status = latestLeague.data()?.approvalRequired ? 'pending' : 'active';
    transaction.set(memberRef, {
      id: memberRef.id,
      miniLeagueId: league.id,
      competitionId: latestLeague.data()!.competitionId,
      userId: actor.uid,
      fantasyTeamId: fantasyTeam.id,
      role: 'member',
      status,
      joinedAt: FieldValue.serverTimestamp(),
    });
    return status as 'active' | 'pending';
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === 'MINI_LEAGUE_FULL') return 'full' as const;
    if (error instanceof Error && error.message === 'MINI_LEAGUE_UNAVAILABLE') return 'unavailable' as const;
    throw error;
  });
  if (memberStatus === 'full') {
    return Response.json({ error: 'This mini-league is full.' }, { status: 409 });
  }
  if (memberStatus === 'unavailable') {
    return Response.json({ error: 'This mini-league is no longer available.' }, { status: 409 });
  }
  return Response.json({
    id: league.id,
    status: memberStatus,
  });
}
