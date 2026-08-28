import { EVENT_TYPE_DEFINITIONS } from '@/kernel/definitions/sportCatalogues';
import type { OfficialSportEvent } from '@/kernel/types';

/**
 * Statistics that are real, but are not their own captured event.
 *
 * A field manager taps goals, cards and substitutions. Nobody taps "clean sheet" or "goals
 * conceded while this defender was on the pitch", and asking them to would be asking one
 * person to keep a second ledger while running the clock. Those facts are already implied by
 * the events that were captured, so they are derived here rather than collected.
 *
 * This is the difference between a rich football fantasy game and a thin one, at no cost to
 * the person on the touchline. It is deliberately *derivation*, not estimation: every number
 * below is a consequence of recorded events, and where the events do not support an answer
 * the answer is withheld rather than guessed.
 */

/** Event codes whose points go to the team that recorded them. */
const TEAM_SCORING_CODES = new Set(
  EVENT_TYPE_DEFINITIONS
    .filter((definition) => definition.scoring?.attribution === 'team')
    .map((definition) => definition.code),
);

/** Event codes whose points go to the opponent of the team that recorded them. */
const OPPONENT_SCORING_CODES = new Set(
  EVENT_TYPE_DEFINITIONS
    .filter((definition) => definition.scoring?.attribution === 'opponent')
    .map((definition) => definition.code),
);

function suffix(eventType: string) {
  return eventType.includes('.') ? eventType.slice(eventType.indexOf('.') + 1) : eventType;
}

function minuteOf(event: OfficialSportEvent): number | null {
  const minute = event.gameClock?.minute;
  return typeof minute === 'number' && Number.isFinite(minute) && minute >= 0 ? minute : null;
}

/**
 * The last minute anything was recorded, used as full time when no explicit end exists.
 *
 * A defender substituted off at 70 in a match whose last event is at 78 should not be
 * credited with the remaining twenty minutes of a nominal 90, because nothing recorded says
 * the match ran that long.
 */
export function observedFullTimeMinute(events: readonly OfficialSportEvent[]): number {
  return events.reduce((latest, event) => Math.max(latest, minuteOf(event) ?? 0), 0);
}

export type PitchWindow = {
  /** Minute the athlete came onto the field. */
  fromMinute: number;
  /** Minute they left it, or full time. */
  toMinute: number;
};

/**
 * When an athlete was on the field, from the events that say so.
 *
 * Returns null when nothing proves they were on it at all. Selection is not presence: an
 * unused substitute has no window, and therefore concedes nothing and earns no clean sheet.
 */
export function onPitchWindow({
  athleteId,
  events,
  fullTimeMinute,
}: {
  athleteId: string;
  events: readonly OfficialSportEvent[];
  fullTimeMinute: number;
}): PitchWindow | null {
  const own = events.filter((event) => event.primaryAthleteId === athleteId);
  if (!own.length) return null;

  let from: number | null = null;
  let to: number | null = null;
  let sawPlayingEvidence = false;

  for (const event of own) {
    const code = suffix(event.eventType);
    const minute = minuteOf(event);

    if (code === 'starter' || code === 'lineup_named_starting') {
      from = 0;
      sawPlayingEvidence = true;
      continue;
    }
    if (code === 'substitution_on') {
      from = minute ?? 0;
      sawPlayingEvidence = true;
      continue;
    }
    if (code === 'substitution_off') {
      to = minute ?? fullTimeMinute;
      sawPlayingEvidence = true;
      continue;
    }
    // A red card ends the athlete's involvement whether or not a substitution follows.
    if (code === 'red_card' || code === 'second_yellow_card') {
      to = minute ?? fullTimeMinute;
      sawPlayingEvidence = true;
      continue;
    }
    if (code === 'active_squad' || code === 'lineup_named') continue;
    // Anything else is an act only possible on the field.
    sawPlayingEvidence = true;
  }

  if (!sawPlayingEvidence) return null;
  /*
   * A player who only appears through, say, a goal event has no recorded entry minute. They
   * were demonstrably on the field, so the window opens at kickoff rather than being
   * discarded; treating them as absent would lose a real appearance.
   */
  return { fromMinute: from ?? 0, toMinute: to ?? fullTimeMinute };
}

/**
 * The minutes at which a team conceded.
 *
 * A team concedes when the opposition scores, and equally when one of its own players puts
 * the ball into their own net. Reading both from the sport catalogue's scoring attribution
 * keeps this consistent with how the score itself is reconstructed; a private list of
 * "goal-ish" event types here would be a second answer to what counts as a goal.
 */
export function concessionMinutes({
  events,
  teamId,
  fullTimeMinute,
}: {
  events: readonly OfficialSportEvent[];
  teamId: string;
  fullTimeMinute: number;
}): number[] {
  const minutes: number[] = [];
  for (const event of events) {
    if (!event.teamId) continue;
    const scoredByOpponent = TEAM_SCORING_CODES.has(event.eventType) && event.teamId !== teamId;
    const ownGoalByThisTeam = OPPONENT_SCORING_CODES.has(event.eventType) && event.teamId === teamId;
    if (!scoredByOpponent && !ownGoalByThisTeam) continue;
    minutes.push(minuteOf(event) ?? fullTimeMinute);
  }
  return minutes.sort((left, right) => left - right);
}

export type DerivedDefensiveStats = {
  /** Goals the athlete's team conceded while the athlete was on the field. */
  goalsConceded: number;
  /** True when the athlete played and their team conceded nothing while they were on. */
  cleanSheet: boolean;
  /** False when the events do not establish the athlete was ever on the field. */
  derivable: boolean;
};

/**
 * Clean sheets and goals conceded, for one athlete in one match.
 *
 * Attribution is by presence, not by squad membership: a defender substituted on at 80 in a
 * 3-0 defeat conceded nothing while they were playing, and a goalkeeper substituted off at 60
 * of a match that later conceded twice keeps their clean sheet for the part they played. That
 * is both fairer and the only reading the recorded events actually support.
 */
export function deriveDefensiveStats({
  athleteId,
  teamId,
  events,
  fullTimeMinute,
}: {
  athleteId: string;
  teamId: string;
  events: readonly OfficialSportEvent[];
  fullTimeMinute?: number;
}): DerivedDefensiveStats {
  const fullTime = fullTimeMinute ?? observedFullTimeMinute(events);
  const window = onPitchWindow({ athleteId, events, fullTimeMinute: fullTime });
  if (!window) return { goalsConceded: 0, cleanSheet: false, derivable: false };

  const conceded = concessionMinutes({ events, teamId, fullTimeMinute: fullTime })
    .filter((minute) => minute >= window.fromMinute && minute <= window.toMinute);

  return {
    goalsConceded: conceded.length,
    cleanSheet: conceded.length === 0,
    derivable: true,
  };
}

/**
 * The derived stat keys, in the shape `officialAthleteMatchStats.stats` uses.
 *
 * Returned as a partial record so a caller can spread it over captured stats without having
 * to know which keys derivation was able to establish. A non-derivable athlete contributes
 * nothing rather than a zero, because a zero here would read as a recorded fact.
 */
export function derivedDefensiveStatKeys(stats: DerivedDefensiveStats): Record<string, number> {
  if (!stats.derivable) return {};
  return {
    goals_conceded: stats.goalsConceded,
    clean_sheet: stats.cleanSheet ? 1 : 0,
  };
}
