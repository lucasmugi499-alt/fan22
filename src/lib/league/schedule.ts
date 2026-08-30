import type { CapturePolicy } from '@/lib/capturePolicy';

/**
 * Building a season's fixtures.
 *
 * A league with ten clubs playing each other twice is ninety fixtures. Entering those by hand
 * is a afternoon of typing and a guaranteed source of duplicates, wrong pairings and clubs
 * playing themselves — which is why the League Admin surface could show fixtures but never
 * create a season's worth of them.
 *
 * Everything here is pure. The generator proposes; nothing is written until the League Admin
 * has read the preview and published it, and publication goes through the existing trusted
 * fixture command rather than a new write path.
 *
 * ## Why the draft lives in the preview rather than in the database
 *
 * The brief asks for generated fixtures to begin as drafts. The trusted `create_fixtures`
 * command only accepts `scheduled`, and adding a draft state to the sporting record would mean
 * fixtures that exist, are visible to nothing, and have to be reaped. The preview is the draft:
 * it is reviewable, editable and discardable, and only what survives review is ever written.
 */

export type SchedulePairing = {
  round: number;
  homeTeamId: string;
  awayTeamId: string;
};

export type ScheduleFormat = 'single_round_robin' | 'double_round_robin' | 'knockout';

/**
 * Round-robin pairings by the circle method.
 *
 * One club is held fixed and the rest rotate, so every club meets every other exactly once.
 * An odd number of clubs gets a bye each round rather than an unbalanced fixture — a club
 * silently omitted from a round reads as the schedule forgetting them.
 *
 * The double variant replays the whole set with the sides swapped, so home and away are even
 * across the season rather than accumulating on whoever the algorithm happened to list first.
 */
export function roundRobinPairings(
  teamIds: readonly string[],
  format: 'single_round_robin' | 'double_round_robin' = 'single_round_robin',
): SchedulePairing[] {
  const teams = [...new Set(teamIds)];
  if (teams.length < 2) return [];

  const BYE = '__bye__';
  const entrants = teams.length % 2 === 0 ? teams : [...teams, BYE];
  const roundsPerLeg = entrants.length - 1;
  const half = entrants.length / 2;
  const firstLeg: SchedulePairing[] = [];

  let rotating = entrants.slice(1);
  const fixed = entrants[0];

  for (let round = 1; round <= roundsPerLeg; round += 1) {
    const ordered = [fixed, ...rotating];
    for (let index = 0; index < half; index += 1) {
      const a = ordered[index];
      const b = ordered[ordered.length - 1 - index];
      if (a === BYE || b === BYE) continue;
      // Alternate which side is home each round so the fixed club is not always at home.
      firstLeg.push(round % 2 === 0
        ? { round, homeTeamId: b, awayTeamId: a }
        : { round, homeTeamId: a, awayTeamId: b });
    }
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }

  if (format === 'single_round_robin') return firstLeg;

  const secondLeg = firstLeg.map((pairing) => ({
    round: pairing.round + roundsPerLeg,
    homeTeamId: pairing.awayTeamId,
    awayTeamId: pairing.homeTeamId,
  }));
  return [...firstLeg, ...secondLeg];
}

/** Days of the week a league plays on, as `Date.getDay()` values. */
export type MatchDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type ScheduleWindow = {
  /** ISO date, inclusive. */
  startDate: string;
  /** ISO date, inclusive. */
  endDate: string;
  matchDays: readonly MatchDay[];
  /** Local kickoff, `HH:MM`, applied to every fixture in a round. */
  kickoffTime: string;
};

/**
 * The dates a round can be played on, in order, inside the season window.
 *
 * Bounded by the window rather than by the number of rounds, so a season that cannot fit its
 * fixtures says so instead of quietly running past its own end date.
 */
export function matchDates(window: ScheduleWindow, limit = 120): string[] {
  const start = new Date(`${window.startDate}T00:00:00.000Z`);
  const end = new Date(`${window.endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return [];
  if (!window.matchDays.length) return [];

  const [hours, minutes] = window.kickoffTime.split(':').map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return [];

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && dates.length < limit) {
    if (window.matchDays.includes(cursor.getUTCDay() as MatchDay)) {
      const kickoff = new Date(cursor);
      kickoff.setUTCHours(hours, minutes, 0, 0);
      dates.push(kickoff.toISOString());
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export type PreviewFixture = {
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  scheduledAt: string;
  venue: string;
};

export type SchedulePreview = {
  fixtures: PreviewFixture[];
  rounds: number;
  /** Stated plainly rather than silently truncating. */
  blockers: string[];
  warnings: string[];
};

/**
 * A pairing this season already holds, for the duplicate check.
 *
 * Only the two clubs, deliberately. A generated schedule that re-creates a pairing the season
 * already has is a duplicate whatever date it lands on, and comparing dates as well would let
 * a whole second season through because the generator happened to pick different Saturdays.
 */
export type ExistingPairing = { homeTeamId: string; awayTeamId: string };

/**
 * A complete season proposal, ready to be read before anything is written.
 *
 * Every round is played on one date, which is how grassroots leagues actually run: a matchday
 * is a day, not a scattering. Where the window cannot hold every round the preview refuses
 * rather than dropping the tail, because a schedule missing its last four rounds looks
 * complete and is not.
 */
export function buildSchedulePreview({
  teams,
  format,
  window,
  defaultVenue,
  now,
  existing = [],
}: {
  teams: ReadonlyArray<{ id: string; name: string; homeVenue?: string }>;
  format: ScheduleFormat;
  window: ScheduleWindow;
  defaultVenue: string;
  /**
   * When "now" is, for the past-window checks. Injected rather than read from the clock so the
   * preview is a pure function of its inputs and can be tested at a fixed date.
   */
  now?: string;
  /** Fixtures the season already holds, so a generated schedule cannot duplicate them. */
  existing?: ReadonlyArray<ExistingPairing>;
}): SchedulePreview {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (teams.length < 2) blockers.push('A competition needs at least two clubs before it can be scheduled.');
  if (format === 'knockout') {
    blockers.push('Knockout scheduling is not available yet. Generate a round robin, or create knockout fixtures individually.');
  }
  if (Date.parse(window.endDate) < Date.parse(window.startDate)) {
    blockers.push('The season ends before it starts.');
  }
  if (!window.matchDays.length) blockers.push('Choose at least one match day.');

  /*
   * A window that has already ended.
   *
   * The builder pre-fills its dates from the season, so a League Admin opening it against a
   * season that finished in June gets June's dates and a working Publish button. Doing that
   * created fifty-five fixtures dated months ago: they were written correctly, and then every
   * screen that lists what is coming up showed nothing, because none of it was coming up.
   *
   * A finished window is a blocker rather than a warning. There is no reading of "schedule a
   * season that has already ended" that is a thing somebody meant to do.
   */
  const nowMillis = Date.parse(now ?? new Date().toISOString());
  const windowEnd = Date.parse(`${window.endDate}T23:59:59.999Z`);
  if (Number.isFinite(nowMillis) && Number.isFinite(windowEnd) && windowEnd < nowMillis) {
    blockers.push(
      'This date window has already passed, so every fixture would be created overdue. '
      + 'Choose dates in the future, or open a new season.',
    );
  }

  if (blockers.length) return { fixtures: [], rounds: 0, blockers, warnings };

  const pairings = roundRobinPairings(
    teams.map((team) => team.id),
    format === 'double_round_robin' ? 'double_round_robin' : 'single_round_robin',
  );
  const rounds = pairings.reduce((highest, pairing) => Math.max(highest, pairing.round), 0);
  const dates = matchDates(window);

  if (dates.length < rounds) {
    blockers.push(
      `This schedule needs ${rounds} match days and the season window only has ${dates.length}. `
      + 'Widen the dates or add a match day.',
    );
    return { fixtures: [], rounds, blockers, warnings };
  }

  if (teams.length % 2 === 1) {
    warnings.push('An odd number of clubs means one club rests each round.');
  }

  /*
   * Pairings the season already holds.
   *
   * Generating a full round robin into a season that already has one does not fail and does
   * not overwrite: it doubles the season, and the league is left with every club playing every
   * other club twice as often as its own rules say. That is what happened here, so this refuses
   * by name rather than warning — a warning above a working Publish button is not a stop.
   */
  const held = new Set(existing.map((pairing) => `${pairing.homeTeamId}|${pairing.awayTeamId}`));
  const duplicates = pairings.filter((pairing) =>
    held.has(`${pairing.homeTeamId}|${pairing.awayTeamId}`)).length;
  if (duplicates) {
    blockers.push(
      `${duplicates} of these ${pairings.length} fixtures already exist in this season. `
      + 'Publishing would create them a second time. Use Single fixture to add what is missing.',
    );
    return { fixtures: [], rounds, blockers, warnings };
  }

  const nameById = new Map(teams.map((team) => [team.id, team.name]));
  const venueById = new Map(teams.map((team) => [team.id, team.homeVenue]));

  const fixtures = pairings.map((pairing) => ({
    round: pairing.round,
    homeTeamId: pairing.homeTeamId,
    awayTeamId: pairing.awayTeamId,
    homeTeamName: nameById.get(pairing.homeTeamId) ?? pairing.homeTeamId,
    awayTeamName: nameById.get(pairing.awayTeamId) ?? pairing.awayTeamId,
    scheduledAt: dates[pairing.round - 1],
    venue: venueById.get(pairing.homeTeamId) || defaultVenue,
  }));

  /*
   * A window that starts in the past but has not finished. Legitimate — a league adopting the
   * platform mid-season backfills — so it is said rather than refused, with the count, because
   * "some of these are overdue" and "eleven of these are overdue" are different facts.
   */
  const overdue = fixtures.filter((fixture) => Date.parse(fixture.scheduledAt) < nowMillis).length;
  if (overdue) {
    warnings.push(
      `${overdue} of these ${fixtures.length} fixtures are dated before today and will be `
      + 'created already overdue, so they appear under Not played rather than Upcoming.',
    );
  }

  return { fixtures, rounds, blockers, warnings };
}

export type FixtureDraft = {
  homeTeamId: string;
  awayTeamId: string;
  scheduledAt: string;
  venue: string;
};

/**
 * What is wrong with a single fixture, before it reaches the server.
 *
 * The trusted command re-checks everything that matters; this exists so a League Admin is told
 * at the point of typing rather than after a submit, and so the message names the actual clash
 * rather than reporting that something was rejected.
 */
export function validateFixture({
  draft,
  existing,
  seasonStart,
  seasonEnd,
  competitionTeamIds,
}: {
  draft: FixtureDraft;
  existing: ReadonlyArray<{ homeTeamId: string; awayTeamId: string; scheduledAt: string; venue?: string | null }>;
  seasonStart?: string;
  seasonEnd?: string;
  competitionTeamIds?: readonly string[];
}): string[] {
  const errors: string[] = [];

  if (!draft.homeTeamId || !draft.awayTeamId) {
    errors.push('Choose both clubs.');
  } else if (draft.homeTeamId === draft.awayTeamId) {
    errors.push('A club cannot play itself.');
  }

  if (competitionTeamIds?.length) {
    for (const [side, id] of [['Home', draft.homeTeamId], ['Away', draft.awayTeamId]] as const) {
      if (id && !competitionTeamIds.includes(id)) {
        errors.push(`${side} club is not part of this competition.`);
      }
    }
  }

  const kickoff = Date.parse(draft.scheduledAt);
  if (!Number.isFinite(kickoff)) {
    errors.push('Choose a kickoff date and time.');
  } else {
    if (seasonStart && kickoff < Date.parse(seasonStart)) {
      errors.push('This kickoff is before the season starts.');
    }
    if (seasonEnd && kickoff > Date.parse(seasonEnd)) {
      errors.push('This kickoff is after the season ends.');
    }
  }

  const sameDay = (a: string, b: string) =>
    new Date(a).toDateString() === new Date(b).toDateString();

  for (const fixture of existing) {
    const duplicate = fixture.homeTeamId === draft.homeTeamId
      && fixture.awayTeamId === draft.awayTeamId
      && sameDay(fixture.scheduledAt, draft.scheduledAt);
    if (duplicate) {
      errors.push('These clubs are already scheduled against each other that day.');
      continue;
    }
    const clashing = [draft.homeTeamId, draft.awayTeamId]
      .filter((id) => id === fixture.homeTeamId || id === fixture.awayTeamId);
    if (clashing.length && sameDay(fixture.scheduledAt, draft.scheduledAt)) {
      errors.push('One of these clubs already has a fixture that day.');
      continue;
    }
    if (draft.venue && fixture.venue === draft.venue
      && Math.abs(Date.parse(fixture.scheduledAt) - kickoff) < 2 * 60 * 60_000) {
      errors.push(`${draft.venue} is already booked within two hours of this kickoff.`);
    }
  }

  return [...new Set(errors)];
}

/**
 * What publishing a schedule will mean for how its results may be recorded.
 *
 * Capture policy binds at fixture creation, so the League Admin should see it before they
 * publish rather than discover it on the first matchday.
 */
export function publicationNotice(policy: CapturePolicy, fixtureCount: number): string {
  const count = `${fixtureCount} ${fixtureCount === 1 ? 'fixture' : 'fixtures'}`;
  if (policy === 'FIELD_REQUIRED') {
    return `${count} will be created. Each one must be captured live by a Field Manager; a result typed in afterwards needs an exceptional override.`;
  }
  if (policy === 'FIELD_PREFERRED') {
    return `${count} will be created. Field Capture is expected, and a result entered afterwards will carry a recorded reason.`;
  }
  return `${count} will be created. Results may be entered after the match, and those results carry a lower data-quality tier.`;
}

export type RescheduleRefusal = { ok: false; reason: string };

export type ReschedulePlan = {
  ok: true;
  fromScheduledAt: string;
  toScheduledAt: string;
  fromVenue: string | null;
  toVenue: string | null;
  /** Whole hours moved, signed. Negative brings a fixture forward. */
  movedByHours: number;
};

export type RescheduleDecision = ReschedulePlan | RescheduleRefusal;

/**
 * Moving a fixture, without losing the fact that it moved.
 *
 * Deliberately not a date edit. A fixture that is silently overwritten leaves clubs, athletes
 * and anyone holding the old date with no way to know it changed, and leaves the league with
 * no record of who moved it or why. So this is a decision with a reason attached, and the
 * caller writes a history entry alongside the change.
 *
 * The capture policy is **not** re-derived here. Policy binds when a fixture is created, and
 * re-binding it on a reschedule would retroactively change the standard a match must be
 * recorded to — tightening it under clubs who planned around the original, or loosening one
 * that was created under a stricter floor.
 */
export function decideReschedule({
  status,
  currentScheduledAt,
  currentVenue,
  nextScheduledAt,
  nextVenue,
  reason,
  seasonStart,
  seasonEnd,
  now,
}: {
  status: string;
  currentScheduledAt: string;
  currentVenue?: string | null;
  nextScheduledAt: string;
  nextVenue?: string | null;
  reason: string;
  seasonStart?: string;
  seasonEnd?: string;
  now: string;
}): RescheduleDecision {
  if (status !== 'scheduled') {
    return {
      ok: false,
      reason: status === 'live'
        ? 'This match is under way. A match in progress cannot be rescheduled.'
        : `A ${status} match cannot be rescheduled. Its record is already part of the season.`,
    };
  }
  if (reason.trim().length < 4) {
    return { ok: false, reason: 'Give a reason. Clubs are told why their fixture moved.' };
  }

  const from = Date.parse(currentScheduledAt);
  const to = Date.parse(nextScheduledAt);
  if (!Number.isFinite(to)) return { ok: false, reason: 'Choose a valid new kickoff.' };
  if (!Number.isFinite(from)) return { ok: false, reason: 'This fixture has no valid current kickoff.' };

  const sameTime = from === to;
  const sameVenue = (currentVenue ?? null) === (nextVenue ?? currentVenue ?? null);
  if (sameTime && sameVenue) {
    return { ok: false, reason: 'Nothing changed. Choose a different kickoff or venue.' };
  }

  if (to < Date.parse(now)) {
    return { ok: false, reason: 'The new kickoff is in the past.' };
  }
  if (seasonStart && to < Date.parse(seasonStart)) {
    return { ok: false, reason: 'The new kickoff is before the season starts.' };
  }
  if (seasonEnd && to > Date.parse(seasonEnd)) {
    return { ok: false, reason: 'The new kickoff is after the season ends.' };
  }

  return {
    ok: true,
    fromScheduledAt: currentScheduledAt,
    toScheduledAt: nextScheduledAt,
    fromVenue: currentVenue ?? null,
    toVenue: nextVenue ?? currentVenue ?? null,
    movedByHours: Math.round((to - from) / 3_600_000),
  };
}

export type ImportedFixtureRow = {
  /** 1-based row number in the file, so an error can name the line. */
  line: number;
  homeTeamId: string;
  awayTeamId: string;
  scheduledAt: string;
  venue: string;
};

export type FixtureImportResult = {
  rows: ImportedFixtureRow[];
  /** One message per rejected line, each naming its line number. */
  errors: string[];
};

/**
 * Reads a fixture list somebody already has.
 *
 * Leagues arrive with a season in a spreadsheet. Retyping ninety rows into a form to get them
 * into the platform is the reason a league does not adopt it, so the import accepts what they
 * have: club names as written, a date, a time, a venue.
 *
 * Clubs are matched by name rather than by id, because nobody has the ids. Matching is
 * case- and punctuation-insensitive so "Kampala Utd." finds "Kampala United", and an
 * ambiguous or unknown name is a rejected line naming what it could not find — never a guess.
 * A fixture attached to the wrong club is worse than a fixture that failed to import.
 */
export function parseFixtureImport({
  rows,
  teams,
  seasonStart,
  seasonEnd,
}: {
  rows: ReadonlyArray<Record<string, string | undefined>>;
  teams: ReadonlyArray<{ id: string; name: string; location?: string }>;
  seasonStart?: string;
  seasonEnd?: string;
}): FixtureImportResult {
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(fc|sc|utd|united)\b/g, (match) =>
      match === 'utd' ? 'united' : match).trim();

  const byName = new Map<string, string[]>();
  for (const team of teams) {
    const key = normalize(team.name);
    byName.set(key, [...(byName.get(key) ?? []), team.id]);
  }
  const venueById = new Map(teams.map((team) => [team.id, team.location]));

  const accepted: ImportedFixtureRow[] = [];
  const errors: string[] = [];

  rows.forEach((raw, index) => {
    const line = index + 1;
    const home = (raw.home ?? raw.homeTeam ?? raw.home_team ?? '').trim();
    const away = (raw.away ?? raw.awayTeam ?? raw.away_team ?? '').trim();
    const date = (raw.date ?? raw.kickoff ?? raw.scheduledAt ?? '').trim();
    const time = (raw.time ?? '').trim();
    const venue = (raw.venue ?? '').trim();

    if (!home || !away) {
      errors.push(`Line ${line}: both clubs are required.`);
      return;
    }

    const resolve = (name: string, side: string): string | null => {
      const matches = byName.get(normalize(name)) ?? [];
      if (matches.length === 1) return matches[0];
      errors.push(matches.length === 0
        ? `Line ${line}: no club in this league matches "${name}" (${side}).`
        : `Line ${line}: "${name}" matches more than one club, so it is ambiguous.`);
      return null;
    };
    const homeTeamId = resolve(home, 'home');
    const awayTeamId = resolve(away, 'away');
    if (!homeTeamId || !awayTeamId) return;

    if (homeTeamId === awayTeamId) {
      errors.push(`Line ${line}: a club cannot play itself.`);
      return;
    }

    // A bare date is accepted; a time column refines it. Anything unparseable is rejected
    // rather than defaulted to now, which would silently schedule a fixture today.
    const stamp = time ? `${date}T${time}` : date;
    const parsed = Date.parse(stamp);
    if (!Number.isFinite(parsed)) {
      errors.push(`Line ${line}: "${stamp}" is not a date and time this can read.`);
      return;
    }
    const scheduledAt = new Date(parsed).toISOString();

    if (seasonStart && parsed < Date.parse(seasonStart)) {
      errors.push(`Line ${line}: kickoff is before the season starts.`);
      return;
    }
    if (seasonEnd && parsed > Date.parse(seasonEnd)) {
      errors.push(`Line ${line}: kickoff is after the season ends.`);
      return;
    }

    accepted.push({
      line,
      homeTeamId,
      awayTeamId,
      scheduledAt,
      venue: venue || venueById.get(homeTeamId) || '',
    });
  });

  /*
   * Duplicates inside the file itself, which a per-row check cannot see. A spreadsheet that
   * lists the same fixture twice is common and would otherwise create it twice.
   */
  const seen = new Map<string, number>();
  const deduped: ImportedFixtureRow[] = [];
  for (const row of accepted) {
    const key = `${row.homeTeamId}|${row.awayTeamId}|${row.scheduledAt.slice(0, 10)}`;
    const first = seen.get(key);
    if (first !== undefined) {
      errors.push(`Line ${row.line}: duplicates the fixture already on line ${first}.`);
      continue;
    }
    seen.set(key, row.line);
    deduped.push(row);
  }

  return { rows: deduped, errors };
}
