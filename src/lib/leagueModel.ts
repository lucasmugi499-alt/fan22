import { League, LeagueStatus, Match, Team } from './types';

export const leagueRankingDisclaimer =
  'League standings are based only on match results. Paid tools never affect sporting rankings.';

export const leagueStatuses: LeagueStatus[] = [
  'Draft League',
  'Community League',
  'Verified League',
  'Partner League',
  'Suspended',
];

export const leagueStatusMeta: Record<
  LeagueStatus,
  {
    label: LeagueStatus;
    shortLabel: string;
    description: string;
    capabilities: string[];
    badgeClass: string;
    panelClass: string;
  }
> = {
  'Draft League': {
    label: 'Draft League',
    shortLabel: 'Draft',
    description: 'Created but not public.',
    capabilities: ['Private setup workspace', 'Basic league profile', 'Internal roster drafting'],
    badgeClass: 'border-slate-300/25 bg-slate-300/10 text-slate-200',
    panelClass: 'border-slate-300/15 bg-slate-300/7',
  },
  'Community League': {
    label: 'Community League',
    shortLabel: 'Community',
    description:
      'Public league page with teams, fixtures, athletes, and posts. Support and payout tools are limited.',
    capabilities: ['Public league page', 'Teams and fixtures', 'Athlete and post publishing'],
    badgeClass: 'border-[var(--goal-mint)]/30 bg-[var(--goal-emerald)]/12 text-[var(--goal-mint)]',
    panelClass: 'border-[var(--goal-emerald)]/20 bg-[var(--goal-emerald)]/8',
  },
  'Verified League': {
    label: 'Verified League',
    shortLabel: 'Verified',
    description:
      'Confirmed by GoalPlace256 with verified performance challenges, athlete payouts, official standings, and annual awards eligibility.',
    capabilities: ['Verified performance challenges', 'Athlete payout review', 'Official standings and awards eligibility'],
    badgeClass: 'border-blue-300/30 bg-blue-500/12 text-blue-200',
    panelClass: 'border-blue-300/20 bg-blue-500/8',
  },
  'Partner League': {
    label: 'Partner League',
    shortLabel: 'Partner',
    description:
      'Verified league with advanced tools, sponsor reporting, analytics, and priority support.',
    capabilities: ['Sponsor reporting', 'Advanced analytics', 'Priority support'],
    badgeClass: 'border-[var(--goal-gold)]/35 bg-[var(--goal-gold)]/14 text-[var(--goal-gold)]',
    panelClass: 'border-[var(--goal-gold)]/24 bg-[var(--goal-gold)]/9',
  },
  Suspended: {
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
  return [
    {
      label: 'Verification',
      value: league.indexSignals.verification,
      detail: 'Identity, admin, athlete, and result checks.',
    },
    {
      label: 'Match completion',
      value: league.indexSignals.matchCompletionRate,
      detail: 'Published fixtures with completed results.',
    },
    {
      label: 'Athlete profiles',
      value: league.indexSignals.athleteProfileCompletion,
      detail: 'Complete athlete records, positions, teams, and bios.',
    },
    {
      label: 'Fan engagement',
      value: league.indexSignals.fanEngagement,
      detail: 'Follows, reactions, comments, and repeat participation.',
    },
    {
      label: 'Support activity',
      value: league.indexSignals.supportActivity,
      detail: 'Transparent support flowing to athletes and teams.',
    },
    {
      label: 'Admin reliability',
      value: league.indexSignals.adminReliability,
      detail: 'Timely approvals, result reviews, and moderation quality.',
    },
    {
      label: 'Media uploads',
      value: league.indexSignals.mediaUploads,
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

export function buildLeagueStandings(teams: Team[], matches: Match[]): LeagueStanding[] {
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
    .filter(
      (match) =>
        match.status === 'Completed' &&
        typeof match.teamAScore === 'number' &&
        typeof match.teamBScore === 'number'
    )
    .forEach((match) => {
      const teamA = standings.get(match.teamAId);
      const teamB = standings.get(match.teamBId);

      if (!teamA || !teamB || match.teamAScore === undefined || match.teamBScore === undefined) {
        return;
      }

      teamA.played += 1;
      teamB.played += 1;
      teamA.pointsFor += match.teamAScore;
      teamA.pointsAgainst += match.teamBScore;
      teamB.pointsFor += match.teamBScore;
      teamB.pointsAgainst += match.teamAScore;

      if (match.teamAScore > match.teamBScore) {
        teamA.wins += 1;
        teamB.losses += 1;
        teamA.points += 3;
      } else if (match.teamAScore < match.teamBScore) {
        teamB.wins += 1;
        teamA.losses += 1;
        teamB.points += 3;
      } else {
        teamA.draws += 1;
        teamB.draws += 1;
        teamA.points += 1;
        teamB.points += 1;
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
