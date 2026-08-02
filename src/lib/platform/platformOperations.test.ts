import { describe, expect, it } from 'vitest';
import type { Athlete, League, Match, Season, Team, TeamAssignment } from '@/types';
import { buildPlatformOrganizationTree, teamOperationalState } from './platformOperations';

const league = {
  id: 'league_1',
  name: 'Kampala League',
  sport: 'football',
  city: 'Kampala',
  country: 'Uganda',
  description: 'Demo league',
  status: 'verified',
  plan: 'free',
  verified: true,
  adminUserIds: [],
  season: '2026',
  teamsCount: 1,
  athletesCount: 0,
  matchesCount: 0,
  matchCompletionRate: 0,
  verifiedResultsRate: 0,
  goalPlaceIndex: 0,
  totalSupport: 0,
  supportersCount: 0,
  verificationRules: {
    requiresLeagueAdminApproval: true,
    requiresRefereeConfirmation: false,
    allowsPerformancePledges: false,
  },
  createdAt: '2026-01-01T00:00:00.000Z',
} satisfies League;

const team = {
  id: 'team_1',
  name: 'Kampala Testers',
  sport: 'football',
  leagueId: 'league_1',
  city: 'Kampala',
  country: 'Uganda',
  description: 'Demo team',
  plan: 'free',
  verified: false,
  adminUserIds: [],
  totalSupport: 0,
  supportersCount: 0,
  wins: 0,
  losses: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  leaguePoints: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
} satisfies Team;

describe('platform operations tree', () => {
  it('rolls league, team, athlete, result, and invitation counts into one tree', () => {
    const tree = buildPlatformOrganizationTree({
      leagues: [league],
      seasons: [{ id: 'season_1', leagueId: 'league_1', name: '2026', sport: 'football', status: 'active', startDate: '2026-01-01', competitionFormat: 'league', scoring: { win: 3, draw: 1, loss: 0 }, createdAt: '2026-01-01T00:00:00.000Z' } satisfies Season],
      teams: [team],
      athletes: [{ id: 'athlete_1', teamId: 'team_1', leagueId: 'league_1' } as Athlete],
      matches: [
        { id: 'match_1', leagueId: 'league_1', homeTeamId: 'team_1', awayTeamId: 'team_2', status: 'completed', verificationStatus: 'verified' } as Match,
        { id: 'match_2', leagueId: 'league_1', homeTeamId: 'team_3', awayTeamId: 'team_1', status: 'completed', verificationStatus: 'disputed' } as Match,
      ],
      teamAssignments: [
        { id: 'assignment_1', teamId: 'team_1', leagueId: 'league_1', status: 'active' } as TeamAssignment,
        { id: 'assignment_2', teamId: 'team_1', leagueId: 'league_1', status: 'invited' } as TeamAssignment,
      ],
    });

    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      seasonsCount: 1,
      athletesCount: 1,
      matchesCount: 2,
      officialResults: 1,
      disputedResults: 1,
      pendingInvites: 1,
    });
    expect(tree[0].teams[0]).toMatchObject({
      athletesCount: 1,
      matchesCount: 2,
      officialResults: 1,
      disputedResults: 1,
      activeAdmins: 1,
      pendingInvites: 1,
    });
  });

  it('uses explicit team verification state before the legacy verified flag', () => {
    expect(teamOperationalState({ ...team, verified: true })).toBe('verified');
    expect(teamOperationalState({ ...team, verified: true, verificationStatus: 'rejected' })).toBe('rejected');
  });
});
