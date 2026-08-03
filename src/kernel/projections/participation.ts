import type { OfficialSportEvent } from '@/kernel/types';
import type { SportSlug } from '@/types';

/**
 * How much is actually known about an athlete's involvement in a match.
 *
 * Being named in a squad is not playing. The finalizer previously wrote
 * `didPlay: true` and `appearance: 1` for every athlete in the active squad, which
 * manufactured career appearances, win participation and fantasy points for players who
 * may never have left the bench. Those records feed Career Passports and sponsor
 * evidence, so an unearned appearance is not a cosmetic error.
 *
 * The ladder is ordered by strength of evidence. Nothing promotes an athlete above the
 * evidence actually recorded.
 */
export type ParticipationLevel =
  /** Named in the match-day squad. No evidence they entered the field. */
  | 'selected_in_squad'
  /** Named in the starting line-up. */
  | 'started'
  /** Came on from the bench. */
  | 'entered_as_substitute'
  /** Did something only a player on the field can do, but no minutes recorded. */
  | 'played'
  /** Played, with verified minutes. */
  | 'minutes_confirmed';

/** Levels that constitute proof the athlete took part in play. */
const PLAYED_LEVELS: ReadonlySet<ParticipationLevel> = new Set([
  'started',
  'entered_as_substitute',
  'played',
  'minutes_confirmed',
]);

export type AthleteParticipation = {
  athleteId: string;
  teamId: string;
  level: ParticipationLevel;
  /** True only when the evidence shows the athlete took part, never from selection. */
  didPlay: boolean;
  /** Zero when no minutes event was recorded; never inferred. */
  minutesPlayed: number;
  /** Event ids that established this level, for audit and replay. */
  sourceEventIds: string[];
};

function suffix(eventType: string) {
  return eventType.includes('.') ? eventType.slice(eventType.indexOf('.') + 1) : eventType;
}

/**
 * Event suffixes that prove presence on the field. Selection and administrative events
 * are deliberately excluded — `active_squad` and `lineup_named` say only that a name was
 * written down.
 */
const NON_PLAYING_EVENTS: ReadonlySet<string> = new Set([
  'active_squad',
  'lineup_named',
]);

function numericPayloadValue(event: OfficialSportEvent): number {
  const payload = event.payload;
  if (payload && typeof payload === 'object' && 'value' in payload && typeof payload.value === 'number') {
    return payload.value;
  }
  return 0;
}

/**
 * Resolves one athlete's participation from the official events of a single match.
 *
 * Deliberately conservative: an athlete is only credited with playing when an event
 * requires it. Absence of evidence yields `selected_in_squad`, not an appearance.
 */
export function resolveAthleteParticipation({
  athleteId,
  teamId,
  events,
}: {
  athleteId: string;
  teamId: string;
  sportId?: SportSlug;
  events: OfficialSportEvent[];
}): AthleteParticipation {
  const own = events.filter((event) => event.primaryAthleteId === athleteId);
  const sourceEventIds: string[] = [];

  let level: ParticipationLevel = 'selected_in_squad';
  let minutesPlayed = 0;

  const promote = (next: ParticipationLevel, eventId: string) => {
    sourceEventIds.push(eventId);
    const order: ParticipationLevel[] = [
      'selected_in_squad',
      'started',
      'entered_as_substitute',
      'played',
      'minutes_confirmed',
    ];
    if (order.indexOf(next) > order.indexOf(level)) level = next;
  };

  for (const event of own) {
    const code = suffix(event.eventType);

    if (code === 'active_squad' || code === 'lineup_named') {
      sourceEventIds.push(event.id);
      continue;
    }
    if (code === 'minutes_played') {
      const value = numericPayloadValue(event);
      if (value > 0) {
        minutesPlayed = Math.max(minutesPlayed, value);
        promote('minutes_confirmed', event.id);
      } else {
        // An explicit zero-minutes record is evidence they did NOT play.
        sourceEventIds.push(event.id);
      }
      continue;
    }
    if (code === 'starter') {
      promote('started', event.id);
      continue;
    }
    if (code === 'substitution_on') {
      promote('entered_as_substitute', event.id);
      continue;
    }
    if (code === 'substitution_off') {
      // Coming off requires having been on.
      promote('played', event.id);
      continue;
    }
    if (!NON_PLAYING_EVENTS.has(code)) {
      // Scoring, cards, rebounds and the rest can only be produced on the field.
      promote('played', event.id);
    }
  }

  return {
    athleteId,
    teamId,
    level,
    didPlay: PLAYED_LEVELS.has(level),
    minutesPlayed,
    sourceEventIds: [...new Set(sourceEventIds)].sort(),
  };
}

/**
 * Whether appearance-derived statistics and fantasy rules may be applied to a match.
 *
 * A competition whose reports never distinguish playing from selection cannot support
 * appearance scoring honestly, so this reports the share of the squad with real
 * participation evidence rather than assuming it.
 */
export function participationCoverage(participations: AthleteParticipation[]) {
  const total = participations.length;
  const withEvidence = participations.filter((entry) => entry.didPlay).length;
  const withMinutes = participations.filter((entry) => entry.minutesPlayed > 0).length;
  return {
    squadSize: total,
    playedCount: withEvidence,
    minutesConfirmedCount: withMinutes,
    participationCoveragePercent: total ? Math.round((withEvidence / total) * 100) : 0,
    minutesCoveragePercent: total ? Math.round((withMinutes / total) * 100) : 0,
    /** Appearance-based scoring is only honest when participation is actually recorded. */
    appearanceScoringSupported: total > 0 && withEvidence > 0,
  };
}
