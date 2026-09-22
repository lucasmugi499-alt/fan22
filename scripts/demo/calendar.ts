import { accessIndexId, type AccessAssignment, type AccessIndexDocument } from '../../src/lib/auth/access';
import { projectScopeIndex } from '../../src/lib/auth/accessProjection';

/**
 * Re-basing the demo dataset onto today's calendar.
 *
 * ## Why this exists
 *
 * `data/investor-demo/database.json` is a fixed world: six leagues, each with forty-four
 * results, one live matchday and forty-five fixtures to come, dated February to July 2026. It
 * was generated in July and its match calendar had already stopped in May, so from the day it
 * was seeded every "Coming up" list on the platform was empty, six matches read "Playing now"
 * from April, and a fan could not save a fantasy squad because every round's deadline had
 * passed. The platform patched around it — `isStillToPlay`, the live belief window — but a
 * demo whose calendar is months stale is not something a screen can hide.
 *
 * The dataset is not edited. It stays checksum-locked and canonical. What changes is when it
 * is seeded: every timestamp is shifted so the world lands mid-season TODAY, and the shift is
 * recomputed on every seed, so it cannot rot again without being re-run.
 *
 * ## Two clocks, not one
 *
 * The match calendar and the social calendar in the source disagree about "now" by about
 * eleven weeks (results stop on 3 May; feed posts run to 24 July). One uniform shift would put
 * either the fixtures in the past or the feed in the future. So there are two anchors:
 *
 * - Each LEAGUE moves by its own whole number of weeks, so its live matchday becomes the most
 *   recent occurrence of that weekday. Whole weeks keep Saturday fixtures on Saturdays. Its
 *   results, fixtures, season window, result submissions and finalizations move with it.
 * - Everything SOCIAL (users, feed, pledges, challenges, notifications, reports) moves by the
 *   distance from the package's `generatedAt` to now, rounded to whole days.
 *
 * Live matches are then pinned to a few minutes ago, so they are genuinely live on the day the
 * seed runs and degrade to "awaiting result" through the ordinary belief window afterwards.
 *
 * ## What it refuses
 *
 * A dataset whose structure it does not recognise: a league with no live matchday, or a
 * fixture on a weekday. The shift depends on those properties and a silent guess about a
 * world it does not understand is how a demo ends up with results dated next month.
 */

type JsonRecord = { id?: string; [key: string]: unknown };
export type DemoDatabase = Record<string, unknown> & { metadata: { generatedAt: string } };

export type LeagueShift = { leagueId: string; anchor: string; target: string; weeks: number; deltaMs: number };
export type CalendarPlan = {
  now: string;
  social: { anchor: string; target: string; days: number; deltaMs: number };
  leagues: LeagueShift[];
};

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** How long before "now" a pinned live match kicked off. Inside the belief window, past the whistle. */
export const LIVE_PIN_MS = 25 * 60_000;

/** Collections whose timestamps belong to a league's match calendar, keyed by how they name it. */
const LEAGUE_CLOCK: Record<string, 'leagueId' | 'matchId' | 'submissionId'> = {
  matches: 'leagueId',
  seasons: 'leagueId',
  leagueNotices: 'leagueId',
  resultSubmissions: 'matchId',
  resultSubmissionEvents: 'submissionId',
  finalizations: 'matchId',
};

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

function shiftIso(value: string, deltaMs: number): string {
  return new Date(Date.parse(value) + deltaMs).toISOString();
}

/** Every ISO timestamp anywhere in the value, shifted. Ids and everything else untouched. */
function shiftDeep<T>(value: T, deltaMs: number): T {
  if (typeof value === 'string') return (ISO.test(value) ? shiftIso(value, deltaMs) : value) as T;
  if (Array.isArray(value)) return value.map((item) => shiftDeep(item, deltaMs)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, shiftDeep(nested, deltaMs)]),
    ) as T;
  }
  return value;
}

function rows(database: DemoDatabase, collection: string): JsonRecord[] {
  const value = database[collection];
  return Array.isArray(value) ? (value as JsonRecord[]) : [];
}

/**
 * The most recent instant at or before `now` that shares `anchor`'s weekday and time of day.
 * Whole weeks back from the anchor, so the shift preserves the fixture rhythm exactly.
 */
function latestSameWeekdayAtOrBefore(anchorMs: number, nowMs: number): number {
  const weeks = Math.floor((nowMs - anchorMs) / WEEK_MS);
  return anchorMs + weeks * WEEK_MS;
}

export function planCalendar(database: DemoDatabase, now: Date): CalendarPlan {
  const nowMs = now.getTime();
  const matches = rows(database, 'matches');
  const byLeague = new Map<string, JsonRecord[]>();
  for (const match of matches) {
    const leagueId = String(match.leagueId ?? '');
    byLeague.set(leagueId, [...(byLeague.get(leagueId) ?? []), match]);
  }

  const leagues: LeagueShift[] = [];
  for (const [leagueId, leagueMatches] of byLeague) {
    for (const match of leagueMatches) {
      const day = new Date(String(match.scheduledAt)).getUTCDay();
      if (day !== 0 && day !== 6) {
        throw new Error(`Calendar refused: ${match.id} in ${leagueId} is on a weekday; the whole-week shift assumes weekend fixtures.`);
      }
    }
    const live = leagueMatches.filter((match) => match.status === 'live').map((match) => Date.parse(String(match.scheduledAt)));
    if (live.length === 0) {
      throw new Error(`Calendar refused: ${leagueId} has no live matchday to anchor on.`);
    }
    const anchorMs = Math.max(...live);
    const targetMs = latestSameWeekdayAtOrBefore(anchorMs, nowMs);
    leagues.push({
      leagueId,
      anchor: new Date(anchorMs).toISOString(),
      target: new Date(targetMs).toISOString(),
      weeks: Math.round((targetMs - anchorMs) / WEEK_MS),
      deltaMs: targetMs - anchorMs,
    });
  }
  leagues.sort((left, right) => left.leagueId.localeCompare(right.leagueId));

  const socialAnchorMs = Date.parse(database.metadata.generatedAt);
  if (!Number.isFinite(socialAnchorMs)) throw new Error('Calendar refused: metadata.generatedAt is not a date.');
  const days = Math.floor((nowMs - socialAnchorMs) / DAY_MS);
  const socialDeltaMs = days * DAY_MS;

  return {
    now: now.toISOString(),
    social: {
      anchor: new Date(socialAnchorMs).toISOString(),
      target: new Date(socialAnchorMs + socialDeltaMs).toISOString(),
      days,
      deltaMs: socialDeltaMs,
    },
    leagues,
  };
}

/**
 * The dataset with every timestamp moved onto the plan. Returns a new object; the canonical
 * package is never written to.
 */
export function rebaseCalendar(database: DemoDatabase, plan: CalendarPlan): DemoDatabase {
  const nowMs = Date.parse(plan.now);
  const leagueDelta = new Map(plan.leagues.map((shift) => [shift.leagueId, shift.deltaMs]));
  const matchLeague = new Map(rows(database, 'matches').map((match) => [String(match.id), String(match.leagueId)]));
  // A submission's document id is its match id (first-write-wins), and events name the submission.
  const submissionLeague = new Map(rows(database, 'resultSubmissions').map((row) => [String(row.id), matchLeague.get(String(row.matchId)) ?? '']));

  const deltaFor = (collection: string, record: JsonRecord): number => {
    const clock = LEAGUE_CLOCK[collection];
    if (!clock) return plan.social.deltaMs;
    const leagueId = clock === 'leagueId'
      ? String(record.leagueId ?? '')
      : clock === 'matchId'
        ? matchLeague.get(String(record.matchId ?? record.id ?? '')) ?? ''
        : submissionLeague.get(String(record.submissionId ?? '')) ?? '';
    const delta = leagueDelta.get(leagueId);
    if (delta === undefined) {
      throw new Error(`Calendar refused: ${collection}/${String(record.id)} belongs to no planned league (${leagueId || 'none'}).`);
    }
    return delta;
  };

  const out: Record<string, unknown> = {};
  for (const [collection, value] of Object.entries(database)) {
    if (collection === 'metadata') {
      out.metadata = {
        ...(value as Record<string, unknown>),
        generatedAt: plan.social.target,
        calendar: { rebasedAt: plan.now, socialDays: plan.social.days, leagueWeeks: Object.fromEntries(plan.leagues.map((s) => [s.leagueId, s.weeks])) },
      };
      continue;
    }
    if (!Array.isArray(value)) {
      out[collection] = value;
      continue;
    }
    out[collection] = (value as JsonRecord[]).map((record) => {
      const shifted = shiftDeep(record, deltaFor(collection, record));
      if (collection === 'matches' && shifted.status === 'live') {
        const pinned = new Date(nowMs - LIVE_PIN_MS).toISOString();
        return { ...shifted, scheduledAt: pinned, date: pinned };
      }
      return shifted;
    });
  }
  return out as DemoDatabase;
}

/**
 * What the re-based world must look like, checked after the shift rather than assumed.
 * Returns the problems; an empty list is a pass.
 */
export function auditCalendar(database: DemoDatabase, now: Date): string[] {
  const nowMs = now.getTime();
  const problems: string[] = [];
  const perLeague = new Map<string, { completed: number; live: number; upcoming: number; missed: number }>();
  for (const match of rows(database, 'matches')) {
    const leagueId = String(match.leagueId);
    const bucket = perLeague.get(leagueId) ?? { completed: 0, live: 0, upcoming: 0, missed: 0 };
    const kickoff = Date.parse(String(match.scheduledAt));
    if (match.status === 'completed') {
      bucket.completed += 1;
      if (kickoff > nowMs) problems.push(`${match.id} is completed but kicks off in the future.`);
    } else if (match.status === 'live') {
      bucket.live += 1;
      if (kickoff > nowMs || nowMs - kickoff > 6 * 60 * 60_000) problems.push(`${match.id} is live but not within the belief window.`);
    } else if (match.status === 'scheduled') {
      if (kickoff >= nowMs) bucket.upcoming += 1;
      else bucket.missed += 1;
    }
    perLeague.set(leagueId, bucket);
  }
  for (const [leagueId, bucket] of perLeague) {
    if (bucket.upcoming === 0) problems.push(`${leagueId} has no upcoming fixture after the shift.`);
    if (bucket.missed > 0) problems.push(`${leagueId} has ${bucket.missed} scheduled fixture(s) already in the past.`);
  }
  for (const season of rows(database, 'seasons')) {
    const start = Date.parse(String(season.startDate));
    const end = Date.parse(String(season.endDate));
    if (!(start <= nowMs && nowMs <= end)) problems.push(`${season.id} does not contain today after the shift.`);
  }
  for (const collection of ['feedPosts', 'supportPledges', 'challenges', 'notifications', 'comments']) {
    for (const record of rows(database, collection)) {
      const created = Date.parse(String(record.createdAt ?? ''));
      if (Number.isFinite(created) && created > nowMs) problems.push(`${collection}/${String(record.id)} is dated in the future.`);
    }
  }
  return problems;
}

/**
 * The authority the demo world starts with, projected with the real projector.
 *
 * `access:backfill` deliberately never mints a team assignment: ADR-004 retired the V1 team
 * bundle and a real league's legacy `adminUserIds` entry is residue, not a grant. The demo is
 * not a real league. Its `teamAssignments` are the story — this person runs this club — and
 * ADR-005 says what that story means today: a Club Operator. Leagues and platform accounts
 * get their assignments the same way, so a freshly reset demo needs no second tool run before
 * anyone can act. Projected through `projectScopeIndex` with the team stage at `retired`, so
 * the index documents are exactly what production code would write.
 */
export function demoAccessDocuments(database: DemoDatabase, now: Date): {
  accessAssignments: AccessAssignment[];
  accessIndex: Array<AccessIndexDocument & { id: string }>;
} {
  const nowIso = now.toISOString();
  const assignments: AccessAssignment[] = [];
  const base = { status: 'active' as const, grantedByUserId: 'seed', validFrom: nowIso, createdAt: nowIso, updatedAt: nowIso };

  for (const league of rows(database, 'leagues')) {
    for (const userId of (Array.isArray(league.adminUserIds) ? league.adminUserIds : []) as string[]) {
      assignments.push({ ...base, id: `assignment_seed_league_${league.id}_${userId}`, userId, roleKey: 'league_admin', scopeType: 'league', scopeId: String(league.id), permissionBundleId: 'league_admin' });
    }
  }
  for (const record of rows(database, 'teamAssignments')) {
    if (record.status !== 'active') continue;
    const userId = String(record.userId);
    const teamId = String(record.teamId);
    assignments.push({ ...base, id: `assignment_seed_club_${teamId}_${userId}`, userId, roleKey: 'club_operator', scopeType: 'team', scopeId: teamId, permissionBundleId: 'club_operations' });
  }
  for (const user of rows(database, 'users')) {
    const role = String(user.role ?? '');
    const userId = String(user.id ?? user.uid);
    if (role === 'platform_admin') {
      assignments.push({ ...base, id: `assignment_seed_platform_${userId}`, userId, roleKey: 'platform_admin', scopeType: 'platform', scopeId: 'platform', permissionBundleId: 'platform_admin' });
    } else if (role === 'super_admin') {
      assignments.push({ ...base, id: `assignment_seed_platform_${userId}`, userId, roleKey: 'super_admin', scopeType: 'platform', scopeId: 'platform', permissionBundleId: 'super_admin_governance' });
    }
  }

  const accessIndex: Array<AccessIndexDocument & { id: string }> = [];
  const seen = new Set<string>();
  for (const assignment of assignments) {
    const id = accessIndexId(assignment.scopeType, assignment.scopeId, assignment.userId);
    if (seen.has(id)) continue;
    seen.add(id);
    const projected = projectScopeIndex({
      scope: { userId: assignment.userId, scopeType: assignment.scopeType, scopeId: assignment.scopeId },
      assignments,
      updatedAt: nowIso,
      now,
      stage: 'retired',
    });
    if (projected) accessIndex.push({ id, ...projected });
  }
  return { accessAssignments: assignments, accessIndex };
}

/**
 * The fantasy package re-derived from the re-based matches.
 *
 * `src/data/fantasyDemo.ts` is the app's mock-mode world and is left alone. Its rounds are
 * dated August and point at February fixtures, and everything else in it — locked lineups,
 * official round scores, example point events — hangs off "round 1" as the settled round. So
 * the four rounds are re-drawn around the live matchday: round 1 is the last completed
 * matchday (official, with the scores), round 2 the live one (scoring), round 3 the next
 * (open, the one a fan can actually enter), round 4 after that. Every record that named a
 * round-1 match is pointed at the new round 1.
 */
export function rebaseFantasy<T extends Record<string, unknown[]>>(
  fantasy: T,
  canonical: DemoDatabase,
  world: DemoDatabase,
  now: Date,
): T {
  const nowMs = now.getTime();
  const worldMatches = rows(world, 'matches');
  const worldById = new Map(worldMatches.map((match) => [String(match.id), match]));
  // Matchdays are weekends in the canonical calendar. Bucket by the Saturday each match sits
  // on (the epoch was a Thursday, so Saturday is two days in), before any live-match pinning.
  const weekendOf = (iso: string) => Math.floor((Date.parse(iso) - 2 * DAY_MS) / WEEK_MS);
  const matchdaysByLeague = new Map<string, Map<number, string[]>>();
  for (const match of rows(canonical, 'matches')) {
    const leagueId = String(match.leagueId);
    const days = matchdaysByLeague.get(leagueId) ?? new Map<number, string[]>();
    const key = weekendOf(String(match.scheduledAt));
    days.set(key, [...(days.get(key) ?? []), String(match.id)]);
    matchdaysByLeague.set(leagueId, days);
  }

  const STATUSES = ['official', 'scoring', 'open', 'upcoming'] as const;
  const roundMatchIds = new Map<string, string[]>();
  const rounds = (fantasy.fantasyRounds as Array<JsonRecord & { competitionId: string; number: number }>).map((round) => {
    const competition = (fantasy.fantasyCompetitions as Array<JsonRecord & { id: string; leagueId: string }>)
      .find((item) => item.id === round.competitionId)!;
    const days: string[][] = [...(matchdaysByLeague.get(competition.leagueId) ?? new Map<number, string[]>()).entries()]
      .sort(([left], [right]) => left - right)
      .map(([, ids]) => ids);
    const liveIndex = days.findIndex((ids) => ids.some((id) => worldById.get(id)?.status === 'live'));
    if (liveIndex < 1 || liveIndex + 2 >= days.length) {
      throw new Error(`Calendar refused: ${competition.leagueId} cannot host four rounds around its live matchday.`);
    }
    const ids = days[liveIndex - 1 + (round.number - 1)];
    const kickoffs = ids.map((id) => Date.parse(String(worldById.get(id)!.scheduledAt)));
    const startsAt = new Date(Math.min(...kickoffs)).toISOString();
    roundMatchIds.set(String(round.id), ids);
    return {
      ...round,
      matchIds: ids,
      startsAt,
      deadlineAt: startsAt,
      endsAt: new Date(Math.max(...kickoffs) + 4 * 60 * 60_000).toISOString(),
      status: STATUSES[round.number - 1],
    };
  });

  const roundOne = (competitionId: string) => roundMatchIds.get(`${competitionId}_round_1`) ?? [];
  const nextFixture = (teamId: string) => worldMatches
    .filter((match) => match.status === 'scheduled' && (match.homeTeamId === teamId || match.awayTeamId === teamId)
      && Date.parse(String(match.scheduledAt)) >= nowMs)
    .sort((left, right) => Date.parse(String(left.scheduledAt)) - Date.parse(String(right.scheduledAt)))[0];

  // The package's own clock: created ten days ago, so lineups, scores and events read as recent.
  const packageAnchor = (fantasy.fantasyCompetitions as Array<{ createdAt: string }>)[0]?.createdAt ?? now.toISOString();
  const packageDelta = (nowMs - 10 * DAY_MS) - Date.parse(packageAnchor);

  const out: Record<string, unknown[]> = {};
  for (const [collection, records] of Object.entries(fantasy)) {
    if (collection === 'fantasyRounds') { out[collection] = rounds; continue; }
    out[collection] = (records as JsonRecord[]).map((record) => {
      const shifted = shiftDeep(record, packageDelta);
      if (collection === 'fantasyPlayers') {
        return { ...shifted, nextFixtureMatchId: nextFixture(String(shifted.realTeamId))?.id ?? null };
      }
      if (collection === 'fantasyPointEvents' || collection === 'fantasyCorrections') {
        // Re-point at the new round 1's matches, keeping each record's position in the round.
        const oldRound = (fantasy.fantasyRounds as Array<JsonRecord & { id: string; matchIds: string[] }>)
          .find((item) => item.id === shifted.roundId);
        const position = Math.max(0, oldRound?.matchIds.indexOf(String(shifted.matchId)) ?? 0);
        const matchId = roundOne(String(shifted.competitionId))[position] ?? shifted.matchId;
        const rewrite = (value: unknown) => typeof value === 'string' ? value.replaceAll(String(shifted.matchId), String(matchId)) : value;
        return { ...shifted, matchId, idempotencyKey: rewrite(shifted.idempotencyKey), sourceEventId: rewrite(shifted.sourceEventId), id: rewrite(shifted.id) };
      }
      return shifted;
    });
  }
  return out as T;
}

/** The fantasy package keyed the way the seed writes it: one entry per Firestore collection. */
export function fantasyCollections(demo: Record<string, unknown[]>): Record<string, unknown[]> {
  return {
    fantasyCompetitions: demo.competitions,
    fantasyScoringProfiles: demo.scoringProfiles,
    fantasySquadRules: demo.squadRules,
    fantasyRounds: demo.rounds,
    fantasyPlayers: demo.players,
    fantasyPlayerPrices: demo.playerPrices,
    fantasyTeams: demo.teams,
    fantasyLineupVersions: demo.lineupVersions,
    fantasyTransfers: demo.transfers,
    fantasyPointEvents: demo.pointEvents,
    fantasyRoundScores: demo.roundScores,
    fantasyLeaderboards: demo.leaderboards,
    fantasyMiniLeagues: demo.miniLeagues,
    fantasyMiniLeagueMembers: demo.miniLeagueMembers,
    fantasyAchievements: demo.achievements,
    fantasyCorrections: demo.corrections,
  };
}
