import { describe, expect, it } from 'vitest';
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

    await mockProvider.reviewApproval({
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
      adminUserIds: ['mock_fan'],
    });
    expect(application).toMatchObject({
      status: 'approved',
      leagueId: `league_${applicationId}`,
      reviewedByUserId: 'mock_admin',
    });
  });
});
