import { describe, expect, it } from 'vitest';
import { investorDemo } from './investorDemo';

describe('canonical investor demo package', () => {
  it('is explicitly synthetic and has the promised competition scale', () => {
    expect(investorDemo.metadata.synthetic).toBe(true);
    expect(investorDemo.sports).toHaveLength(3);
    expect(investorDemo.leagues).toHaveLength(6);
    expect(investorDemo.teams).toHaveLength(60);
    expect(investorDemo.athletes).toHaveLength(1000);
    expect(investorDemo.matches).toHaveLength(540);
  });

  it('resolves the operational relationships used by the application', () => {
    const leagueIds = new Set(investorDemo.leagues.map((item) => item.id));
    const seasonIds = new Set(investorDemo.seasons.map((item) => item.id));
    const teamIds = new Set(investorDemo.teams.map((item) => item.id));
    const athleteIds = new Set(investorDemo.athletes.map((item) => item.id));
    const matchIds = new Set(investorDemo.matches.map((item) => item.id));

    expect(investorDemo.teams.every((item) => leagueIds.has(item.leagueId))).toBe(true);
    expect(investorDemo.athletes.every((item) => teamIds.has(item.teamId))).toBe(true);
    expect(investorDemo.matches.every((item) =>
      leagueIds.has(item.leagueId) &&
      seasonIds.has(item.seasonId) &&
      teamIds.has(item.homeTeamId) &&
      teamIds.has(item.awayTeamId)
    )).toBe(true);
    expect(investorDemo.resultSubmissions.every((item) => matchIds.has(item.matchId))).toBe(true);
    expect(investorDemo.rosters.every((item) =>
      teamIds.has(item.teamId) && item.athleteIds.every((id) => athleteIds.has(id))
    )).toBe(true);
  });

  it('has one immutable event stream and finalization record per official workflow', () => {
    const submissionIds = new Set(investorDemo.resultSubmissions.map((item) => item.id));
    expect(investorDemo.resultSubmissionEvents.every((item) =>
      submissionIds.has(item.submissionId)
    )).toBe(true);
    expect(investorDemo.finalizations).toHaveLength(240);
    expect(investorDemo.finalizations.every((item) => item.status === 'applied')).toBe(true);
  });
});
