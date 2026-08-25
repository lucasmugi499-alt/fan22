import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOCK_PROFILES } from '@/lib/auth/mockAuth';
import { investorDemoRuntime } from '../investorDemo';
import { mockProvider } from './mockProvider';

function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    },
  });
  return store;
}

describe('mock provider league applications', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('projects seeded demo access assignments from league, team, athlete, and platform relationships', async () => {
    await expect(mockProvider.getAccessIndexByUser('user_platform_001')).resolves.toContainEqual(expect.objectContaining({
      scopeType: 'platform',
      scopeId: 'global',
      activeRoles: ['platform_admin'],
      capabilities: expect.arrayContaining(['platform.application.review']),
    }));
    await expect(mockProvider.getAccessIndexByUser('user_league_admin_001')).resolves.toContainEqual(expect.objectContaining({
      scopeType: 'league',
      scopeId: 'league_football_kampala',
      activeRoles: ['league_admin'],
      capabilities: expect.arrayContaining(['league.team.manage']),
    }));
    // The seeded Team Admin still projects and still grants, because the default migration
    // stage is `frozen`: issuance has stopped, authority has not been retired, and a live V1
    // workflow can still be finished by the people who started it.
    await expect(mockProvider.getAccessIndexByUser('user_team_admin_01_01')).resolves.toContainEqual(expect.objectContaining({
      scopeType: 'team',
      scopeId: 'team_football_01_01',
      activeRoles: ['team_admin'],
      capabilities: expect.arrayContaining(['team.athlete.create']),
    }));
    await expect(mockProvider.getAccessIndexByUser('user_ath_football_01_01_01')).resolves.toContainEqual(expect.objectContaining({
      scopeType: 'athlete',
      scopeId: 'ath_football_01_01_01',
      activeRoles: ['athlete_self'],
      // Athletes are managed profiles: the claim carries payee and proposal authority, and
      // deliberately no authority over the sporting record itself.
      capabilities: expect.arrayContaining(['athlete.payee.submit']),
    }));
  });

  it('creates a draft demo league when a League Admin application is approved', async () => {
    const applicationId = `application_test_${Date.now()}`;
    await mockProvider.createLeagueAdminApplication({
      id: applicationId,
      userId: 'mock_fan',
      applicantEmail: 'operator.ntungamo@example.com',
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
    const seasons = await mockProvider.getSeasons();
    const season = seasons.find((item) => item.id === `season_league_${applicationId}_${new Date().getUTCFullYear()}`);
    const applications = await mockProvider.getLeagueAdminApplications();
    const application = applications.find((item) => item.id === applicationId);

    expect(league).toMatchObject({
      name: 'Ntungamo Dummy League',
      city: 'Ntungamo',
      sport: 'football',
      status: 'draft',
      verified: false,
      currentSeasonId: season?.id,
    });
    expect(season).toMatchObject({
      leagueId: `league_${applicationId}`,
      sport: 'football',
      status: 'registration',
      competitionFormat: 'league',
      scoring: { win: 3, draw: 1, loss: 0 },
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
    expect(await mockProvider.getInvitationById(`invite_${applicationId}_league_owner`)).toMatchObject({
      invitedEmail: 'operator.ntungamo@example.com',
    });

    await expect(mockProvider.acceptInvitation(`invite_${applicationId}_league_owner`, 'mock_fan', 'demo'))
      .rejects.toThrow('Organization Operator account');

    await expect(mockProvider.acceptInvitation(`invite_${applicationId}_league_owner`, MOCK_PROFILES.athlete.uid, 'demo'))
      .rejects.toThrow('Organization Operator account');

    await mockProvider.acceptInvitation(`invite_${applicationId}_league_owner`, 'mock_league_operator_new', 'demo');
    const acceptedLeagues = await mockProvider.getLeagues();
    expect(acceptedLeagues.find((item) => item.id === `league_${applicationId}`)?.adminUserIds).toContain('mock_league_operator_new');
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
    expect(await mockProvider.getInvitationById(`invite_${applicationId}`)).toMatchObject({
      roleKey: 'team_admin',
      scopeType: 'team',
      scopeId: `team_${applicationId}`,
    });
    expect(invitation.actionUrl).toContain(`/invitations/access/invite_${applicationId}`);

    await expect(mockProvider.acceptInvitation(`invite_${applicationId}`, MOCK_PROFILES.fan.uid, 'demo'))
      .rejects.toThrow('Organization Operator account');

    await mockProvider.acceptInvitation(`invite_${applicationId}`, 'mock_team_admin_new', 'demo');
    expect((await mockProvider.getTeams({ leagueId })).find((team) => team.id === `team_${applicationId}`)?.adminUserIds).toContain('mock_team_admin_new');
  });

  it('projects athlete self access when a claim is league verified', async () => {
    const suffix = Date.now();
    const athlete = await mockProvider.createAthleteProfile({
      name: `Verified Runner ${suffix}`,
      position: 'Forward',
      ageGroup: 'U18',
      teamId: 'team_football_01_01',
      invitedEmail: MOCK_PROFILES.athlete.email,
    });
    const requesterUserId = MOCK_PROFILES.athlete.uid;
    const storedAthlete = await mockProvider.getAthleteById(athlete.id!);
    const claim = await mockProvider.requestAthleteClaim(athlete.id!, requesterUserId, storedAthlete?.invitationToken);

    await mockProvider.reviewAthleteClaim(claim.id, MOCK_PROFILES.league_admin.uid, 'league_verify');

    expect(investorDemoRuntime.accessAssignments).toContainEqual(expect.objectContaining({
      id: `assignment_athlete_${athlete.id!}_${requesterUserId}`,
      userId: requesterUserId,
      roleKey: 'athlete_self',
      scopeType: 'athlete',
      scopeId: athlete.id!,
      permissionBundleId: 'athlete_self',
      status: 'active',
      grantedByUserId: MOCK_PROFILES.league_admin.uid,
      applicationId: claim.id,
    }));
    expect(await mockProvider.getAthleteById(athlete.id!)).toMatchObject({ userId: requesterUserId });
  });

  it('creates and links athletes for demo teams restored from local storage', async () => {
    const stored = stubLocalStorage();
    const teamId = `team_stored_${Date.now()}`;
    stored.set('goalplace256.demo.teams', JSON.stringify([{
      id: teamId,
      name: 'Stored Browser Team',
      sport: 'football',
      leagueId: 'league_football_kampala',
      city: 'Kampala',
      country: 'Uganda',
      description: 'Created during an investor browser walkthrough.',
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
      createdAt: '2026-07-31T00:00:00.000Z',
    }]));

    const created = await mockProvider.createAthleteProfile({
      name: 'Stored Browser Athlete',
      position: 'Forward',
      ageGroup: 'Senior',
      teamId,
      invitedEmail: 'martha_nansubuga.01_01_01@demo.goalplace256.test',
    });
    const requesterUserId = 'user_ath_football_01_01_01';
    const athlete = await mockProvider.getAthleteById(created.id);
    const inviteToken = athlete?.invitationToken;

    await expect(mockProvider.requestAthleteClaim(created.id, requesterUserId, 'wrong-token'))
      .rejects.toThrow('invalid or expired');
    await expect(mockProvider.requestAthleteClaim(created.id, MOCK_PROFILES.fan.uid, inviteToken))
      .rejects.toThrow('Use the athlete account email');

    const claim = await mockProvider.requestAthleteClaim(created.id, requesterUserId, inviteToken);

    const requestedClaimIndex = investorDemoRuntime.athleteClaims.findIndex((item) => item.id === claim.id);
    expect(requestedClaimIndex).toBeGreaterThanOrEqual(0);
    investorDemoRuntime.athleteClaims.splice(requestedClaimIndex, 1);

    expect(await mockProvider.getAthleteClaims({ teamId })).toContainEqual(expect.objectContaining({
      id: claim.id,
      status: 'league_pending',
      teamReviewedByUserId: 'team_invitation',
    }));

    expect(await mockProvider.getAthleteClaims({ leagueId: 'league_football_kampala' })).toContainEqual(expect.objectContaining({
      id: claim.id,
      status: 'league_pending',
    }));

    await mockProvider.reviewAthleteClaim(claim.id, MOCK_PROFILES.league_admin.uid, 'league_verify');

    expect(await mockProvider.getAthleteById(created.id)).toMatchObject({
      legalName: 'Stored Browser Athlete',
      teamId,
      userId: requesterUserId,
    });
    expect(investorDemoRuntime.accessAssignments).toContainEqual(expect.objectContaining({
      id: `assignment_athlete_${created.id}_${requesterUserId}`,
      userId: requesterUserId,
      roleKey: 'athlete_self',
      scopeType: 'athlete',
      scopeId: created.id,
    }));
  });
});
