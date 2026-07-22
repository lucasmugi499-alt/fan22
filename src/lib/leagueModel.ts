import { League, LeagueStatus, Match, SeasonScoringRules, Team } from '@/types';
import { isOfficialMatch } from '@/lib/status';
import { defaultScoringFor } from '@/lib/season';

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

export function getGoalPlaceIndexSignals(league: League): GoalPlaceIndexSignal[] {
  const signals = league.indexSignals ?? {
    verification: league.verifiedResultsRate ?? 0,
    matchCompletionRate: league.matchCompletionRate ?? 0,
    athleteProfileCompletion: league.athletesCount ? 80 : 0,
    fanEngagement: Math.min(100, Math.round((league.supportersCount ?? 0) / 8)),
    supportActivity: Math.min(100, Math.round((league.totalSupport ?? 0) / 50000)),
    adminReliability: league.verified ? 88 : 58,
    mediaUploads: 70,
  };

  return [
    {
      label: 'Verification',
      value: signals.verification,
      detail: 'Identity, admin, athlete, and result checks.',
    },
    {
      label: 'Match completion',
      value: signals.matchCompletionRate,
      detail: 'Published fixtures with completed results.',
    },
    {
      label: 'Athlete profiles',
      value: signals.athleteProfileCompletion,
      detail: 'Complete athlete records, positions, teams, and bios.',
    },
    {
      label: 'Fan engagement',
      value: signals.fanEngagement,
      detail: 'Follows, reactions, comments, and repeat participation.',
    },
    {
      label: 'Support activity',
      value: signals.supportActivity,
      detail: 'Transparent support flowing to athletes and teams.',
    },
    {
      label: 'Admin reliability',
      value: signals.adminReliability,
      detail: 'Timely approvals, result reviews, and moderation quality.',
    },
    {
      label: 'Media uploads',
      value: signals.mediaUploads,
      detail: 'Matchday photos, highlights, and verified league posts.',
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
  points: number;
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
