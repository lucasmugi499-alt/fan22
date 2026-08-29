// Relative, not `@/`. This module is compiled into the Cloud Functions bundle through the
// standings projection, where a path alias survives into the emitted CommonJS and fails at
// require time — tsc resolves the alias, it does not rewrite it. `functions/scripts/verify-bundle.mjs`
// fails the build if one reappears.
import type { GoalPlaceIndexSignals, League, LeagueStatus, Match, PointsAdjustment, SeasonScoringRules, Team } from '../types';
import { isOfficialMatch } from './status';
import { defaultScoringFor } from './season';

export const leagueRankingDisclaimer =
  'GoalPlace Index helps leagues prove operational quality to sponsors, athletes, and fans. It does not affect sporting standings.';

export const leagueStatuses: LeagueStatus[] = [
  'draft',
  'community',
  'verified',
  'partner',
  'suspended',
];

export const leagueStatusMeta: Record<
  LeagueStatus,
  {
    label: string;
    shortLabel: string;
    description: string;
    capabilities: string[];
    badgeClass: string;
    panelClass: string;
  }
> = {
  draft: {
    label: 'Draft League',
    shortLabel: 'Draft',
    description: 'Created but not public.',
    capabilities: ['Private setup workspace', 'Basic league profile', 'Internal roster drafting'],
    badgeClass: 'border-slate-300/25 bg-slate-300/10 text-slate-200',
    panelClass: 'border-slate-300/15 bg-slate-300/7',
  },
  community: {
    label: 'Community League',
    shortLabel: 'Community',
    description:
      'Public league page with teams, fixtures, athletes, and posts. Support and payout tools are limited.',
    capabilities: ['Public league page', 'Teams and fixtures', 'Athlete and post publishing'],
    badgeClass: 'border-[var(--goal-mint)]/30 bg-[var(--goal-emerald)]/12 text-[var(--goal-mint)]',
    panelClass: 'border-[var(--goal-emerald)]/20 bg-[var(--goal-emerald)]/8',
  },
  verified: {
    label: 'Verified League',
    shortLabel: 'Verified',
    description:
      'Confirmed by GoalPlace256 with verified performance challenges, athlete payouts, official standings, and annual awards eligibility.',
    capabilities: ['Verified performance challenges', 'Athlete payout review', 'Official standings and awards eligibility'],
    badgeClass: 'border-blue-300/30 bg-blue-500/12 text-blue-200',
    panelClass: 'border-blue-300/20 bg-blue-500/8',
  },
  partner: {
    label: 'Partner League',
    shortLabel: 'Partner',
    description:
      'Verified league with advanced tools, sponsor reporting, analytics, and priority support.',
    capabilities: ['Sponsor reporting', 'Advanced analytics', 'Priority support'],
    badgeClass: 'border-[var(--goal-gold)]/35 bg-[var(--goal-gold)]/14 text-[var(--goal-gold)]',
    panelClass: 'border-[var(--goal-gold)]/24 bg-[var(--goal-gold)]/9',
  },
  platform_managed: {
    label: 'Platform managed',
    shortLabel: 'Platform',
    description: 'GoalPlace is running this league directly while it has no accountable League Admin.',
    capabilities: ['Platform operations', 'Ownership recovery', 'Admin reinstatement'],
    badgeClass: 'border-amber-300/30 bg-amber-500/12 text-amber-200',
    panelClass: 'border-amber-300/20 bg-amber-500/8',
  },
  suspended: {
    label: 'Suspended',
    shortLabel: 'Suspended',
    description: 'League restricted due to fraud, disputes, or verification issues.',
    capabilities: ['Public restrictions', 'Verification review', 'Dispute resolution required'],
    badgeClass: 'border-red-300/30 bg-red-500/12 text-red-200',
    panelClass: 'border-red-300/20 bg-red-500/8',
  },
};

export type GoalPlaceIndexSignal = {
  label: string;
  value: number;
  detail: string;
};

export function getLeagueStatusMeta(status: LeagueStatus) {
  return leagueStatusMeta[status];
}

/**
 * The breakdown behind a league's index, read from what was actually computed.
 *
 * This used to invent its inputs. When `league.indexSignals` was absent it fabricated a full
 * set of plausible-looking sub-scores — `athleteProfileCompletion: 80` if the league had any
 * athletes at all, `adminReliability: 88` if it was verified and 58 if not, `mediaUploads: 70`
 * unconditionally — and then rendered them as though they were measurements. A fabricated
 * breakdown is worse than a fabricated total, because it looks like evidence for the total.
 *
 * Now there is no fallback. A league whose index has not been computed returns no signals, and
 * the interface says so. `server/leagueIndex/projection.ts` writes both the score and the
 * counts behind it in the hourly pass.
 */
export function getGoalPlaceIndexSignals(league: League): GoalPlaceIndexSignal[] {
  const signals = league.indexSignals;
  if (!signals) return [];

  const evidence = league.indexEvidence ?? {};
  const describe = (key: keyof GoalPlaceIndexSignals) => {
    const counts = evidence[key];
    return counts && counts.denominator > 0
      ? `${counts.numerator} of ${counts.denominator}`
      : undefined;
  };

  return [
    {
      label: 'Results verified',
      value: signals.verification,
      detail: describe('verification')
        ?? 'Played fixtures that reached an official, verified result.',
    },
    {
      label: 'Fixtures completed',
      value: signals.completion,
      detail: describe('completion')
        ?? 'Fixtures whose date has passed and which have a recorded result.',
    },
    {
      label: 'Athletes registered',
      value: signals.athleteRegistration,
      detail: describe('athleteRegistration')
        ?? 'Athletes with a registered position and a club.',
    },
    {
      label: 'Rosters confirmed',
      value: signals.rosterConfirmation,
      detail: describe('rosterConfirmation')
        ?? 'Clubs with a confirmed roster for the current season.',
    },
  ];
}

export type LeagueStanding = {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  difference: number;
  /** Match points plus `adjustment`. This is the number the table ranks on. */
  points: number;
  /**
   * The signed total of every points adjustment applied to this team this season, and 0 when
   * there are none.
   *
   * Reported separately from `points` rather than folded silently into it, because a table
   * that shows a deduction without saying so is a table the league will not trust. The row
   * carries what to footnote; the caller decides how to render it.
   */
  adjustment: number;
  /**
   * How many of `played` were decided by a league ruling rather than on the field.
   *
   * A walkover counts in the table at full weight — it is an official result — but a club
   * looking at "played 9" is entitled to know one of them was awarded.
   */
  awarded: number;
};

export type BuildStandingsOptions = {
  /**
   * Restricts the table to one season. Standings are meaningless across seasons, so pass
   * this wherever a season is known; omitting it keeps the pre-season-migration behaviour
   * of counting every match supplied.
   */
  seasonId?: string;
  /**
   * Points per result. Defaults to the sport's convention when omitted. Prefer passing the
   * season's own `scoring` so a league can depart from the default without a code change.
   */
  scoring?: SeasonScoringRules;
  /**
   * Season-scoped points adjustments — discipline deductions and the like.
   *
   * Applied as a FINAL term, after every match has been counted, and never by mutating a
   * running total mid-loop. That ordering is what keeps the computation deterministic: the
   * same inputs in any order produce byte-identical output, which is the property the stored
   * projection depends on to be safely recomputable at any time.
   *
   * Rescinded adjustments are filtered here rather than by the caller, so no caller can
   * forget. Adjustments for other seasons or teams are ignored for the same reason.
   */
  adjustments?: PointsAdjustment[];
};

export function buildLeagueStandings(
  teams: Team[],
  matches: Match[],
  options: BuildStandingsOptions = {}
): LeagueStanding[] {
  const standings = new Map<string, LeagueStanding>();

  teams.forEach((team) => {
    standings.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      difference: 0,
      points: 0,
      adjustment: 0,
      awarded: 0,
    });
  });

  matches
    // Only official results move a table. This previously admitted any completed match,
    // so pending and disputed results were silently counted — the platform's central
    // trust claim was not true of its own standings. `isOfficialMatch` is the one
    // definition; do not inline this condition anywhere else.
    .filter(
      (match) =>
        (!options.seasonId || match.seasonId === options.seasonId) &&
        isOfficialMatch(match) &&
        typeof match.teamAScore === 'number' &&
        typeof match.teamBScore === 'number'
    )
    .forEach((match) => {
      const teamAId = match.teamAId ?? match.homeTeamId;
      const teamBId = match.teamBId ?? match.awayTeamId;
      const teamAScore = match.teamAScore ?? match.score.home;
      const teamBScore = match.teamBScore ?? match.score.away;
      const teamA = standings.get(teamAId);
      const teamB = standings.get(teamBId);

      if (!teamA || !teamB || typeof teamAScore !== 'number' || typeof teamBScore !== 'number') {
        return;
      }

      teamA.played += 1;
      teamB.played += 1;
      // An awarded result counts in the table exactly like a played one — it IS the official
      // result — and is merely labelled, so a club reading "played 9" can see that one of
      // them was a walkover. Weighting it differently would be inventing a rule no league asked
      // for.
      if (match.awardedResult) {
        teamA.awarded += 1;
        teamB.awarded += 1;
      }
      teamA.pointsFor += teamAScore;
      teamA.pointsAgainst += teamBScore;
      teamB.pointsFor += teamBScore;
      teamB.pointsAgainst += teamAScore;

      // Scoring comes from the season (or the sport default). This previously hardcoded
      // "football scores 3, everything else scores 1", which gave rugby wins 1 point
      // instead of 4 and rugby draws nothing instead of 2.
      const scoring = options.scoring ?? defaultScoringFor(match.sport);

      if (teamAScore > teamBScore) {
        teamA.wins += 1;
        teamB.losses += 1;
        teamA.points += scoring.win;
        teamB.points += scoring.loss;
      } else if (teamAScore < teamBScore) {
        teamB.wins += 1;
        teamA.losses += 1;
        teamB.points += scoring.win;
        teamA.points += scoring.loss;
      } else {
        teamA.draws += 1;
        teamB.draws += 1;
        // `draw: null` means the sport cannot draw, so a drawn scoreline is a data error.
        // Award nothing rather than inventing a value, and leave the drawn count visible
        // so the anomaly is reportable instead of silent.
        if (scoring.draw !== null) {
          teamA.points += scoring.draw;
          teamB.points += scoring.draw;
        }
      }
    });

  // Adjustments last, after every match is counted.
  //
  // Deliberately a separate pass rather than a term inside the match loop: the loop's
  // per-match arithmetic must stay a pure function of the matches, so the projection can be
  // recomputed from scratch at any time and produce identical output. Folding a season-level
  // penalty into a per-match total would make the result depend on iteration order.
  (options.adjustments ?? [])
    .filter((adjustment) => (
      !adjustment.rescindedAt
      && (!options.seasonId || adjustment.seasonId === options.seasonId)
      && Number.isFinite(adjustment.delta)
    ))
    .forEach((adjustment) => {
      const standing = standings.get(adjustment.teamId);
      // An adjustment for a team not in this table is silently ignored, not an error: a team
      // can be withdrawn from a league after being docked, and a stale record must not be
      // able to break the whole table.
      if (!standing) return;
      standing.adjustment += adjustment.delta;
      standing.points += adjustment.delta;
    });

  return [...standings.values()]
    .map((standing) => ({
      ...standing,
      difference: standing.pointsFor - standing.pointsAgainst,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.difference !== a.difference) return b.difference - a.difference;
      if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
      return a.teamName.localeCompare(b.teamName);
    });
}
