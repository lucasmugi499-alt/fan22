import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { validateFantasySquad } from '@/lib/fantasy/squad';
import type {
  FantasyLineupVersion,
  FantasyPlayer,
  FantasyPlayerPrice,
  FantasyRound,
  FantasySquadRules,
} from '@/types/fantasy';

export const runtime = 'nodejs';

const schema = z.object({
  competitionId: z.string().min(1),
  roundId: z.string().min(1),
  athleteOutId: z.string().min(1),
  athleteInId: z.string().min(1),
});

function tokenFrom(request: Request) {
  const header = request.headers.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

export async function POST(request: Request) {
  const token = tokenFrom(request);
  const actor = token ? await adminAuth.verifyIdToken(token).catch(() => null) : null;
  if (!actor) return Response.json({ error: 'Sign in to make a fantasy transfer.' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.athleteInId === parsed.data.athleteOutId) {
    return Response.json({ error: 'Choose two different eligible athletes.' }, { status: 400 });
  }
  const input = parsed.data;
  const teamRef = adminDb.collection('fantasyTeams').doc(`${input.competitionId}_${actor.uid}`);
  const [team, roundSnapshot, competition] = await Promise.all([
    teamRef.get(),
    adminDb.collection('fantasyRounds').doc(input.roundId).get(),
    adminDb.collection('fantasyCompetitions').doc(input.competitionId).get(),
  ]);
  if (!team.exists || team.data()?.userId !== actor.uid) {
    return Response.json({ error: 'Your fantasy team was not found.' }, { status: 404 });
  }
  if (!roundSnapshot.exists || !competition.exists) {
    return Response.json({ error: 'Fantasy round was not found.' }, { status: 404 });
  }
  const round = { id: roundSnapshot.id, ...roundSnapshot.data()! } as FantasyRound;
  if (round.status !== 'open' || Date.now() >= Date.parse(round.deadlineAt)) {
    return Response.json({ error: 'Transfers are locked for this round.' }, { status: 409 });
  }
  const lineupId = team.data()?.currentLineupVersionId as string | undefined;
  const lineupSnapshot = lineupId
    ? await adminDb.collection('fantasyLineupVersions').doc(lineupId).get()
    : null;
  if (
    !lineupSnapshot?.exists
    || lineupSnapshot.data()?.roundId !== round.id
    || lineupSnapshot.data()?.status !== 'submitted'
  ) {
    return Response.json({ error: 'No editable lineup exists for this round.' }, { status: 409 });
  }
  const lineup = { id: lineupSnapshot.id, ...lineupSnapshot.data()! } as FantasyLineupVersion;
  if (
    !lineup.squadAthleteIds.includes(input.athleteOutId)
    || lineup.squadAthleteIds.includes(input.athleteInId)
    || lineup.captainAthleteId === input.athleteOutId
    || lineup.viceCaptainAthleteId === input.athleteOutId
  ) {
    return Response.json({ error: 'Transfer selection conflicts with the current squad or leadership.' }, { status: 409 });
  }
  const rulesSnapshot = await adminDb.collection('fantasySquadRules')
    .doc(competition.data()!.squadRulesId)
    .get();
  const transfers = await adminDb.collection('fantasyTransfers')
    .where('fantasyTeamId', '==', team.id)
    .where('roundId', '==', round.id)
    .where('status', 'in', ['submitted', 'applied'])
    .get();
  const rules = { id: rulesSnapshot.id, ...rulesSnapshot.data()! } as FantasySquadRules;
  if (transfers.size >= rules.transferAllowancePerRound) {
    return Response.json({ error: 'The round transfer allowance has been used.' }, { status: 409 });
  }
  const [playersSnapshot, pricesSnapshot] = await Promise.all([
    adminDb.collection('fantasyPlayers').where('competitionId', '==', input.competitionId).get(),
    adminDb.collection('fantasyPlayerPrices')
      .where('competitionId', '==', input.competitionId)
      .where('status', '==', 'published')
      .get(),
  ]);
  const replace = (ids: string[]) => ids.map((id) => id === input.athleteOutId ? input.athleteInId : id);
  const version = Number(team.data()?.lineupVersion ?? lineup.version) + 1;
  const nextLineup: FantasyLineupVersion = {
    ...lineup,
    id: `${team.id}_${round.id}_v${version}`,
    version,
    squadAthleteIds: replace(lineup.squadAthleteIds),
    startingAthleteIds: replace(lineup.startingAthleteIds),
    benchAthleteIds: replace(lineup.benchAthleteIds),
    creditsUsed: 0,
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  const validation = validateFantasySquad({
    lineup: nextLineup,
    players: playersSnapshot.docs.map((item) => ({ id: item.id, ...item.data()! } as FantasyPlayer)),
    prices: pricesSnapshot.docs.map((item) => ({ id: item.id, ...item.data()! } as FantasyPlayerPrice)),
    rules,
    serverNow: new Date().toISOString(),
    deadlineAt: round.deadlineAt,
  });
  if (!validation.valid) {
    return Response.json({ error: 'Transfer would make the squad invalid.', errors: validation.errors }, { status: 409 });
  }
  const transferRef = adminDb.collection('fantasyTransfers').doc();
  const transfersRemaining = await adminDb.runTransaction(async (transaction) => {
    const currentTransfersQuery = adminDb.collection('fantasyTransfers')
      .where('fantasyTeamId', '==', team.id)
      .where('roundId', '==', round.id)
      .where('status', 'in', ['submitted', 'applied']);
    const [latestTeam, latestLineup, latestTransfers] = await Promise.all([
      transaction.get(teamRef),
      transaction.get(lineupSnapshot.ref),
      transaction.get(currentTransfersQuery),
    ]);
    if (
      latestTeam.data()?.currentLineupVersionId !== lineup.id
      || latestLineup.data()?.status !== 'submitted'
    ) {
      throw new Error('LINEUP_CHANGED');
    }
    if (latestTransfers.size >= rules.transferAllowancePerRound) {
      throw new Error('TRANSFER_LIMIT');
    }
    transaction.update(lineupSnapshot.ref, {
      status: 'superseded',
      supersededAt: FieldValue.serverTimestamp(),
    });
    transaction.create(adminDb.collection('fantasyLineupVersions').doc(nextLineup.id), {
      ...nextLineup,
      creditsUsed: validation.creditsUsed,
    });
    transaction.update(teamRef, {
      currentLineupVersionId: nextLineup.id,
      lineupVersion: version,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(transferRef, {
      id: transferRef.id,
      competitionId: input.competitionId,
      fantasyTeamId: team.id,
      roundId: round.id,
      userId: actor.uid,
      athleteOutId: input.athleteOutId,
      athleteInId: input.athleteInId,
      lineupVersionId: nextLineup.id,
      status: 'applied',
      createdAt: FieldValue.serverTimestamp(),
    });
    return rules.transferAllowancePerRound - latestTransfers.size - 1;
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === 'LINEUP_CHANGED') return 'changed' as const;
    if (error instanceof Error && error.message === 'TRANSFER_LIMIT') return 'limit' as const;
    throw error;
  });
  if (transfersRemaining === 'changed') {
    return Response.json({ error: 'Your lineup changed. Reload before making another transfer.' }, { status: 409 });
  }
  if (transfersRemaining === 'limit') {
    return Response.json({ error: 'The round transfer allowance has been used.' }, { status: 409 });
  }
  return Response.json({
    transferId: transferRef.id,
    lineupVersionId: nextLineup.id,
    transfersRemaining,
  }, { status: 201 });
}
