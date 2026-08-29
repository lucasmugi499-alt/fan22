import { buildLeagueStandings, type BuildStandingsOptions, type LeagueStanding } from '@/lib/leagueModel';
import type { Match, StoredStanding, Team } from '@/types';

/**
 * One answer to "what is this league's table", for every surface that shows one.
 *
 * ## Why a resolver rather than each page deciding
 *
 * Because each page deciding is what produced the defect. The public league page computed its
 * table from a client match list of 120, the server had sent 240, discovery built per-league
 * tables from a global 700-match slice, and the operator console computed from whatever it
 * happened to have loaded. Four surfaces, four different subsets of the same season, all
 * rendered with equal confidence and no way for a reader to tell them apart.
 *
 * Now there is a stored projection (`server/standings/projection.ts`) and this is the single
 * place that decides whether to use it. A caller passes what it has; it gets back rows plus an
 * honest statement of where they came from.
 *
 * ## The fallback is deliberate, and it is loud
 *
 * The projection is written when a result is finalized, so a season whose results predate the
 * projection — or whose recomputation failed — has no rows yet. Rendering an empty table there
 * would be a worse lie than the old one.
 *
 * So the fallback computes locally, exactly as before, and says so: `source: 'computed'`. And
 * when that local computation ran on a match list that hit its load limit, `provisional` is
 * true and the surface must say the table may be incomplete. That is the piece that was
 * missing — the old path had no way to distinguish "this is the whole season" from "this is
 * the first 120 documents Firestore handed me", so it presented both as fact.
 */
export type StandingsSource =
  /** From the stored server projection. Complete by construction. */
  | 'projection'
  /** Computed in the browser from the matches to hand. Complete only if they all are. */
  | 'computed';

export type ResolvedStandings = {
  rows: LeagueStanding[];
  source: StandingsSource;
  /**
   * True when these rows may be missing results.
   *
   * Only ever true for a local computation whose match list hit its limit. A surface showing
   * provisional rows must say so — a table that is quietly wrong is the failure this whole
   * change exists to remove.
   */
  provisional: boolean;
  /** Official results the rows were built from, where that is knowable. */
  officialMatches?: number;
};

export type ResolveStandingsInput = {
  /** Stored rows for this league, any season. Filtered to `seasonId` here. */
  stored?: StoredStanding[];
  seasonId?: string;
  teams: Team[];
  matches: Match[];
  scoring?: BuildStandingsOptions['scoring'];
  adjustments?: BuildStandingsOptions['adjustments'];
  /**
   * The cap the caller's match list was loaded under, when it had one.
   *
   * Supplying it is what lets this tell a complete season from a truncated page. A caller that
   * genuinely holds every match should pass nothing.
   */
  matchLoadLimit?: number;
};

function fromStored(rows: StoredStanding[]): LeagueStanding[] {
  return [...rows]
    .sort((a, b) => a.rank - b.rank)
    .map((row) => ({
      teamId: row.teamId,
      teamName: row.teamName,
      played: row.played,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
      pointsFor: row.pointsFor,
      pointsAgainst: row.pointsAgainst,
      difference: row.difference,
      points: row.points,
      adjustment: row.adjustment ?? 0,
      awarded: row.awarded ?? 0,
    }));
}

export function resolveLeagueStandings(input: ResolveStandingsInput): ResolvedStandings {
  const stored = (input.stored ?? []).filter((row) => (
    !input.seasonId || row.seasonId === input.seasonId
  ));

  if (stored.length) {
    return { rows: fromStored(stored), source: 'projection', provisional: false };
  }

  const rows = buildLeagueStandings(input.teams, input.matches, {
    seasonId: input.seasonId,
    scoring: input.scoring,
    adjustments: input.adjustments,
  });

  return {
    rows,
    source: 'computed',
    // `>=`, not `>`. A list exactly at its limit is the ambiguous case — Firestore returned as
    // many as it was asked for, and there is no way to know whether more existed. Treating
    // that as complete is precisely the assumption that made the old table silently wrong.
    provisional: input.matchLoadLimit !== undefined && input.matches.length >= input.matchLoadLimit,
    officialMatches: rows.reduce((total, row) => total + row.played, 0) / 2,
  };
}
