import { createHash } from 'node:crypto';
import {
  FieldValue,
  type Firestore,
  type WriteBatch,
} from 'firebase-admin/firestore';
import { buildFantasyCorrection } from '@/lib/fantasy/corrections';
import { notify } from '@/server/notifications/notify';
import {
  buildFantasyFixtureVoid,
  evaluateFixtureScoringGate,
} from '@/lib/fantasy/fairness';
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
  /** Fixtures the fairness gate refused to score. Never partially scored. */
  fixturesVoided: number;
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
    fixturesVoided: 0,
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

    /**
     * Fair or void, decided before a single point event is written.
     *
     * The scoring engine drops rules it cannot evaluate, which for a fixture with uneven
     * coverage produces a quietly unfair round: some athletes scored on eleven rules, some on
     * three, and nothing on the page says so. The gate refuses that outcome. Either every
     * enabled rule is evaluable for every athlete in the fixture, or the fixture scores zero
     * for everyone with a published reason.
     *
     * The official result, its events and the standings are untouched either way. This is
     * fantasy declining to score a match, not a sporting decision about it.
     */
    /*
     * Deliberately not caught. Swallowing a failure here would score the fixture as though it
     * had no open exceptions, which is the one direction that silently produces the unfair
     * round the gate exists to prevent. A failed read should fail the scoring job loudly and
     * be retried, not resolve itself into a permissive answer.
     */
    const openExceptions = await db.collection('matchOperationalExceptions')
      .where('matchId', '==', matchId)
      .where('status', 'in', ['open', 'acknowledged', 'escalated', 'pending'])
      .get();
    const gate = evaluateFixtureScoringGate({
      competition,
      profile,
      performances,
      conditions: {
        abandoned: match.status !== 'completed',
        openExceptionCount: openExceptions.size,
      },
    });

    if (gate.decision === 'void') {
      await voidFantasyFixture(db, {
        competition,
        round,
        match,
        gate,
        now,
      });
      outcome.fixturesVoided += 1;
      outcome.competitionsScored += 1;
      continue;
    }

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
        batch.update(db.collection('fantasyPointEvents').doc(documentId(previous.idempotencyKey)), {
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
          // `notify`, not `.add()`. Firestore triggers are retried by design, and `.add()`
          // mints a new document every time — at-least-once delivery plus `.add()` is a
          // duplicate generator. A deterministic id makes redelivery a no-op.
          await notify(db, {
            userId,
            event: 'fantasy_score_corrected',
            entityId: correction.correction.id,
            title: 'Fantasy score corrected',
            body: `An official result changed your round total from ${correction.correction.oldTotals[fantasyTeamId] ?? 0} to ${correction.correction.newTotals[fantasyTeamId] ?? 0}.`,
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

/**
 * Publishes a fixture void, and removes any points that fixture had already produced.
 *
 * Symmetry is the whole point of voiding, so this supersedes every point event the fixture
 * previously wrote before recording the void. Leaving them in place would mean the managers
 * who happened to be scored under an earlier version kept their points while everyone else
 * got nothing, which is a worse unfairness than the one voiding exists to prevent.
 *
 * Round scores are rebuilt from the remaining events, so a voided fixture contributes zero to
 * every manager rather than a stale total.
 */
async function voidFantasyFixture(
  db: Firestore,
  {
    competition,
    round,
    match,
    gate,
    now,
  }: {
    competition: FantasyCompetition;
    round: FantasyRound;
    match: Match;
    gate: Extract<ReturnType<typeof evaluateFixtureScoringGate>, { decision: 'void' }>;
    now: string;
  },
) {
  const voidRecord = buildFantasyFixtureVoid({
    competitionId: competition.id,
    roundId: round.id,
    matchId: match.id,
    officialResultVersion: match.officialResultVersion ?? 0,
    gate,
    createdAt: now,
  });

  const existingSnapshots = await db.collection('fantasyPointEvents')
    .where('competitionId', '==', competition.id)
    .where('matchId', '==', match.id)
    .get();
  const superseded = existingSnapshots.docs.filter((snapshot) => snapshot.data().status !== 'superseded');

  const operations: BatchOperation[] = superseded.map((snapshot) =>
    (batch) => batch.update(snapshot.ref, { status: 'superseded', supersededAt: now }),
  );
  operations.push((batch) =>
    batch.set(db.collection('fantasyFixtureVoids').doc(documentId(voidRecord.id)), voidRecord),
  );
  operations.push((batch) =>
    batch.set(db.collection('fantasyAuditEvents').doc(documentId(`${voidRecord.id}:void`)), {
      action: 'fixture_voided_for_fantasy',
      competitionId: competition.id,
      roundId: round.id,
      matchId: match.id,
      officialResultVersion: match.officialResultVersion ?? 0,
      reason: voidRecord.reason,
      unevaluableRuleIds: voidRecord.unevaluableRuleIds,
      supersededPointEventCount: superseded.length,
      createdAt: now,
    }),
  );
  await commitChunked(db, operations);

  /*
   * Rescored from what remains, so the round total a manager sees never includes points from
   * a fixture that is no longer being scored.
   */
  const [lineupSnapshots, roundEventSnapshots, profileSnapshot] = await Promise.all([
    db.collection('fantasyLineupVersions')
      .where('competitionId', '==', competition.id)
      .where('roundId', '==', round.id)
      .where('status', '==', 'locked')
      .get(),
    db.collection('fantasyPointEvents')
      .where('competitionId', '==', competition.id)
      .where('roundId', '==', round.id)
      .get(),
    db.collection('fantasyScoringProfiles').doc(competition.scoringProfileId).get(),
  ]);
  const profile = asRecord<FantasyScoringProfile>(profileSnapshot.id, profileSnapshot.data() ?? {});
  const liveEvents = roundEventSnapshots.docs
    .map((snapshot) => asRecord<FantasyPointEvent>(snapshot.id, snapshot.data()))
    .filter((event) => event.status !== 'superseded');
  const rescore: BatchOperation[] = lineupSnapshots.docs.map((snapshot) => {
    const lineup = asRecord<FantasyLineupVersion>(snapshot.id, snapshot.data());
    const score = scoreFantasyLineup({
      competitionId: competition.id,
      roundId: round.id,
      fantasyTeamId: lineup.fantasyTeamId,
      lineup,
      pointEvents: liveEvents,
      profile,
      calculatedAt: now,
    });
    return (batch) => batch.set(db.collection('fantasyRoundScores').doc(documentId(score.id)), score);
  });
  await commitChunked(db, rescore);
  await rebuildFantasyLeaderboard(db, competition.id);

  /*
   * Managers are told, with the reason. A round that is quietly short is exactly the
   * experience the gate exists to prevent.
   */
  const affectedTeamIds = new Set(
    lineupSnapshots.docs.map((snapshot) => String(snapshot.data().fantasyTeamId ?? '')).filter(Boolean),
  );
  for (const fantasyTeamId of affectedTeamIds) {
    const fantasyTeam = await db.collection('fantasyTeams').doc(fantasyTeamId).get();
    const userId = fantasyTeam.data()?.userId as string | undefined;
    if (!userId) continue;
    await notify(db, {
      userId,
      event: 'fantasy_fixture_voided',
      entityId: voidRecord.id ?? `${competition.id}:${fantasyTeamId}`,
      title: 'A fixture was not scored',
      body: voidRecord.reason,
      href: `/fantasy/competitions/${competition.id}/points`,
      createdAt: now,
    });
  }
}
