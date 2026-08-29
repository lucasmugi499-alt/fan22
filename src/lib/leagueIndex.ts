// Relative, not `@/`. This module is compiled into the Cloud Functions bundle through the
// hourly lifecycle pass, where a path alias survives into the emitted CommonJS and fails at
// require time. `functions/scripts/verify-bundle.mjs` fails the build if one reappears.
import type { Athlete, League, Match, Roster, Team } from '../types';
import { isOfficialMatch, isPlayedMatch } from './status';
import { athleteRegisteredPosition } from './athleteIdentity';

/**
 * The GoalPlace Index: what it is, and what it used to be.
 *
 * ## What it used to be
 *
 * A constant. `goalPlaceIndex` is displayed on every league card, sorts the discovery feed,
 * and is described in the product's own copy as the thing that "helps leagues prove
 * operational quality to sponsors, athletes, and fans". Nothing computed it. It was seeded per
 * league, and every league created through the platform command was assigned the literal
 * value 45 — forever, regardless of matches played, results verified or athletes registered.
 *
 * That is the difference between acceptable demo seed data and fake application behaviour,
 * and it fell on the wrong side: the APPLICATION minted the number, for real leagues.
 *
 * The dead `getGoalPlaceIndexSignals` fallbacks compounded it by hard-coding plausible-looking
 * sub-scores — `adminReliability: 88` for a verified league, `mediaUploads: 70` for everyone —
 * which would have made the number look defensible on a breakdown that was itself invented.
 *
 * ## What it is now
 *
 * Four signals, each a ratio of things that are actually counted, recomputed from the league's
 * own records. No signal is included unless the data can support it honestly: `mediaUploads`
 * and `adminReliability` are gone rather than estimated, because a fabricated sub-score is the
 * same defect at a smaller scale, and one hidden inside a breakdown is worse — it looks like
 * evidence.
 *
 * The number is stored WITH the signals that produced it, so the league page can show the
 * breakdown and the answer to "how is this calculated" is a screen rather than a shrug.
 *
 * ## Why these four
 *
 * They describe operational quality — whether a league is actually being run — rather than
 * how big or popular it is. A small, well-run league should out-rank a large, chaotic one,
 * because that is what the index claims to measure. Support totals and follower counts are
 * deliberately absent: they measure interest, and ranking discovery by them would make the
 * index a popularity score wearing an operations label.
 */

/** A signal, and the counts behind it, so a breakdown can show its working. */
export type IndexSignal = {
  key: IndexSignalKey;
  label: string;
  /** 0-100. */
  value: number;
  /** How much of the index this signal carries. */
  weight: number;
  detail: string;
  /** The raw counts, so the league page can show "38 of 40" rather than only "95". */
  numerator: number;
  denominator: number;
};

export type IndexSignalKey =
  | 'verification'
  | 'completion'
  | 'athleteRegistration'
  | 'rosterConfirmation';

export type LeagueIndexResult = {
  /** 0-100, rounded. This is `goalPlaceIndex`. */
  score: number;
  signals: IndexSignal[];
  /**
   * False when the league has too little activity for the score to mean anything.
   *
   * A league with two fixtures can trivially sit at 100, which would put a brand-new league
   * above an established one that has played a season and dropped a few results. Discovery
   * must not rank on that, and a league page must not present it as an assessment.
   */
  established: boolean;
  computedAt: string;
};

/**
 * Below this, the score is arithmetic rather than evidence.
 *
 * Five completed fixtures is roughly one round of a ten-team league — enough that the ratios
 * stop swinging wildly on a single result.
 */
export const MIN_MATCHES_FOR_INDEX = 5;

const WEIGHTS: Record<IndexSignalKey, number> = {
  // Verification is what the product sells, so it carries the most.
  verification: 0.4,
  completion: 0.25,
  athleteRegistration: 0.2,
  rosterConfirmation: 0.15,
};

function ratio(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.max(0, Math.min(1, numerator / denominator));
}

export type LeagueIndexInputs = {
  league: Pick<League, 'id'>;
  seasonId?: string;
  matches: Match[];
  teams: Team[];
  athletes: Athlete[];
  rosters: Roster[];
  now?: Date;
};

export function computeLeagueIndex(inputs: LeagueIndexInputs): LeagueIndexResult {
  const { league, seasonId, teams, athletes, rosters } = inputs;
  const now = inputs.now ?? new Date();

  const matches = inputs.matches.filter((match) => (
    match.leagueId === league.id && (!seasonId || match.seasonId === seasonId)
  ));
  const leagueTeams = teams.filter((team) => team.leagueId === league.id);
  const leagueAthletes = athletes.filter((athlete) => athlete.leagueId === league.id);

  const played = matches.filter(isPlayedMatch);
  const official = matches.filter(isOfficialMatch);

  /**
   * Fixtures whose scheduled time has passed. The completion denominator, because a fixture
   * next month is not an outstanding result — counting it would penalise a league for having
   * published its calendar early, which is the opposite of the behaviour this rewards.
   */
  const due = matches.filter((match) => new Date(match.scheduledAt).getTime() <= now.getTime());

  /**
   * An athlete counts as registered when the league has given them the two fields that make
   * them eligible: a registered position and a club. Not a bio or an avatar — those are the
   * athlete's own persona and are nothing to do with how well the league is run.
   */
  const registered = leagueAthletes.filter((athlete) => (
    // Through the accessor, not `athlete.position`. The deprecated pre-ADR-001 field is read
    // via `athleteRegisteredPosition`, which is what `data:guard` enforces — and the reason is
    // the same one that matters here: a preferred position is the athlete's own and says
    // nothing about whether the league registered them.
    Boolean(athleteRegisteredPosition(athlete)) && Boolean(athlete.teamId)
  ));

  const seasonRosters = rosters.filter((roster) => (
    (!seasonId || roster.seasonId === seasonId)
    && leagueTeams.some((team) => team.id === roster.teamId)
  ));
  const confirmedRosters = seasonRosters.filter((roster) => roster.status === 'confirmed');

  const signals: IndexSignal[] = [
    {
      key: 'verification',
      label: 'Results verified',
      value: Math.round(ratio(official.length, played.length) * 100),
      weight: WEIGHTS.verification,
      detail: 'Played fixtures that reached an official, verified result.',
      numerator: official.length,
      denominator: played.length,
    },
    {
      key: 'completion',
      label: 'Fixtures completed',
      value: Math.round(ratio(played.length, due.length) * 100),
      weight: WEIGHTS.completion,
      detail: 'Fixtures whose date has passed and which have a recorded result.',
      numerator: played.length,
      denominator: due.length,
    },
    {
      key: 'athleteRegistration',
      label: 'Athletes registered',
      value: Math.round(ratio(registered.length, leagueAthletes.length) * 100),
      weight: WEIGHTS.athleteRegistration,
      detail: 'Athletes with a registered position and a club.',
      numerator: registered.length,
      denominator: leagueAthletes.length,
    },
    {
      key: 'rosterConfirmation',
      label: 'Rosters confirmed',
      value: Math.round(ratio(confirmedRosters.length, leagueTeams.length) * 100),
      weight: WEIGHTS.rosterConfirmation,
      detail: 'Clubs with a confirmed roster for the current season.',
      numerator: confirmedRosters.length,
      denominator: leagueTeams.length,
    },
  ];

  const score = Math.round(
    signals.reduce((total, signal) => total + signal.value * signal.weight, 0),
  );

  return {
    score,
    signals,
    established: played.length >= MIN_MATCHES_FOR_INDEX,
    computedAt: now.toISOString(),
  };
}

/**
 * What a league with too little history should show, and be sorted by.
 *
 * `null`, not 0 and not 45. Zero would rank a brand-new league below a badly-run one, which
 * is a judgement the data does not support; 45 is the constant this replaced. Absent means
 * absent, and the interface says "Not yet rated" rather than printing a number.
 */
export function publishedIndexScore(result: LeagueIndexResult): number | null {
  return result.established ? result.score : null;
}

/**
 * How an unrated league sorts, and how it reads.
 *
 * Discovery sorts on the index, so `null` needs a defined position. It sorts LAST — below
 * every rated league, including badly-run ones — because an unrated league has not yet
 * demonstrated anything, and placing it above a league with a real score would be the same
 * unearned prominence the constant 45 used to give it.
 */
export function indexSortValue(score: number | null | undefined): number {
  return typeof score === 'number' ? score : -1;
}

/** What to print on a card. Never a number the data does not support. */
export function indexLabel(score: number | null | undefined): string {
  return typeof score === 'number' ? String(score) : 'Not yet rated';
}
