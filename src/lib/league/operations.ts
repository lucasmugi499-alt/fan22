import type { Match, Team } from '@/types';

/**
 * What a League Admin needs to know on a matchday, computed once.
 *
 * The old landing page answered "how big is my league": teams, athletes, a verified
 * percentage, an index. All true, none of it actionable. A league is run by answering four
 * questions in order — what is happening, what needs me, what is next, what just changed —
 * and none of them were on the screen.
 *
 * Pure and framework-free so the same model serves the server read path, the demo path and
 * the tests. Every field is derived from records the platform already keeps; nothing here
 * invents a status.
 */

export type MatchOperationalState =
  /** No fixture date has passed and nothing has been assigned. */
  | 'draft'
  /** Scheduled, but nobody is going to record it. */
  | 'unassigned'
  /** Assigned and waiting for kickoff. */
  | 'ready'
  /** In progress. */
  | 'live'
  /** Played, waiting for the finalizer. */
  | 'awaiting_result'
  /** Official. */
  | 'official'
  /** Something needs a person. */
  | 'needs_review'
  /**
   * Kickoff has passed and the match never started.
   *
   * Distinct from every other state because it is the one a fixture falls into by nobody
   * doing anything. Without it a scheduled match whose date has gone by stays "upcoming"
   * forever: a league with a hundred of them reads as a league with a hundred fixtures to
   * come, and the one thing needing attention — that they were never played — is the one
   * thing the screen does not say.
   */
  | 'missed'
  /** Called off. Kept distinct so it never reads as a fixture still to play. */
  | 'cancelled';

/**
 * How long after kickoff a fixture with no result becomes an exception.
 *
 * Long enough to cover the match itself plus a Field Manager finishing up and syncing, short
 * enough that a fixture nobody played is flagged the same evening rather than next week.
 */
export const MISSED_AFTER_KICKOFF_MS = 6 * 60 * 60_000;

export type FieldManagerPresence = {
  displayName: string | null;
  /** Seconds since the last observed sync, or null when nothing has ever synced. */
  secondsSinceSync: number | null;
  /**
   * Derived from an observed sync, never asserted.
   *
   * A card that says "online" because an assignment exists is worse than one that says
   * nothing: it tells the League Admin the match is covered at the exact moment it is not.
   */
  presence: 'online' | 'stale' | 'offline' | 'unknown';
};

export type LeagueMatchRow = {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  scheduledAt: string;
  venue: string | null;
  state: MatchOperationalState;
  score: { home: number; away: number } | null;
  fieldManager: FieldManagerPresence | null;
  /** Why this match needs a person, in one sentence. */
  attention: string | null;
};

/** Beyond this, a sync gap is worth showing rather than smoothing over. */
const STALE_AFTER_SECONDS = 120;
const OFFLINE_AFTER_SECONDS = 300;

export function fieldManagerPresence({
  displayName,
  lastSyncAt,
  now,
}: {
  displayName?: string | null;
  lastSyncAt?: string | null;
  now: string;
}): FieldManagerPresence {
  if (!lastSyncAt) {
    return { displayName: displayName ?? null, secondsSinceSync: null, presence: 'unknown' };
  }
  const synced = Date.parse(lastSyncAt);
  const reference = Date.parse(now);
  if (!Number.isFinite(synced) || !Number.isFinite(reference)) {
    return { displayName: displayName ?? null, secondsSinceSync: null, presence: 'unknown' };
  }
  const seconds = Math.max(0, Math.round((reference - synced) / 1000));
  return {
    displayName: displayName ?? null,
    secondsSinceSync: seconds,
    presence: seconds <= STALE_AFTER_SECONDS
      ? 'online'
      : seconds <= OFFLINE_AFTER_SECONDS ? 'stale' : 'offline',
  };
}

function teamName(teams: readonly Team[], id: string | undefined) {
  if (!id) return 'To be confirmed';
  return teams.find((team) => team.id === id)?.name ?? id;
}

function isSameDay(a: string, b: string) {
  const left = new Date(a);
  const right = new Date(b);
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

/**
 * One match's operational state, and why it needs a person if it does.
 *
 * State is read from the match record plus whether anyone is assigned to record it. The
 * ordering matters: a match that is live but unrecorded is not "live", it is a problem, and
 * the row has to say so.
 */
export function matchOperationalRow({
  match,
  teams,
  assignment,
  hasOpenException,
  now,
}: {
  match: Match;
  teams: readonly Team[];
  assignment?: { displayName?: string | null; lastSyncAt?: string | null; status?: string } | null;
  hasOpenException?: boolean;
  now: string;
}): LeagueMatchRow {
  const presence = assignment
    ? fieldManagerPresence({ displayName: assignment.displayName, lastSyncAt: assignment.lastSyncAt, now })
    : null;

  const score = typeof match.score?.home === 'number' && typeof match.score?.away === 'number'
    ? { home: match.score.home, away: match.score.away }
    : null;

  let state: MatchOperationalState;
  let attention: string | null = null;

  if (hasOpenException) {
    state = 'needs_review';
    attention = 'An integrity exception on this match is waiting for a decision.';
  } else if (match.status === 'completed' && match.verificationStatus === 'verified') {
    state = 'official';
  } else if (match.status === 'completed') {
    state = 'awaiting_result';
    attention = 'Played, and still waiting for an official result.';
  } else if (match.status === 'cancelled') {
    state = 'cancelled';
  } else if (match.status === 'live') {
    state = 'live';
    if (!assignment) {
      attention = 'This match is under way with nobody assigned to record it.';
    } else if (presence?.presence === 'offline') {
      attention = `The Field Manager has not synced for ${Math.round((presence.secondsSinceSync ?? 0) / 60)} minutes.`;
    }
  } else if (match.status === 'scheduled'
    && Date.parse(match.scheduledAt) + MISSED_AFTER_KICKOFF_MS < Date.parse(now)) {
    /*
     * Checked before the assignment branches on purpose. A fixture whose kickoff was three
     * months ago does not need a Field Manager assigned, it needs somebody to decide what
     * happened to it, and offering "assign a manager" for a date that has gone is a control
     * that cannot help.
     */
    state = 'missed';
    attention = 'Kickoff has passed and no result was recorded.';
  } else if (match.status === 'scheduled' && !assignment) {
    state = 'unassigned';
    attention = 'No Field Manager assigned.';
  } else if (match.status === 'scheduled') {
    state = 'ready';
  } else {
    state = 'draft';
  }

  return {
    matchId: match.id,
    homeTeamName: teamName(teams, match.homeTeamId),
    awayTeamName: teamName(teams, match.awayTeamId),
    scheduledAt: match.scheduledAt,
    venue: typeof match.venue === 'string' && match.venue.trim() ? match.venue : null,
    state,
    score,
    fieldManager: presence,
    attention,
  };
}

export type AttentionItem = {
  id: string;
  /** What is wrong, in the league's own words. */
  label: string;
  /** How urgent, which decides ordering and tone. */
  severity: 'critical' | 'warning' | 'info';
  href: string;
};

export type LeagueCommandModel = {
  /**
   * Every fixture in the window, in one place.
   *
   * The Command Centre only reads `today` and `next`, but the Matches workspace segments the
   * whole window into Live, Upcoming, Needs review and Completed. Without this it could only
   * ever show the handful of rows Command happened to need, so three of its four segments were
   * permanently empty against live data.
   */
  rows: LeagueMatchRow[];
  today: {
    total: number;
    live: number;
    upcoming: number;
    rows: LeagueMatchRow[];
  };
  attention: AttentionItem[];
  /** How many attention items exist beyond the ones returned. */
  attentionOverflow: number;
  next: LeagueMatchRow[];
  /** True when there is genuinely nothing to do, which is a success state and reads as one. */
  quiet: boolean;
};

const SEVERITY_ORDER: Record<AttentionItem['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/**
 * The Command Centre model.
 *
 * Attention items are ordered by severity and then by their own text, so the list is stable
 * between renders. A league with nothing wrong gets an empty list rather than a reassuring
 * summary: on a quiet day this surface should be quiet.
 */
export function buildLeagueCommand({
  matches,
  teams,
  assignmentsByMatchId = {},
  openExceptionMatchIds = [],
  registrationIssueCount = 0,
  unclaimedAthleteCount = 0,
  now,
  nextLimit = 4,
  attentionLimit = 5,
}: {
  matches: readonly Match[];
  teams: readonly Team[];
  assignmentsByMatchId?: Record<string, { displayName?: string | null; lastSyncAt?: string | null; status?: string }>;
  openExceptionMatchIds?: readonly string[];
  registrationIssueCount?: number;
  unclaimedAthleteCount?: number;
  now: string;
  nextLimit?: number;
  /**
   * A league with forty unassigned fixtures should not be handed forty rows.
   *
   * The Command Centre exists to say what to do next, and an unbounded list is a list nobody
   * reads. The most consequential items are kept and the rest are counted, with the full set
   * one tap away in Matches.
   */
  attentionLimit?: number;
}): LeagueCommandModel {
  const exceptionSet = new Set(openExceptionMatchIds);
  const rows = matches.map((match) => matchOperationalRow({
    match,
    teams,
    assignment: assignmentsByMatchId[match.id] ?? null,
    hasOpenException: exceptionSet.has(match.id),
    now,
  }));

  const todayRows = rows
    .filter((row) => isSameDay(row.scheduledAt, now))
    .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt));

  const attention: AttentionItem[] = [];
  for (const row of rows) {
    if (!row.attention) continue;
    // Missed fixtures are counted below instead of listed. A season abandoned in April is a
    // hundred of them, and a hundred identical rows would push every other item out of a list
    // that only shows five.
    if (row.state === 'missed') continue;
    attention.push({
      id: `match:${row.matchId}`,
      label: `${row.homeTeamName} vs ${row.awayTeamName}: ${row.attention}`,
      severity: row.state === 'needs_review' || row.state === 'live' ? 'critical' : 'warning',
      href: `/league-admin/matches/${encodeURIComponent(row.matchId)}`,
    });
  }
  const missedCount = rows.filter((row) => row.state === 'missed').length;
  if (missedCount > 0) {
    attention.push({
      id: 'missed',
      label: `${missedCount} ${missedCount === 1 ? 'fixture was' : 'fixtures were'} never played`,
      severity: 'warning',
      href: '/league-admin/matches?filter=missed',
    });
  }
  if (registrationIssueCount > 0) {
    attention.push({
      id: 'registrations',
      label: `${registrationIssueCount} athlete ${registrationIssueCount === 1 ? 'registration needs' : 'registrations need'} review`,
      severity: 'warning',
      href: '/league-admin/athletes?filter=issues',
    });
  }
  if (unclaimedAthleteCount > 0) {
    attention.push({
      id: 'unclaimed',
      label: `${unclaimedAthleteCount} athlete ${unclaimedAthleteCount === 1 ? 'profile is' : 'profiles are'} unclaimed`,
      severity: 'info',
      href: '/league-admin/athletes?filter=unclaimed',
    });
  }
  attention.sort((left, right) =>
    SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
    || left.label.localeCompare(right.label));
  const attentionOverflow = Math.max(0, attention.length - attentionLimit);
  const visibleAttention = attention.slice(0, attentionLimit);

  const next = rows
    .filter((row) => (row.state === 'ready' || row.state === 'unassigned')
      && Date.parse(row.scheduledAt) >= Date.parse(now))
    .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt))
    .slice(0, nextLimit);

  return {
    rows,
    today: {
      total: todayRows.length,
      live: todayRows.filter((row) => row.state === 'live').length,
      upcoming: todayRows.filter((row) => row.state === 'ready' || row.state === 'unassigned').length,
      rows: todayRows,
    },
    attention: visibleAttention,
    attentionOverflow,
    next,
    quiet: attention.length === 0 && todayRows.length === 0,
  };
}

export type MatchSegment = 'live' | 'upcoming' | 'missed' | 'completed' | 'review';

/** Which segment of the Matches workspace a row belongs in. */
export function segmentFor(row: LeagueMatchRow): MatchSegment {
  if (row.state === 'needs_review' || row.state === 'awaiting_result') return 'review';
  if (row.state === 'live') return 'live';
  // Its own segment rather than folded into Needs review: those are results whose integrity is
  // in question, and these are fixtures with no result at all. Mixing them buries both.
  if (row.state === 'missed') return 'missed';
  // A cancelled fixture is finished business, not something still to play.
  if (row.state === 'official' || row.state === 'cancelled') return 'completed';
  return 'upcoming';
}

export function segmentMatches(rows: readonly LeagueMatchRow[]) {
  const counts: Record<MatchSegment, number> = { live: 0, upcoming: 0, missed: 0, completed: 0, review: 0 };
  for (const row of rows) counts[segmentFor(row)] += 1;
  return counts;
}

/**
 * Human wording for a capture policy.
 *
 * The stored value is an enum and the League Admin is not required to learn it. What they need
 * is what it means for them on a Saturday.
 */
export function capturePolicyCopy(policy: string): { title: string; detail: string } {
  if (policy === 'FIELD_REQUIRED') {
    return {
      title: 'Field Required',
      detail: 'Matches must use GoalPlace Field Capture. Entering a result afterwards needs an exceptional override.',
    };
  }
  if (policy === 'FIELD_PREFERRED') {
    return {
      title: 'Field Preferred',
      detail: 'Field Capture is expected. You may enter a result afterwards, with a reason on the record.',
    };
  }
  return {
    title: 'Post-Match Allowed',
    detail: 'You may enter results after matches. Data quality will be limited, and results say so.',
  };
}
