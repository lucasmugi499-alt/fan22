import { Firestore, Transaction } from 'firebase-admin/firestore';
import { planFinalization } from '../lib/resultSubmission';
import { Athlete, Match, ResultSubmission } from '../types';

const SUBMISSIONS = 'resultSubmissions';
const MATCHES = 'matches';
const FINALIZATIONS = 'finalizations';

function officialPositionGroup(
  sport: 'football' | 'basketball' | 'rugby',
  position: string,
) {
  if (sport === 'football') {
    if (position === 'Goalkeeper') return 'goalkeeper';
    if (['Right Back', 'Centre Back', 'Left Back', 'Utility Defender'].includes(position)) return 'defender';
    if (['Striker', 'Forward'].includes(position)) return 'forward';
    return 'midfielder';
  }
  if (sport === 'basketball') {
    if (['Point Guard', 'Shooting Guard', 'Guard'].includes(position)) return 'guard';
    if (['Power Forward', 'Center'].includes(position)) return 'big';
    return 'wing';
  }
  if (['Loosehead Prop', 'Hooker', 'Tighthead Prop', 'Prop'].includes(position)) return 'front_row';
  if (position === 'Lock') return 'second_row';
  if (['Blindside Flanker', 'Openside Flanker', 'Number 8', 'Back Row', 'Utility Forward'].includes(position)) return 'back_row';
  if (['Scrum-half', 'Fly-half'].includes(position)) return 'half_back';
  return 'back';
}

export type FinalizeOutcome =
  | { action: 'finalized'; finalizationKey: string }
  | { action: 'skipped'; reason: string };

/**
 * Promote a settled claim onto the official match record in one idempotent transaction.
 * This module is server-only and is shared by App Hosting and Cloud Functions.
 */
export async function finalizeSubmission(
  db: Firestore,
  matchId: string
): Promise<FinalizeOutcome> {
  const submissionRef = db.collection(SUBMISSIONS).doc(matchId);

  return db.runTransaction(async (tx: Transaction) => {
    const submissionSnap = await tx.get(submissionRef);
    if (!submissionSnap.exists) return { action: 'skipped', reason: 'no_submission' };

    const submission = { id: submissionSnap.id, ...submissionSnap.data() } as ResultSubmission;
    const matchRef = db.collection(MATCHES).doc(submission.matchId);
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) return { action: 'skipped', reason: 'no_match' };

    const match = { id: matchSnap.id, ...matchSnap.data() } as Match;
    const decision = planFinalization({
      submission,
      match,
      processedKeys: [],
      now: new Date().toISOString(),
    });
    if (decision.action === 'noop') {
      return { action: 'skipped', reason: decision.reason };
    }

    const { plan } = decision;
    const ledgerRef = db.collection(FINALIZATIONS).doc(plan.finalizationKey);
    const ledgerSnap = await tx.get(ledgerRef);
    if (ledgerSnap.exists) {
      return { action: 'skipped', reason: 'already_finalized' };
    }

    const archivedRef = typeof plan.supersedesVersion === 'number'
      ? submissionRef.collection('versions').doc(String(plan.supersedesVersion))
      : null;
    const archivedSnapshot = archivedRef ? await tx.get(archivedRef) : null;

    const sport = String(match.sport).toLowerCase();
    const fantasySport = (
      sport === 'football' || sport === 'basketball' || sport === 'rugby'
    ) ? sport : undefined;
    const scorerTotals = new Map<string, { count: number; teamId: string }>();
    for (const scorer of submission.scorers) {
      const current = scorerTotals.get(scorer.athleteId);
      scorerTotals.set(scorer.athleteId, {
        count: (current?.count ?? 0) + scorer.count,
        teamId: scorer.teamId,
      });
    }
    const officialPerformances: {
      athlete: Athlete;
      count: number;
      teamId: string;
    }[] = [];
    if (fantasySport) {
      for (const [athleteId, scorer] of scorerTotals) {
        const athleteSnapshot = await tx.get(db.collection('athletes').doc(athleteId));
        if (!athleteSnapshot.exists) continue;
        officialPerformances.push({
          athlete: { id: athleteSnapshot.id, ...athleteSnapshot.data() } as Athlete,
          ...scorer,
        });
      }
    }

    if (archivedRef && archivedSnapshot && !archivedSnapshot.exists) {
      tx.create(archivedRef, {
        ...submissionSnap.data(),
        status: 'superseded',
        supersededBySubmissionId: submission.id,
        supersededAt: plan.submission.finalizedAt,
      });
    }

    tx.update(matchRef, {
      status: plan.match.status,
      verificationStatus: plan.match.verificationStatus,
      score: plan.match.score,
      teamAScore: plan.match.score.home,
      teamBScore: plan.match.score.away,
      officialResultVersion: plan.resultVersion,
      verifiedBy: 'system:finalizer',
      updatedAt: plan.submission.finalizedAt,
    });

    tx.update(submissionRef, {
      status: plan.submission.status,
      finalizationSource: plan.submission.finalizationSource,
      finalizationKey: plan.finalizationKey,
      finalizedAt: plan.submission.finalizedAt,
    });

    tx.create(submissionRef.collection('events').doc(), {
      submissionId: submission.id,
      from: submission.status,
      to: plan.submission.status,
      actor: 'system',
      actorUserId: 'system:finalizer',
      note: `Finalized via ${plan.submission.finalizationSource}`,
      createdAt: plan.submission.finalizedAt,
    });

    tx.create(ledgerRef, {
      matchId: submission.matchId,
      submissionId: submission.id,
      resultVersion: submission.resultVersion,
      finalizedAt: plan.submission.finalizedAt,
    });

    if (fantasySport) {
      const statKey = fantasySport === 'football'
        ? 'goal'
        : fantasySport === 'rugby'
          ? 'try'
          : 'points_scored';
      for (const { athlete, count, teamId } of officialPerformances) {
        const positionGroup = officialPositionGroup(fantasySport, athlete.position);
        const teamWon =
          (teamId === match.homeTeamId && plan.match.score.home > plan.match.score.away)
          || (teamId === match.awayTeamId && plan.match.score.away > plan.match.score.home);
        const performanceId = `${match.id}_v${plan.resultVersion}_${athlete.id}`;
        tx.set(db.collection('officialAthleteMatchStats').doc(performanceId), {
          id: performanceId,
          matchId: match.id,
          athleteId: athlete.id,
          realTeamId: teamId,
          sport: fantasySport,
          position: athlete.position,
          positionGroup,
          officialResultVersion: plan.resultVersion,
          verificationStatus: 'verified',
          dataLevel: 'basic',
          dataCoverage: 'scorer_only',
          activeSquad: true,
          didPlay: true,
          minutesPlayed: 0,
          teamWon,
          playerOfMatch: match.topPerformerId === athlete.id,
          stats: {
            active_squad: 1,
            appearance: 1,
            [statKey]: count,
            win_participation: teamWon ? 1 : 0,
          },
          sourceEventIds: {
            active_squad: `${submission.id}:v${plan.resultVersion}:${athlete.id}:active`,
            appearance: `${submission.id}:v${plan.resultVersion}:${athlete.id}:appearance`,
            [statKey]: `${submission.id}:v${plan.resultVersion}:${athlete.id}:${statKey}`,
            win_participation: `${submission.id}:v${plan.resultVersion}:${athlete.id}:win`,
          },
          finalizedAt: plan.submission.finalizedAt,
        });
      }
    }

    return { action: 'finalized', finalizationKey: plan.finalizationKey };
  });
}
