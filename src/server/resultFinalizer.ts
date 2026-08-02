import { Firestore, Transaction } from 'firebase-admin/firestore';
import { planFinalization } from '../lib/resultSubmission';
import { Athlete, AthleteStatLine, Match, ResultSubmission } from '../types';

const SUBMISSIONS = 'resultSubmissions';
const MATCHES = 'matches';
const FINALIZATIONS = 'finalizations';
const OFFICIAL_SPORT_EVENTS = 'officialSportEvents';

type OfficialSportEventRecord = {
  id: string;
  eventType: string;
  eventSchemaVersion: string;
  sportDefinitionVersion: string;
  sportId: 'football' | 'basketball' | 'rugby';
  competitionId: string;
  seasonId: string;
  matchId: string;
  sequence: number;
  gameClock?: {
    minute?: number;
    remaining?: boolean;
  };
  teamId: string;
  primaryAthleteId: string;
  payload: Record<string, unknown>;
  sourceClaimId: string;
  submittedByUserId: string;
  submittedByTeamId: string;
  evidenceRefs: string[];
  officialResultVersion: number;
  officialEventVersion: number;
  verificationStatus: 'official';
  idempotencyKey: string;
  createdAt: string;
  finalizedAt: string;
};

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

function scorerEventType(sport: 'football' | 'basketball' | 'rugby') {
  if (sport === 'football') return 'football.goal';
  if (sport === 'rugby') return 'rugby.try';
  return 'basketball.points';
}

function activeSquadEventType(sport: 'football' | 'basketball' | 'rugby') {
  return `${sport}.active_squad`;
}

const SPORT_STAT_EVENT_TYPES: Record<'football' | 'basketball' | 'rugby', Record<string, string>> = {
  football: {
    minutes_played: 'football.minutes_played',
    assist: 'football.assist',
    yellow_card: 'football.yellow_card',
    red_card: 'football.red_card',
    own_goal: 'football.own_goal',
  },
  basketball: {
    minutes_played: 'basketball.minutes_played',
    rebound: 'basketball.rebound',
    assist: 'basketball.assist',
    steal: 'basketball.steal',
    block: 'basketball.block',
    turnover: 'basketball.turnover',
    technical_foul: 'basketball.technical_fouls',
    ejection: 'basketball.ejection',
  },
  rugby: {
    minutes_played: 'rugby.minutes_played',
    conversion: 'rugby.conversion_made',
    penalty_goal: 'rugby.penalty_goal_made',
    drop_goal: 'rugby.drop_goal_made',
    assist: 'rugby.assist',
    yellow_card: 'rugby.yellow_card',
    red_card: 'rugby.red_card',
  },
};

const STANDARD_STAT_KEYS = new Set([
  'minutes_played',
  'assist',
  'rebound',
  'conversion',
  'penalty_goal',
  'drop_goal',
  'yellow_card',
  'red_card',
  'own_goal',
  'technical_foul',
  'ejection',
]);

const ADVANCED_STAT_KEYS = new Set(['steal', 'block', 'turnover']);

function sanitizedActiveSquads(submission: ResultSubmission, match: Match) {
  const validTeams = new Set([match.homeTeamId, match.awayTeamId]);
  const result = new Map<string, { athleteId: string; teamId: string }>();
  for (const [teamId, athleteIds] of Object.entries(submission.activeSquads ?? {})) {
    if (!validTeams.has(teamId) || !Array.isArray(athleteIds)) continue;
    for (const athleteId of athleteIds) {
      if (typeof athleteId !== 'string' || !athleteId.trim()) continue;
      result.set(athleteId, { athleteId, teamId });
    }
  }
  return result;
}

function sanitizedStatLines(
  submission: ResultSubmission,
  match: Match,
  sport: 'football' | 'basketball' | 'rugby',
) {
  const validTeams = new Set([match.homeTeamId, match.awayTeamId]);
  const supportedStats = SPORT_STAT_EVENT_TYPES[sport];
  const result = new Map<string, AthleteStatLine>();

  for (const line of submission.athleteStatLines ?? []) {
    if (
      !line
      || typeof line.athleteId !== 'string'
      || !line.athleteId.trim()
      || typeof line.teamId !== 'string'
      || !validTeams.has(line.teamId)
    ) {
      continue;
    }

    const stats: Record<string, number> = {};
    if (typeof line.minutesPlayed === 'number' && Number.isFinite(line.minutesPlayed)) {
      const minutes = Math.max(0, Math.trunc(line.minutesPlayed));
      if (minutes > 0) stats.minutes_played = minutes;
    }
    for (const [statKey, value] of Object.entries(line.stats ?? {})) {
      if (!supportedStats[statKey] || typeof value !== 'number' || !Number.isFinite(value)) continue;
      const normalized = Math.max(0, Math.trunc(value));
      if (normalized > 0) stats[statKey] = normalized;
    }
    if (!Object.keys(stats).length && !line.playerOfMatch) continue;

    const existing = result.get(line.athleteId);
    result.set(line.athleteId, {
      athleteId: line.athleteId,
      teamId: existing?.teamId ?? line.teamId,
      minutesPlayed: Math.max(existing?.minutesPlayed ?? 0, stats.minutes_played ?? 0),
      stats: {
        ...(existing?.stats ?? {}),
        ...Object.fromEntries(
          Object.entries(stats).map(([key, value]) => [
            key,
            value + (existing?.stats[key] ?? 0),
          ]),
        ),
      },
      playerOfMatch: Boolean(existing?.playerOfMatch || line.playerOfMatch),
    });
  }

  return result;
}

function officialStatLineEvents({
  match,
  submission,
  sport,
  statLines,
  finalizedAt,
  resultVersion,
  startSequence = 1,
}: {
  match: Match;
  submission: ResultSubmission;
  sport: 'football' | 'basketball' | 'rugby';
  statLines: Map<string, AthleteStatLine>;
  finalizedAt: string;
  resultVersion: number;
  startSequence?: number;
}) {
  const events: OfficialSportEventRecord[] = [];
  let sequence = startSequence;
  const eventTypes = SPORT_STAT_EVENT_TYPES[sport];

  for (const line of statLines.values()) {
    const statEntries = Object.entries(line.stats)
      .filter(([statKey, value]) => eventTypes[statKey] && value > 0);
    for (const [statKey, value] of statEntries) {
      const eventCount = statKey === 'minutes_played' ? 1 : value;
      for (let index = 0; index < eventCount; index += 1) {
        const eventId = `${match.id}_v${resultVersion}_event_${String(sequence).padStart(4, '0')}`;
        events.push({
          id: eventId,
          eventType: eventTypes[statKey],
          eventSchemaVersion: '1.0.0',
          sportDefinitionVersion: '1.0.0',
          sportId: sport,
          competitionId: match.leagueId,
          seasonId: match.seasonId,
          matchId: match.id,
          sequence,
          teamId: line.teamId,
          primaryAthleteId: line.athleteId,
          payload: {
            value: statKey === 'minutes_played' ? value : 1,
            statKey,
            source: 'result_submission_stat_line',
          },
          sourceClaimId: submission.id,
          submittedByUserId: submission.submittedByUserId,
          submittedByTeamId: submission.submittedByTeamId,
          evidenceRefs: submission.evidenceRefs,
          officialResultVersion: resultVersion,
          officialEventVersion: 1,
          verificationStatus: 'official',
          idempotencyKey: `${submission.id}:v${resultVersion}:stat:${line.teamId}:${line.athleteId}:${statKey}:${index + 1}`,
          createdAt: finalizedAt,
          finalizedAt,
        });
        sequence += 1;
      }
    }
    if (line.playerOfMatch) {
      const eventId = `${match.id}_v${resultVersion}_event_${String(sequence).padStart(4, '0')}`;
      events.push({
        id: eventId,
        eventType: `${sport}.player_of_match`,
        eventSchemaVersion: '1.0.0',
        sportDefinitionVersion: '1.0.0',
        sportId: sport,
        competitionId: match.leagueId,
        seasonId: match.seasonId,
        matchId: match.id,
        sequence,
        teamId: line.teamId,
        primaryAthleteId: line.athleteId,
        payload: {
          value: 1,
          statKey: 'player_of_match',
          source: 'result_submission_stat_line',
        },
        sourceClaimId: submission.id,
        submittedByUserId: submission.submittedByUserId,
        submittedByTeamId: submission.submittedByTeamId,
        evidenceRefs: submission.evidenceRefs,
        officialResultVersion: resultVersion,
        officialEventVersion: 1,
        verificationStatus: 'official',
        idempotencyKey: `${submission.id}:v${resultVersion}:stat:${line.teamId}:${line.athleteId}:player_of_match`,
        createdAt: finalizedAt,
        finalizedAt,
      });
      sequence += 1;
    }
  }

  return events;
}

function statLineDataLevel(statLine?: AthleteStatLine) {
  if (!statLine) return 'basic';
  const keys = Object.keys(statLine.stats);
  if (keys.some((key) => ADVANCED_STAT_KEYS.has(key))) return 'advanced';
  if (keys.some((key) => STANDARD_STAT_KEYS.has(key)) || statLine.playerOfMatch) return 'standard';
  return 'basic';
}

function officialActiveSquadEvents({
  match,
  submission,
  sport,
  finalizedAt,
  resultVersion,
}: {
  match: Match;
  submission: ResultSubmission;
  sport: 'football' | 'basketball' | 'rugby';
  finalizedAt: string;
  resultVersion: number;
}) {
  const events: OfficialSportEventRecord[] = [];
  let sequence = 1;
  const eventType = activeSquadEventType(sport);

  for (const entry of sanitizedActiveSquads(submission, match).values()) {
    const eventId = `${match.id}_v${resultVersion}_event_${String(sequence).padStart(4, '0')}`;
    events.push({
      id: eventId,
      eventType,
      eventSchemaVersion: '1.0.0',
      sportDefinitionVersion: '1.0.0',
      sportId: sport,
      competitionId: match.leagueId,
      seasonId: match.seasonId,
      matchId: match.id,
      sequence,
      teamId: entry.teamId,
      primaryAthleteId: entry.athleteId,
      payload: {
        value: 1,
        source: 'result_submission_active_squad',
      },
      sourceClaimId: submission.id,
      submittedByUserId: submission.submittedByUserId,
      submittedByTeamId: submission.submittedByTeamId,
      evidenceRefs: submission.evidenceRefs,
      officialResultVersion: resultVersion,
      officialEventVersion: 1,
      verificationStatus: 'official',
      idempotencyKey: `${submission.id}:v${resultVersion}:active_squad:${entry.teamId}:${entry.athleteId}`,
      createdAt: finalizedAt,
      finalizedAt,
    });
    sequence += 1;
  }

  return events;
}

function officialScorerEvents({
  match,
  submission,
  sport,
  finalizedAt,
  resultVersion,
  startSequence = 1,
}: {
  match: Match;
  submission: ResultSubmission;
  sport: 'football' | 'basketball' | 'rugby';
  finalizedAt: string;
  resultVersion: number;
  startSequence?: number;
}) {
  const events: OfficialSportEventRecord[] = [];
  let sequence = startSequence;
  const eventType = scorerEventType(sport);

  for (const scorer of submission.scorers) {
    const eventCount = sport === 'basketball' ? 1 : Math.max(0, Math.trunc(scorer.count));
    for (let index = 0; index < eventCount; index += 1) {
      const eventId = `${match.id}_v${resultVersion}_event_${String(sequence).padStart(4, '0')}`;
      events.push({
        id: eventId,
        eventType,
        eventSchemaVersion: '1.0.0',
        sportDefinitionVersion: '1.0.0',
        sportId: sport,
        competitionId: match.leagueId,
        seasonId: match.seasonId,
        matchId: match.id,
        sequence,
        ...(typeof scorer.minute === 'number' ? {
          gameClock: {
            minute: scorer.minute,
            remaining: false,
          },
        } : {}),
        teamId: scorer.teamId,
        primaryAthleteId: scorer.athleteId,
        payload: {
          value: sport === 'basketball' ? scorer.count : 1,
          source: 'result_submission_scorer',
        },
        sourceClaimId: submission.id,
        submittedByUserId: submission.submittedByUserId,
        submittedByTeamId: submission.submittedByTeamId,
        evidenceRefs: submission.evidenceRefs,
        officialResultVersion: resultVersion,
        officialEventVersion: 1,
        verificationStatus: 'official',
        idempotencyKey: `${submission.id}:v${resultVersion}:event:${sequence}`,
        createdAt: finalizedAt,
        finalizedAt,
      });
      sequence += 1;
    }
  }

  return events;
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
    const finalizedAt = plan.submission.finalizedAt;
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
    const activeSquads = sanitizedActiveSquads(submission, match);
    const statLines = fantasySport
      ? sanitizedStatLines(submission, match, fantasySport)
      : new Map<string, AthleteStatLine>();
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
      activeSquadEventId?: string;
      scoringSourceEventId?: string;
      statLine?: AthleteStatLine;
    }[] = [];
    const activeSquadEvents = fantasySport
      ? officialActiveSquadEvents({
        match,
        submission,
        sport: fantasySport,
        finalizedAt,
        resultVersion: plan.resultVersion,
      })
      : [];
    const scorerEvents = fantasySport
      ? officialScorerEvents({
        match,
        submission,
        sport: fantasySport,
        finalizedAt,
        resultVersion: plan.resultVersion,
        startSequence: activeSquadEvents.length + 1,
      })
      : [];
    const statLineEvents = fantasySport
      ? officialStatLineEvents({
        match,
        submission,
        sport: fantasySport,
        statLines,
        finalizedAt,
        resultVersion: plan.resultVersion,
        startSequence: activeSquadEvents.length + scorerEvents.length + 1,
      })
      : [];
    const activeSquadEventByAthlete = new Map(
      activeSquadEvents.map((event) => [event.primaryAthleteId, event.id]),
    );
    const scoringSourceEventByAthlete = new Map<string, string>();
    for (const event of scorerEvents) {
      if (!scoringSourceEventByAthlete.has(event.primaryAthleteId)) {
        scoringSourceEventByAthlete.set(event.primaryAthleteId, event.id);
      }
    }
    const statSourceEventsByAthlete = new Map<string, Record<string, string>>();
    for (const event of statLineEvents) {
      const statKey = String(event.payload.statKey ?? '');
      if (!statKey) continue;
      const current = statSourceEventsByAthlete.get(event.primaryAthleteId) ?? {};
      if (!current[statKey]) current[statKey] = event.id;
      statSourceEventsByAthlete.set(event.primaryAthleteId, current);
    }
    if (fantasySport) {
      const athleteIds = new Set([
        ...activeSquads.keys(),
        ...scorerTotals.keys(),
        ...statLines.keys(),
      ]);
      for (const athleteId of athleteIds) {
        const athleteSnapshot = await tx.get(db.collection('athletes').doc(athleteId));
        if (!athleteSnapshot.exists) continue;
        const scorer = scorerTotals.get(athleteId);
        const active = activeSquads.get(athleteId);
        const statLine = statLines.get(athleteId);
        officialPerformances.push({
          athlete: { id: athleteSnapshot.id, ...athleteSnapshot.data() } as Athlete,
          count: scorer?.count ?? 0,
          teamId: active?.teamId ?? scorer?.teamId ?? statLine?.teamId ?? match.homeTeamId,
          activeSquadEventId: activeSquadEventByAthlete.get(athleteId),
          scoringSourceEventId: scoringSourceEventByAthlete.get(athleteId),
          statLine,
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
      finalizedAt,
    });

    if (fantasySport) {
      for (const event of [...activeSquadEvents, ...scorerEvents, ...statLineEvents]) {
        tx.create(db.collection(OFFICIAL_SPORT_EVENTS).doc(event.id), event);
      }

      const statKey = fantasySport === 'football'
        ? 'goal'
        : fantasySport === 'rugby'
          ? 'try'
          : 'points_scored';
      for (const { athlete, count, teamId, activeSquadEventId, scoringSourceEventId, statLine } of officialPerformances) {
        const positionGroup = officialPositionGroup(fantasySport, athlete.position);
        const teamWon =
          (teamId === match.homeTeamId && plan.match.score.home > plan.match.score.away)
          || (teamId === match.awayTeamId && plan.match.score.away > plan.match.score.home);
        const performanceId = `${match.id}_v${plan.resultVersion}_${athlete.id}`;
        const participationSourceEventId = activeSquadEventId ?? scoringSourceEventId ?? `${submission.id}:v${plan.resultVersion}:${athlete.id}:participation`;
        const statSources = statSourceEventsByAthlete.get(athlete.id) ?? {};
        const lineStats = statLine?.stats ?? {};
        const minutesPlayed = statLine?.minutesPlayed ?? lineStats.minutes_played ?? 0;
        const playerOfMatch = Boolean(statLine?.playerOfMatch || match.topPerformerId === athlete.id);
        const richStats = {
          ...lineStats,
          ...(minutesPlayed > 0 ? { minutes_played: minutesPlayed } : {}),
          player_of_match: playerOfMatch ? 1 : 0,
        };
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
          dataLevel: statLineDataLevel(statLine),
          dataCoverage: statLine ? 'verified_stat_line' : activeSquadEventId ? 'match_squad_basic' : 'scorer_only',
          activeSquad: Boolean(activeSquadEventId) || count > 0 || Boolean(statLine),
          didPlay: true,
          minutesPlayed,
          teamWon,
          playerOfMatch,
          stats: {
            active_squad: activeSquadEventId || count > 0 || statLine ? 1 : 0,
            appearance: 1,
            [statKey]: count,
            win_participation: teamWon ? 1 : 0,
            ...richStats,
          },
          sourceEventIds: {
            active_squad: participationSourceEventId,
            appearance: participationSourceEventId,
            [statKey]: scoringSourceEventId ?? `${submission.id}:v${plan.resultVersion}:${athlete.id}:${statKey}`,
            win_participation: participationSourceEventId,
            ...statSources,
          },
          finalizedAt: plan.submission.finalizedAt,
        });
      }
    }

    return { action: 'finalized', finalizationKey: plan.finalizationKey };
  });
}
