import type { LeagueStanding } from './leagueModel';

export type SportKey = 'football' | 'basketball' | 'rugby';

export type StandingColumnKey =
  | 'played'
  | 'wins'
  | 'draws'
  | 'losses'
  | 'pct'
  | 'gb'
  | 'pointsFor'
  | 'pointsAgainst'
  | 'difference'
  | 'points';

export type StandingColumn = {
  key: StandingColumnKey;
  label: string;
  className?: string;
  /**
   * `core` columns are the ones a published table is unreadable without, and they stay
   * visible at every width. `extended` columns are the supporting detail that a broadsheet
   * shows and a phone drops.
   *
   * The split exists because the mobile table used to collapse to three columns and stack
   * form badges under each club, which read as a card list rather than a standings table.
   * Sky and ESPN both fit the full core set on the same phone width; so can this.
   */
  priority: 'core' | 'extended';
};

export type LineupSlot = {
  x: number;
  y: number;
};

export function sportKey(value?: string): SportKey {
  const normalized = value?.toLowerCase();
  if (normalized === 'basketball') return 'basketball';
  if (normalized === 'rugby') return 'rugby';
  return 'football';
}

export function sportDisplayName(value?: string) {
  const key = sportKey(value);
  if (key === 'basketball') return 'Basketball';
  if (key === 'rugby') return 'Rugby';
  return 'Football';
}

export function lineupStarterLimit(value?: string) {
  const key = sportKey(value);
  if (key === 'basketball') return 5;
  if (key === 'rugby') return 15;
  return 11;
}

export function lineupFormationLabel(value?: string) {
  const key = sportKey(value);
  if (key === 'basketball') return '2-3 court set';
  if (key === 'rugby') return '8 forwards / 7 backs';
  return '4-3-3';
}

export function lineupSurfaceLabel(value?: string) {
  const key = sportKey(value);
  if (key === 'basketball') return 'Court';
  if (key === 'rugby') return 'Field';
  return 'Pitch';
}

export function lineupSlots(value?: string): LineupSlot[] {
  const key = sportKey(value);
  if (key === 'basketball') {
    return [
      { x: 31, y: 30 },
      { x: 69, y: 30 },
      { x: 50, y: 48 },
      { x: 30, y: 67 },
      { x: 70, y: 67 },
    ];
  }
  if (key === 'rugby') {
    return [
      { x: 34, y: 78 },
      { x: 50, y: 78 },
      { x: 66, y: 78 },
      { x: 40, y: 66 },
      { x: 60, y: 66 },
      { x: 30, y: 55 },
      { x: 50, y: 55 },
      { x: 70, y: 55 },
      { x: 50, y: 43 },
      { x: 62, y: 35 },
      { x: 18, y: 28 },
      { x: 40, y: 25 },
      { x: 60, y: 25 },
      { x: 82, y: 28 },
      { x: 50, y: 14 },
    ];
  }
  return [
    { x: 50, y: 88 },
    { x: 18, y: 70 },
    { x: 39, y: 73 },
    { x: 61, y: 73 },
    { x: 82, y: 70 },
    { x: 28, y: 51 },
    { x: 50, y: 47 },
    { x: 72, y: 51 },
    { x: 20, y: 24 },
    { x: 50, y: 18 },
    { x: 80, y: 24 },
  ];
}

export function standingColumns(value?: string): StandingColumn[] {
  const key = sportKey(value);
  if (key === 'basketball') {
    // Basketball standings are read on win percentage, so PCT is core and games-behind is
    // the supporting detail — the ordering ESPN uses.
    return [
      { key: 'played', label: 'GP', priority: 'core' },
      { key: 'wins', label: 'W', priority: 'core' },
      { key: 'losses', label: 'L', priority: 'core' },
      { key: 'pct', label: 'PCT', priority: 'core' },
      { key: 'gb', label: 'GB', priority: 'extended' },
      { key: 'pointsFor', label: 'PF', priority: 'extended' },
      { key: 'pointsAgainst', label: 'PA', priority: 'extended' },
      { key: 'difference', label: 'DIFF', priority: 'extended' },
      { key: 'points', label: 'PTS', priority: 'core' },
    ];
  }
  const scoringLabels = key === 'rugby'
    ? { for: 'PF', against: 'PA', difference: 'PD' }
    : { for: 'GF', against: 'GA', difference: 'GD' };
  // Pl W D L GD Pts is the set every published football and rugby table carries, and the
  // set Sky fits on a phone. Scored-for/against are the broadsheet extras.
  return [
    { key: 'played', label: 'PL', priority: 'core' },
    { key: 'wins', label: 'W', priority: 'core' },
    { key: 'draws', label: 'D', priority: 'core' },
    { key: 'losses', label: 'L', priority: 'core' },
    { key: 'pointsFor', label: scoringLabels.for, priority: 'extended' },
    { key: 'pointsAgainst', label: scoringLabels.against, priority: 'extended' },
    { key: 'difference', label: scoringLabels.difference, priority: 'core' },
    { key: 'points', label: 'PTS', priority: 'core' },
  ];
}

export type StandingZones = {
  /** Rows 1..qualify are marked as the qualification band. 0 disables it. */
  qualify: number;
  /** The last `relegate` rows are marked as the drop band. 0 disables it. */
  relegate: number;
};

/**
 * How many rows the qualification and drop bands cover, given the size of the table.
 *
 * These were hardcoded to "top 4" and "bottom 3". In a four-club league every row
 * satisfied `rank <= 4`, so the whole table rendered in qualification green and a club
 * sitting second was labelled "Top four" — ten of the seventeen competitions here have
 * four clubs, so that was the normal case rather than an edge one.
 *
 * A band only means something when the table is long enough to have a middle. Below six
 * clubs there is nothing to qualify for and nothing to drop out of, so nothing is marked.
 * At ten or more the original bands are kept, because that is the size they were chosen
 * for.
 *
 * This is presentation, not competition rules: no league here declares promotion or
 * relegation, so the bands must never be read as official qualification. When leagues can
 * declare their own rules, this should defer to that instead of guessing from row count.
 */
export function standingZones(rowCount: number): StandingZones {
  if (rowCount < 6) return { qualify: 0, relegate: 0 };
  if (rowCount < 10) return { qualify: 2, relegate: 1 };
  return { qualify: 4, relegate: 3 };
}

/** Which band a rank falls in, or `null` for the middle of the table. */
export function standingZoneFor(rank: number, rowCount: number): 'qualify' | 'relegate' | null {
  const zones = standingZones(rowCount);
  if (zones.qualify && rank <= zones.qualify) return 'qualify';
  if (zones.relegate && rank > rowCount - zones.relegate) return 'relegate';
  return null;
}

export function standingCellValue(row: LeagueStanding, key: StandingColumnKey, leader?: LeagueStanding) {
  if (key === 'pct') {
    return row.played ? `.${Math.round((row.wins / row.played) * 1000).toString().padStart(3, '0')}` : '.000';
  }
  if (key === 'gb') return gamesBehind(row, leader);
  if (key === 'difference') return row.difference > 0 ? `+${row.difference}` : String(row.difference);
  return String(row[key]);
}

export function gamesBehind(row: LeagueStanding, leader?: LeagueStanding) {
  if (!leader || row.teamId === leader.teamId) return '-';
  const value = ((leader.wins - row.wins) + (row.losses - leader.losses)) / 2;
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}
