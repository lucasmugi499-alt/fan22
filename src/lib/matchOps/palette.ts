import { SPORT_DEFINITIONS } from '@/kernel/definitions/sportCatalogues';
import type { SportSlug } from '@/types';

/**
 * What a Field Manager can tap, per sport.
 *
 * Derived from the sport rather than hardcoded, because the kernel already knows which event
 * types are legal at a given collection level and a second list in the client is a second
 * answer that can disagree with it. What this adds on top is the part the kernel has no
 * opinion about: what a person on a touchline can record reliably, and how the buttons should
 * behave.
 *
 * ## Why each palette is shorter than the sport's event catalogue
 *
 * `BASKETBALL_STANDARD_EVENTS` has fifteen entries and this palette has five. Rebounds,
 * steals, blocks and turnovers are collected by professional systems with several people
 * watching. One observer with a phone cannot capture them accurately while also running the
 * clock, and data collected badly is worse than data not collected: it poisons fantasy, and
 * a missing rebound is invisible in aggregate because it looks exactly like a rebound that
 * did not happen.
 */

export type PaletteEntry = {
  type: string;
  label: string;
  /** Needs an athlete selected. A team event, such as a timeout, does not. */
  needsAthlete: boolean;
  /**
   * Carries a point value in its payload rather than a fixed weight per event.
   *
   * Basketball's whole scoring model. A three-pointer is one event worth three, never three
   * events worth one: recording it as three would put three scoring actions in the timeline
   * that never happened, and a career record built on it would show a player taking three
   * times as many shots as they did.
   */
  variableValue?: number[];
  /** Ordering hint for the persistent scoring panel. Lower is more prominent. */
  weight: number;
};

const FOOTBALL: PaletteEntry[] = [
  { type: 'football.goal', label: 'Goal', needsAthlete: true, weight: 0 },
  { type: 'football.own_goal', label: 'Own goal', needsAthlete: true, weight: 1 },
  { type: 'football.penalty_scored', label: 'Penalty scored', needsAthlete: true, weight: 2 },
  { type: 'football.penalty_missed', label: 'Penalty missed', needsAthlete: true, weight: 3 },
  { type: 'football.yellow_card', label: 'Yellow card', needsAthlete: true, weight: 4 },
  { type: 'football.second_yellow_card', label: 'Second yellow', needsAthlete: true, weight: 5 },
  { type: 'football.red_card', label: 'Red card', needsAthlete: true, weight: 6 },
  { type: 'football.substitution_on', label: 'Sub on', needsAthlete: true, weight: 7 },
  { type: 'football.substitution_off', label: 'Sub off', needsAthlete: true, weight: 8 },
];

/**
 * Basketball's rhythm is a scoring event roughly every forty seconds, which is a materially
 * harder capture problem than football's. The three point values are the palette: they sit
 * permanently on screen beside the player grid rather than behind a "+ Event" sheet, because
 * a scorer who has to open a menu for every basket falls behind in the first quarter.
 */
const BASKETBALL: PaletteEntry[] = [
  { type: 'basketball.points', label: '+1', needsAthlete: true, variableValue: [1], weight: 0 },
  { type: 'basketball.points', label: '+2', needsAthlete: true, variableValue: [2], weight: 1 },
  { type: 'basketball.points', label: '+3', needsAthlete: true, variableValue: [3], weight: 2 },
  { type: 'basketball.personal_fouls', label: 'Foul', needsAthlete: true, weight: 3 },
  { type: 'basketball.technical_fouls', label: 'Technical', needsAthlete: true, weight: 4 },
  { type: 'basketball.turnovers', label: 'Turnover', needsAthlete: true, weight: 5 },
];

const RUGBY: PaletteEntry[] = [
  { type: 'rugby.try', label: 'Try', needsAthlete: true, weight: 0 },
  { type: 'rugby.penalty_try', label: 'Penalty try', needsAthlete: false, weight: 1 },
  { type: 'rugby.conversion_made', label: 'Conversion', needsAthlete: true, weight: 2 },
  { type: 'rugby.conversion_missed', label: 'Conversion missed', needsAthlete: true, weight: 3 },
  { type: 'rugby.penalty_goal_made', label: 'Penalty goal', needsAthlete: true, weight: 4 },
  { type: 'rugby.drop_goal_made', label: 'Drop goal', needsAthlete: true, weight: 5 },
  { type: 'rugby.yellow_card', label: 'Yellow card', needsAthlete: true, weight: 6 },
  { type: 'rugby.red_card', label: 'Red card', needsAthlete: true, weight: 7 },
];

const PALETTES: Record<string, PaletteEntry[]> = {
  football: FOOTBALL,
  basketball: BASKETBALL,
  rugby: RUGBY,
};

export function paletteForSport(sport: SportSlug | string): PaletteEntry[] {
  return PALETTES[String(sport)] ?? FOOTBALL;
}

/**
 * Whether this sport wants scoring permanently on screen rather than behind a sheet.
 *
 * A property of how often the sport scores, not a preference. Football's palette can live
 * behind one tap because a goal is a rare event; basketball's cannot.
 */
export function usesPersistentScoringPanel(sport: SportSlug | string) {
  return String(sport) === 'basketball';
}

/**
 * The event types that contribute to the score, read from the kernel.
 *
 * Restating this list would be a second answer to "what counts as scoring", and the two would
 * diverge the first time a sport definition gained an event. The kernel's `legalScoringEvents`
 * is the definition; this just reads it.
 */
export function scoringEventTypesFor(sport: SportSlug | string): string[] {
  const definition = SPORT_DEFINITIONS.find((entry) => entry.sportId === String(sport));
  return (definition?.legalScoringEvents ?? []).map((entry) => entry.eventType);
}
