import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { fantasyGameMode, pick5LineupVersion, validatePick5Lineup } from '@/lib/fantasy/pick5';
import { fantasyRecordHasFinancialFields } from '@/lib/fantasy/squad';
import type {
  FantasyCompetition,
  FantasyPlayer,
  FantasyRound,
} from '@/types/fantasy';
import { requireAuthenticatedMutation, requireFanAccountPrincipal } from '@/server/api/security';

export const runtime = 'nodejs';

/**
 * Submits a Pick 5 lineup for one round.
 *
 * Separate from the squad route because it is a different game, not a smaller squad: no
 * bench, no vice-captain, no positional groups, no budget, and a scout slot the squad game
 * has no concept of. Sharing one endpoint would mean one schema carrying two sets of
 * mutually exclusive fields and a validator branching on which half was populated.
 *
 * What it does share is everything that matters for trust: the same server-enforced deadline,
 * the same lineup-version record, the same audit trail, and the same point events at scoring
 * time. Pick 5 is a lineup shape over identical points.
 */
const pick5Schema = z.object({
  competitionId: z.string().trim().min(1).max(180),
  roundId: z.string().trim().min(1).max(180),
  teamName: z.string().trim().min(3).max(40),
  squadAthleteIds: z.array(z.string().trim().min(1).max(180)).min(1).max(5),
  captainAthleteId: z.string().trim().min(1).max(180),
  scoutAthleteId: z.string().trim().min(1).max(180),
});

export async function POST(request: Request) {
  const guarded = await requireAuthenticatedMutation(request, pick5Schema, {
    maxBytes: 4 * 1024,
    invalidBodyError: 'Invalid Pick 5 lineup.',
    authError: 'Sign in to submit a Pick 5 lineup.',
    rateLimit: { bucket: 'fantasy_lineup', limit: 40, windowSeconds: 300 },
  });
  if ('response' in guarded) return guarded.response;
  const actor = guarded.actor;
  const input = guarded.data;
  // Fantasy is free to play with no cash pool, so a lineup carrying money fields is a
  // malformed or hostile request either way.
  if (fantasyRecordHasFinancialFields(input)) {
    return Response.json({ error: 'Invalid Pick 5 lineup.' }, { status: 400 });
  }
  const fanAccount = await requireFanAccountPrincipal(actor, 'GoalPlace Fantasy is available to Fan accounts only.');
  if ('response' in fanAccount) return fanAccount.response;

  const [competitionSnapshot, roundSnapshot] = await Promise.all([
    adminDb.collection('fantasyCompetitions').doc(input.competitionId).get(),
    adminDb.collection('fantasyRounds').doc(input.roundId).get(),
  ]);
  if (!competitionSnapshot.exists || !roundSnapshot.exists) {
    return Response.json({ error: 'Fantasy competition or round was not found.' }, { status: 404 });
  }
  const competition = { id: competitionSnapshot.id, ...competitionSnapshot.data()! } as FantasyCompetition;
  const round = { id: roundSnapshot.id, ...roundSnapshot.data()! } as FantasyRound;
  if (fantasyGameMode(competition) !== 'pick5') {
    return Response.json({ error: 'This competition does not run Pick 5.' }, { status: 409 });
  }
  if (
    competition.status !== 'active'
    || round.competitionId !== competition.id
    || round.status !== 'open'
  ) {
    return Response.json({ error: 'This fantasy round is not open.' }, { status: 409 });
  }

  const playerSnapshots = await adminDb.collection('fantasyPlayers')
    .where('competitionId', '==', competition.id)
    .get();
  const players = playerSnapshots.docs.map((snapshot) =>
    ({ id: snapshot.id, ...snapshot.data()! } as FantasyPlayer));

  const teamId = `${competition.id}_${actor.uid}`;
  const teamRef = adminDb.collection('fantasyTeams').doc(teamId);
  const existingTeam = await teamRef.get();
  if (existingTeam.exists && existingTeam.data()?.userId !== actor.uid) {
    return Response.json({ error: 'Fantasy team ownership conflict.' }, { status: 403 });
  }
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

  /*
   * Ownership is read from the server's own player records, never from the request. A client
   * that could name its own scout threshold could pick anyone as a scout.
   */
  const validation = validatePick5Lineup({
    lineup: {
      squadAthleteIds: input.squadAthleteIds,
      captainAthleteId: input.captainAthleteId,
      scoutAthleteId: input.scoutAthleteId,
    },
    players,
    competition,
    serverNow: new Date().toISOString(),
    deadlineAt: round.deadlineAt,
  });
  if (!validation.valid) {
    return Response.json({ error: 'Pick 5 validation failed.', errors: validation.errors }, { status: 409 });
  }

  const version = Number(existingTeam.data()?.lineupVersion ?? 0) + 1;
  const lineupId = `${teamId}_${round.id}_v${version}`;
  const lineup = pick5LineupVersion({
    id: lineupId,
    fantasyTeamId: teamId,
    competitionId: competition.id,
    roundId: round.id,
    version,
    lineup: {
      squadAthleteIds: input.squadAthleteIds,
      captainAthleteId: input.captainAthleteId,
      scoutAthleteId: input.scoutAthleteId,
    },
    status: 'submitted',
    createdAt: new Date().toISOString(),
  });

  const batch = adminDb.batch();
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
    conflictRoles: [],
    createdAt: existingTeam.data()?.createdAt ?? FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.create(adminDb.collection('fantasyLineupVersions').doc(lineupId), {
    ...lineup,
    submittedAt: new Date().toISOString(),
  });
  batch.create(adminDb.collection('fantasyAuditEvents').doc(), {
    action: existingTeam.exists ? 'pick5_lineup_replaced' : 'pick5_team_created',
    actorUserId: actor.uid,
    actorRole: 'fan',
    competitionId: competition.id,
    roundId: round.id,
    lineupVersionId: lineupId,
    scoutAthleteId: input.scoutAthleteId,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return Response.json({
    fantasyTeamId: teamId,
    lineupVersionId: lineupId,
    scoutThresholdPercent: validation.scoutThresholdPercent,
    deadlineAt: round.deadlineAt,
  }, { status: existingTeam.exists ? 200 : 201 });
}
