import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { fantasyRecordHasFinancialFields, validateFantasySquad } from '@/lib/fantasy/squad';
import type {
  FantasyCompetition,
  FantasyPlayer,
  FantasyPlayerPrice,
  FantasyRound,
  FantasySquadRules,
} from '@/types/fantasy';
import { isFantasyFanRole } from '@/lib/fantasy/access';
import { parseJsonBody, requireAuthenticatedUser } from '@/server/api/security';

export const runtime = 'nodejs';

const lineupSchema = z.object({
  competitionId: z.string().trim().min(1).max(180),
  roundId: z.string().trim().min(1).max(180),
  teamName: z.string().trim().min(3).max(40),
  squadAthleteIds: z.array(z.string().trim().min(1).max(180)).max(30),
  startingAthleteIds: z.array(z.string().trim().min(1).max(180)).max(20),
  benchAthleteIds: z.array(z.string().trim().min(1).max(180)).max(15),
  captainAthleteId: z.string().trim().min(1).max(180),
  viceCaptainAthleteId: z.string().trim().min(1).max(180),
});

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return Response.json({ error: 'Sign in to submit a fantasy squad.' }, { status: auth.response?.status ?? 401 });
  const actor = auth.actor;
  const parsed = await parseJsonBody(request, lineupSchema, { maxBytes: 8 * 1024 });
  if ('response' in parsed) {
    return Response.json({ error: 'Invalid fantasy squad.' }, { status: parsed.response.status });
  }
  if (fantasyRecordHasFinancialFields(parsed.data)) {
    return Response.json({ error: 'Invalid fantasy squad.' }, { status: 400 });
  }
  const profile = await adminDb.collection('users').doc(actor.uid).get();
  const profileRole = profile.data()?.role;
  if (!isFantasyFanRole(actor.role, profileRole)) {
    return Response.json({ error: 'GoalPlace Fantasy is available to Fan accounts only.' }, { status: 403 });
  }
  const input = parsed.data;
  const [competitionSnapshot, roundSnapshot] = await Promise.all([
    adminDb.collection('fantasyCompetitions').doc(input.competitionId).get(),
    adminDb.collection('fantasyRounds').doc(input.roundId).get(),
  ]);
  if (!competitionSnapshot.exists || !roundSnapshot.exists) {
    return Response.json({ error: 'Fantasy competition or round was not found.' }, { status: 404 });
  }
  const competition = { id: competitionSnapshot.id, ...competitionSnapshot.data()! } as FantasyCompetition;
  const round = { id: roundSnapshot.id, ...roundSnapshot.data()! } as FantasyRound;
  if (
    competition.status !== 'active'
    || round.competitionId !== competition.id
    || round.status !== 'open'
  ) {
    return Response.json({ error: 'This fantasy round is not open.' }, { status: 409 });
  }
  const [rulesSnapshot, playerSnapshots, priceSnapshots] = await Promise.all([
    adminDb.collection('fantasySquadRules').doc(competition.squadRulesId).get(),
    adminDb.collection('fantasyPlayers').where('competitionId', '==', competition.id).get(),
    adminDb.collection('fantasyPlayerPrices')
      .where('competitionId', '==', competition.id)
      .where('status', '==', 'published')
      .get(),
  ]);
  if (!rulesSnapshot.exists) return Response.json({ error: 'Squad rules are unavailable.' }, { status: 409 });
  const rules = { id: rulesSnapshot.id, ...rulesSnapshot.data()! } as FantasySquadRules;
  const players = playerSnapshots.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data()! } as FantasyPlayer));
  const prices = priceSnapshots.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data()! } as FantasyPlayerPrice));
  const teamId = `${competition.id}_${actor.uid}`;
  const teamRef = adminDb.collection('fantasyTeams').doc(teamId);
  const existingTeam = await teamRef.get();
  const existingLineupId = existingTeam.data()?.currentLineupVersionId as string | undefined;
  const existingLineup = existingLineupId
    ? await adminDb.collection('fantasyLineupVersions').doc(existingLineupId).get()
    : null;
  if (
    existingLineup?.exists
    && existingLineup.data()?.roundId === round.id
    && existingLineup.data()?.status === 'locked'
  ) {
    return Response.json({ error: 'This lineup is already locked for the round.' }, { status: 409 });
  }
  const version = Number(existingTeam.data()?.lineupVersion ?? 0) + 1;
  const lineupId = `${teamId}_${round.id}_v${version}`;
  const lineup = {
    id: lineupId,
    fantasyTeamId: teamId,
    competitionId: competition.id,
    roundId: round.id,
    version,
    squadAthleteIds: input.squadAthleteIds,
    startingAthleteIds: input.startingAthleteIds,
    benchAthleteIds: input.benchAthleteIds,
    captainAthleteId: input.captainAthleteId,
    viceCaptainAthleteId: input.viceCaptainAthleteId,
    creditsUsed: 0,
    status: 'submitted' as const,
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  const validation = validateFantasySquad({
    lineup,
    players,
    prices,
    rules,
    serverNow: new Date().toISOString(),
    deadlineAt: round.deadlineAt,
  });
  if (!validation.valid) {
    return Response.json({ error: 'Squad validation failed.', errors: validation.errors }, { status: 409 });
  }
  const role = 'fan';
  const conflictRoles: string[] = [];
  const batch = adminDb.batch();
  if (existingTeam.exists && existingTeam.data()?.userId !== actor.uid) {
    return Response.json({ error: 'Fantasy team ownership conflict.' }, { status: 403 });
  }
  if (
    existingLineup?.exists
    && existingLineup.data()?.roundId === round.id
    && existingLineup.data()?.status === 'submitted'
  ) {
    batch.set(
      existingLineup.ref,
      { status: 'superseded', supersededAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  batch.set(teamRef, {
    id: teamId,
    competitionId: competition.id,
    userId: actor.uid,
    name: input.teamName,
    currentLineupVersionId: lineupId,
    lineupVersion: version,
    conflictRoles,
    createdAt: existingTeam.data()?.createdAt ?? FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.create(adminDb.collection('fantasyLineupVersions').doc(lineupId), {
    ...lineup,
    creditsUsed: validation.creditsUsed,
  });
  batch.create(adminDb.collection('fantasyAuditEvents').doc(), {
    action: existingTeam.exists ? 'lineup_replaced' : 'fantasy_team_created',
    actorUserId: actor.uid,
    actorRole: role,
    conflictRoles,
    competitionId: competition.id,
    roundId: round.id,
    lineupVersionId: lineupId,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return Response.json({
    fantasyTeamId: teamId,
    lineupVersionId: lineupId,
    creditsUsed: validation.creditsUsed,
    creditsRemaining: validation.creditsRemaining,
    deadlineAt: round.deadlineAt,
  }, { status: existingTeam.exists ? 200 : 201 });
}
