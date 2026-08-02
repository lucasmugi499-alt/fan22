import { createHash } from 'node:crypto';
import {
  FieldValue,
  type Firestore,
  type WriteBatch,
} from 'firebase-admin/firestore';
import { buildFantasyCorrection } from '@/lib/fantasy/corrections';
import { scoreFantasyLineup } from '@/lib/fantasy/lineupScoring';
import {
  mergeOfficialFantasyRoundEvents,
  scoreOfficialFantasyPerformance,
} from '@/lib/fantasy/scoring';
import type {
  FantasyCompetition,
  FantasyLineupVersion,
  FantasyOfficialAthletePerformance,
  FantasyPointEvent,
  FantasyRound,
  FantasyRoundScore,
  FantasyScoringProfile,
  FantasyTeam,
} from '@/types/fantasy';
import type { Match } from '@/types';

function documentId(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function asRecord<T>(id: string, data: FirebaseFirestore.DocumentData) {
  return { id, ...data } as T;
}

type BatchOperation = (batch: WriteBatch) => void;

async function commitChunked(
  db: Firestore,
  operations: BatchOperation[],
  chunkSize = 450,
) {
  for (let index = 0; index < operations.length; index += chunkSize) {
    const batch = db.batch();
    operations.slice(index, index + chunkSize).forEach((operation) => operation(batch));
    await batch.commit();
  }
}

export interface FantasyScoringOutcome {
  competitionsScored: number;
  pointEventsWritten: number;
  lineupsScored: number;
  correctionsWritten: number;
}

export async function lockFantasyRoundLineups(db: Firestore, roundId: string) {
  const roundRef = db.collection('fantasyRounds').doc(roundId);
  const roundSnapshot = await roundRef.get();
  if (!roundSnapshot.exists) throw new Error('Fantasy round was not found.');
  const round = asRecord<FantasyRound>(roundSnapshot.id, roundSnapshot.data()!);
  if (Date.parse(round.deadlineAt) > Date.now()) return 0;
  const submitted = await db.collection('fantasyLineupVersions')
    .where('roundId', '==', roundId)
    .where('status', '==', 'submitted')
    .get();
  if (submitted.empty) {
    if (round.status === 'open') {
      await roundRef.set({ status: 'locked', lockedAt: new Date().toISOString() }, { merge: true });
    }
    return 0;
  }
  const lockedAt = new Date().toISOString();
  const operations: BatchOperation[] = submitted.docs.map((lineup) =>
    (batch) => batch.update(lineup.ref, { status: 'locked', lockedAt }),
  );
  operations.push((batch) =>
    batch.set(roundRef, { status: 'locked', lockedAt }, { merge: true }),
  );
  await commitChunked(db, operations);
  return submitted.size;
}

/**
 * Scores a finalized match from server-owned records only.
 *
 * The trusted result finalizer remains the sole writer of official match versions. This
 * processor consumes that output and official athlete performance records; it never
 * interprets a Team Admin submission as Fantasy Points.
 */
export async function scoreFinalizedFantasyMatch(
  db: Firestore,
  matchId: string,
): Promise<FantasyScoringOutcome> {
  const matchSnapshot = await db.collection('matches').doc(matchId).get();
  if (!matchSnapshot.exists) throw new Error('Official match was not found.');
  const match = asRecord<Match>(matchSnapshot.id, matchSnapshot.data()!);
  if (
    match.verificationStatus !== 'verified'
    || match.status !== 'completed'
    || !match.officialResultVersion
  ) {
    throw new Error('Fantasy scoring requires a completed, verified official result version.');
  }

  const competitionSnapshots = await db.collection('fantasyCompetitions')
    .where('leagueId', '==', match.leagueId)
    .where('seasonId', '==', match.seasonId)
    .where('status', '==', 'active')
    .get();
  const competitions = competitionSnapshots.docs.map((snapshot) =>
    asRecord<FantasyCompetition>(snapshot.id, snapshot.data()),
  );
  const outcome: FantasyScoringOutcome = {
    competitionsScored: 0,
    pointEventsWritten: 0,
    lineupsScored: 0,
    correctionsWritten: 0,
  };

  for (const competition of competitions) {
    const roundSnapshot = await db.collection('fantasyRounds')
      .where('competitionId', '==', competition.id)
      .where('matchIds', 'array-contains', matchId)
      .limit(1)
      .get();
    if (roundSnapshot.empty) continue;
    const round = asRecord<FantasyRound>(
      roundSnapshot.docs[0].id,
      roundSnapshot.docs[0].data(),
    );
    await lockFantasyRoundLineups(db, round.id);
    const profileSnapshot = await db.collection('fantasyScoringProfiles')
      .doc(competition.scoringProfileId)
      .get();
    if (!profileSnapshot.exists) throw new Error(`Missing scoring profile ${competition.scoringProfileId}.`);
    const profile = asRecord<FantasyScoringProfile>(
      profileSnapshot.id,
      profileSnapshot.data()!,
    );
    if (
      profile.version !== competition.scoringProfileVersion
      || profile.status !== 'approved'
    ) {
      throw new Error('The active competition scoring profile is not the approved locked version.');
    }

    const performanceSnapshots = await db.collection('officialAthleteMatchStats')
      .where('matchId', '==', matchId)
      .where('officialResultVersion', '==', match.officialResultVersion)
      .get();
    const performances = performanceSnapshots.docs.map((snapshot) =>
      asRecord<FantasyOfficialAthletePerformance>(snapshot.id, snapshot.data()),
    );
    const now = new Date().toISOString();
    const replacementEvents = performances.flatMap((performance) =>
      scoreOfficialFantasyPerformance({
        competition,
        profile,
        roundId: round.id,
        performance,
        status: 'official',
        createdAt: now,
      }),
    );
    const previousSnapshots = await db.collection('fantasyPointEvents')
      .where('competitionId', '==', competition.id)
      .where('matchId', '==', matchId)
      .get();
    const roundEventSnapshots = await db.collection('fantasyPointEvents')
      .where('competitionId', '==', competition.id)
      .where('roundId', '==', round.id)
      .get();
    const existingRoundEvents = roundEventSnapshots.docs.map((snapshot) =>
      asRecord<FantasyPointEvent>(snapshot.id, snapshot.data()),
    );
    const previousEvents = previousSnapshots.docs
      .map((snapshot) => asRecord<FantasyPointEvent>(snapshot.id, snapshot.data()))
      .filter((event) =>
        event.officialResultVersion !== match.officialResultVersion
        && event.status !== 'superseded',
      );
    const lineupSnapshots = await db.collection('fantasyLineupVersions')
      .where('competitionId', '==', competition.id)
      .where('roundId', '==', round.id)
      .where('status', '==', 'locked')
      .get();
    const lineups = lineupSnapshots.docs.map((snapshot) =>
      asRecord<FantasyLineupVersion>(snapshot.id, snapshot.data()),
    );
    const scoredEvents = previousEvents.length
      ? replacementEvents.map((event) => ({ ...event, status: 'corrected' as const }))
      : replacementEvents;
    const roundEventsBefore = existingRoundEvents.filter((event) => event.status !== 'superseded');
    const uniqueCurrentVersionEvents = mergeOfficialFantasyRoundEvents({
      existingEvents: roundEventsBefore,
      matchId,
      officialResultVersion: match.officialResultVersion,
      replacementEvents: scoredEvents,
    });
    const roundScores = lineups.map((lineup) =>
      scoreFantasyLineup({
        competitionId: competition.id,
        roundId: round.id,
        fantasyTeamId: lineup.fantasyTeamId,
        lineup,
        pointEvents: uniqueCurrentVersionEvents,
        profile,
        calculatedAt: now,
      }),
    );

    const writeOperations: BatchOperation[] = [];
    for (const previous of previousEvents) {
      writeOperations.push((batch) =>
        batch.update(db.collection('fantasyPointEvents').doc(previous.id), {
          status: 'superseded',
          supersededAt: now,
        }),
      );
    }
    for (const event of scoredEvents) {
      writeOperations.push((batch) =>
        batch.set(
          db.collection('fantasyPointEvents').doc(documentId(event.idempotencyKey)),
          event,
          { merge: false },
        ),
      );
    }
    for (const score of roundScores) {
      writeOperations.push((batch) =>
        batch.set(db.collection('fantasyRoundScores').doc(documentId(score.id)), score),
      );
    }
    const auditId = documentId([
      competition.id,
      round.id,
      matchId,
      match.officialResultVersion,
      'score',
    ].join(':'));
    writeOperations.push((batch) =>
      batch.set(db.collection('fantasyAuditEvents').doc(auditId), {
        action: previousEvents.length ? 'official_score_corrected' : 'official_score_generated',
        competitionId: competition.id,
        roundId: round.id,
        matchId,
        officialResultVersion: match.officialResultVersion,
        pointEventCount: scoredEvents.length,
        lineupCount: roundScores.length,
        createdAt: now,
      }),
    );
    await commitChunked(db, writeOperations);

    if (previousEvents.length) {
      const correction = buildFantasyCorrection({
        competitionId: competition.id,
        roundId: round.id,
        matchId,
        previousVersion: Math.max(
          ...previousEvents.map((event) => event.officialResultVersion),
        ),
        newVersion: match.officialResultVersion,
        previousEvents: roundEventsBefore,
        replacementEvents: uniqueCurrentVersionEvents,
        lineups,
        profile,
        reason: 'Official match result or athlete performance record was corrected.',
        createdAt: now,
      });
      await db.collection('fantasyCorrections').doc(correction.correction.id)
        .set(correction.correction);
      for (const fantasyTeamId of correction.correction.affectedFantasyTeamIds) {
        const fantasyTeam = await db.collection('fantasyTeams').doc(fantasyTeamId).get();
        const userId = fantasyTeam.data()?.userId as string | undefined;
        if (userId) {
          await db.collection('notifications').add({
            userId,
            type: 'fantasy_score_corrected',
            title: 'Fantasy score corrected',
            body: `An official result changed your round total from ${correction.correction.oldTotals[fantasyTeamId] ?? 0} to ${correction.correction.newTotals[fantasyTeamId] ?? 0}.`,
            read: false,
            href: `/fantasy/competitions/${competition.id}/points`,
            createdAt: now,
          });
        }
      }
      outcome.correctionsWritten += 1;
    }

    await rebuildFantasyLeaderboard(db, competition.id);
    const roundMatches = await Promise.all(
      round.matchIds.map((roundMatchId) => db.collection('matches').doc(roundMatchId).get()),
    );
    const roundIsOfficial = roundMatches.every((roundMatch) =>
      roundMatch.exists
      && roundMatch.data()?.status === 'completed'
      && roundMatch.data()?.verificationStatus === 'verified'
      && Number(roundMatch.data()?.officialResultVersion ?? 0) > 0,
    );
    await db.collection('fantasyRounds').doc(round.id).set({
      status: roundIsOfficial
        ? previousEvents.length ? 'corrected' : 'official'
        : 'scoring',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    outcome.competitionsScored += 1;
    outcome.pointEventsWritten += scoredEvents.length;
    outcome.lineupsScored += roundScores.length;
  }
  return outcome;
}

async function rebuildFantasyLeaderboard(db: Firestore, competitionId: string) {
  const [teamSnapshots, scoreSnapshots] = await Promise.all([
    db.collection('fantasyTeams').where('competitionId', '==', competitionId).get(),
    db.collection('fantasyRoundScores').where('competitionId', '==', competitionId).get(),
  ]);
  const teams = teamSnapshots.docs.map((snapshot) =>
    asRecord<FantasyTeam>(snapshot.id, snapshot.data()),
  );
  const scores = scoreSnapshots.docs.map((snapshot) =>
    asRecord<FantasyRoundScore>(snapshot.id, snapshot.data()),
  );
  const totals = teams.map((team) => ({
    team,
    totalPoints: scores
      .filter((score) => score.fantasyTeamId === team.id && (
        score.status === 'official' || score.status === 'corrected'
      ))
      .reduce((total, score) => total + score.totalPoints, 0),
    roundsPlayed: new Set(
      scores.filter((score) => score.fantasyTeamId === team.id).map((score) => score.roundId),
    ).size,
  })).sort((left, right) => right.totalPoints - left.totalPoints);

  const previousSnapshot = await db.collection('fantasyLeaderboards')
    .where('competitionId', '==', competitionId)
    .get();
  const previousRanks = new Map(
    previousSnapshot.docs.map((snapshot) => [
      snapshot.data().fantasyTeamId as string,
      snapshot.data().rank as number,
    ]),
  );
  const operations: BatchOperation[] = totals.map(
    ({ team, totalPoints, roundsPlayed }, index) => {
      const previousRank = previousRanks.get(team.id);
      return (batch) => batch.set(
        db.collection('fantasyLeaderboards').doc(`${competitionId}_${team.id}`),
        {
          id: `${competitionId}_${team.id}`,
          competitionId,
          fantasyTeamId: team.id,
          userId: team.userId,
          teamName: team.name,
          totalPoints,
          rank: index + 1,
          ...(previousRank === undefined ? {} : { previousRank }),
          roundsPlayed,
          updatedAt: new Date().toISOString(),
        },
      );
    },
  );
  await commitChunked(db, operations);
}
