import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    competitionId: z.string().min(1),
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
    miniLeagueId: z.string().min(1),
    memberUserId: z.string().min(1),
    status: z.enum(['active', 'removed']),
  }),
]);

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
  const token = tokenFrom(request);
  const actor = token ? await adminAuth.verifyIdToken(token).catch(() => null) : null;
  if (!actor) return Response.json({ error: 'Sign in to manage mini-leagues.' }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid mini-league request.' }, { status: 400 });

  if (parsed.data.action === 'create') {
    const competition = await adminDb.collection('fantasyCompetitions')
      .doc(parsed.data.competitionId)
      .get();
    if (!competition.exists || competition.data()?.status !== 'active') {
      return Response.json({ error: 'Choose an active fantasy competition.' }, { status: 409 });
    }
    const fantasyTeam = await adminDb.collection('fantasyTeams')
      .doc(`${parsed.data.competitionId}_${actor.uid}`)
      .get();
    if (!fantasyTeam.exists) {
      return Response.json({ error: 'Submit your fantasy squad before creating a mini-league.' }, { status: 409 });
    }
    const leagueRef = adminDb.collection('fantasyMiniLeagues').doc();
    const memberRef = adminDb.collection('fantasyMiniLeagueMembers')
      .doc(`${leagueRef.id}_${actor.uid}`);
    const inviteCode = randomBytes(5).toString('hex').toUpperCase();
    const batch = adminDb.batch();
    batch.create(leagueRef, {
      id: leagueRef.id,
      competitionId: parsed.data.competitionId,
      ownerUserId: actor.uid,
      name: parsed.data.name,
      description: parsed.data.description,
      inviteCode,
      visibility: parsed.data.visibility,
      approvalRequired: parsed.data.approvalRequired,
      memberLimit: parsed.data.memberLimit,
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.create(memberRef, {
      id: memberRef.id,
      miniLeagueId: leagueRef.id,
      competitionId: parsed.data.competitionId,
      userId: actor.uid,
      fantasyTeamId: fantasyTeam.id,
      role: 'owner',
      status: 'active',
      joinedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return Response.json({ id: leagueRef.id, inviteCode }, { status: 201 });
  }

  if (parsed.data.action === 'moderate') {
    const league = await adminDb.collection('fantasyMiniLeagues')
      .doc(parsed.data.miniLeagueId)
      .get();
    if (!league.exists || league.data()?.ownerUserId !== actor.uid) {
      return Response.json({ error: 'Only the mini-league owner may moderate members.' }, { status: 403 });
    }
    if (parsed.data.memberUserId === actor.uid && parsed.data.status === 'removed') {
      return Response.json({ error: 'The owner cannot remove their own membership.' }, { status: 409 });
    }
    const memberRef = adminDb.collection('fantasyMiniLeagueMembers')
      .doc(`${league.id}_${parsed.data.memberUserId}`);
    const member = await memberRef.get();
    if (!member.exists) return Response.json({ error: 'Mini-league member was not found.' }, { status: 404 });
    await memberRef.update({
      status: parsed.data.status,
      moderatedByUserId: actor.uid,
      moderatedAt: FieldValue.serverTimestamp(),
    });
    return Response.json({ id: member.id, status: parsed.data.status });
  }

  const leagueQuery = await adminDb.collection('fantasyMiniLeagues')
    .where('inviteCode', '==', parsed.data.inviteCode.toUpperCase())
    .where('status', '==', 'active')
    .limit(1)
    .get();
  if (leagueQuery.empty) return Response.json({ error: 'Invite code was not found.' }, { status: 404 });
  const league = leagueQuery.docs[0];
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
