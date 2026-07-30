import { describe, expect, it } from 'vitest';
import { MOCK_PROFILES } from '@/lib/auth/mockAuth';
import { mockProvider } from './mockProvider';

describe('mock provider league applications', () => {
  it('creates a draft demo league when a League Admin application is approved', async () => {
    const applicationId = `application_test_${Date.now()}`;
    await mockProvider.createLeagueAdminApplication({
      id: applicationId,
      userId: 'mock_fan',
      leagueName: 'Ntungamo Dummy League',
      sport: 'football',
      city: 'Ntungamo',
      evidenceNote: 'Demo application for testing league creation.',
    });

    const approval = await mockProvider.reviewApproval({
      targetCollection: 'leagueAdminApplications',
      targetId: applicationId,
      actorUserId: 'mock_admin',
      decision: 'approved',
    });

    const leagues = await mockProvider.getLeagues();
    const league = leagues.find((item) => item.id === `league_${applicationId}`);
    const applications = await mockProvider.getLeagueAdminApplications();
    const application = applications.find((item) => item.id === applicationId);

    expect(league).toMatchObject({
      name: 'Ntungamo Dummy League',
      city: 'Ntungamo',
      sport: 'football',
      status: 'draft',
      verified: false,
    });
    expect(league?.adminUserIds).not.toContain('mock_fan');
    expect(league?.adminUserIds).toContain(MOCK_PROFILES.league_admin.uid);
    expect(application).toMatchObject({
      status: 'approved',
      leagueId: `league_${applicationId}`,
      invitationId: `invite_${applicationId}_league_owner`,
      invitationActionUrl: `/invitations/access/invite_${applicationId}_league_owner?token=demo`,
      reviewedByUserId: 'mock_admin',
    });
    expect(approval.actionUrl).toBe(`/invitations/access/invite_${applicationId}_league_owner?token=demo`);

    await mockProvider.acceptInvitation(`invite_${applicationId}_league_owner`, 'mock_fan', 'demo');
    const acceptedLeagues = await mockProvider.getLeagues();
    expect(acceptedLeagues.find((item) => item.id === `league_${applicationId}`)?.adminUserIds).toContain('mock_fan');
  });

  it('keeps demo league setup records addressable by league scope', async () => {
    const applicationId = `application_setup_${Date.now()}`;
    await mockProvider.createLeagueAdminApplication({
      id: applicationId,
      userId: 'mock_fan',
      leagueName: 'Kabale Setup League',
      sport: 'football',
      city: 'Kabale',
      evidenceNote: 'Demo setup application for teams and invitations.',
    });
    await mockProvider.reviewApproval({
      targetCollection: 'leagueAdminApplications',
      targetId: applicationId,
      actorUserId: 'mock_admin',
      decision: 'approved',
    });
    const leagueId = `league_${applicationId}`;
    const season = await mockProvider.createSeason({
      id: `season_${applicationId}`,
      leagueId,
      name: '2027 Regular Season',
      sport: 'football',
      status: 'registration',
      startDate: '2027-01-16T00:00:00.000Z',
      competitionFormat: 'league',
      scoring: { win: 3, draw: 1, loss: 0 },
    });
    await mockProvider.createTeams([{
      id: `team_${applicationId}`,
      name: 'Kabale Testers',
      sport: 'football',
      leagueId,
      city: 'Kabale',
      country: 'Uganda',
      description: 'Demo team for setup testing.',
      plan: 'free',
      verified: false,
      adminUserIds: [],
      totalSupport: 0,
      supportersCount: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      leaguePoints: 0,
      createdAt: '2027-01-01T00:00:00.000Z',
    }]);
    const invitation = await mockProvider.createTeamAdminInvitation({
      id: `invite_${applicationId}`,
      userId: '',
      teamId: `team_${applicationId}`,
      leagueId,
      seasonId: season.id!,
      role: 'team_admin',
      status: 'invited',
      invitedByUserId: MOCK_PROFILES.league_admin.uid,
      invitedEmail: 'teamadmin@example.com',
      createdAt: '2027-01-02T00:00:00.000Z',
    });

    expect(await mockProvider.getSeasons()).toContainEqual(expect.objectContaining({ id: season.id, leagueId }));
    expect(await mockProvider.getTeams({ leagueId })).toContainEqual(expect.objectContaining({ name: 'Kabale Testers' }));
    expect(await mockProvider.getTeamAssignmentById(`invite_${applicationId}`)).toMatchObject({
      leagueId,
      invitedEmail: 'teamadmin@example.com',
    });
    expect(invitation.actionUrl).toContain(`/invitations/team/invite_${applicationId}`);
  });
});
