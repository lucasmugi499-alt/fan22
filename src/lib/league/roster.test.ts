import { describe, expect, it } from 'vitest';
import {
  ROSTER_FORBIDDEN_FIELDS,
  ROSTER_WRITABLE_FIELDS,
  decideRosterAction,
  patchIsRosterSafe,
  summariseRoster,
  type RosterSubject,
} from './roster';

const athlete: RosterSubject = {
  athleteId: 'athlete_1',
  legalName: 'Emmanuel Okello',
  teamId: 'team_home',
  leagueId: 'league_1',
  rosterStatus: 'active',
  squadNumber: 9,
};

describe('the line a roster operation must not cross', () => {
  it('never writes a performance or identity field', () => {
    const writable = new Set<string>(ROSTER_WRITABLE_FIELDS);
    for (const forbidden of ROSTER_FORBIDDEN_FIELDS) {
      expect(writable.has(forbidden)).toBe(false);
    }
  });

  it('produces only allowlisted fields for every action', () => {
    const cases = [
      decideRosterAction({ action: 'set_number', athlete, squadNumber: 10 }),
      decideRosterAction({ action: 'set_position', athlete, registeredPosition: 'Midfielder' }),
      decideRosterAction({ action: 'transfer', athlete, toTeamId: 'team_away', reason: 'Club transfer agreed' }),
      decideRosterAction({ action: 'suspend', athlete, reason: 'Disciplinary panel' }),
      decideRosterAction({ action: 'reinstate', athlete: { ...athlete, rosterStatus: 'suspended' } }),
      decideRosterAction({ action: 'deactivate', athlete }),
    ];
    for (const decision of cases) {
      expect(decision.ok).toBe(true);
      if (!decision.ok) continue;
      expect(patchIsRosterSafe(decision.patch)).toBe(true);
    }
  });

  it('rejects a patch carrying anything outside the allowlist', () => {
    expect(patchIsRosterSafe({ squadNumber: 9 })).toBe(true);
    expect(patchIsRosterSafe({ squadNumber: 9, goals: 14 })).toBe(false);
    expect(patchIsRosterSafe({ verificationStatus: 'verified' })).toBe(false);
  });
});

describe('squad numbers', () => {
  it('refuses a number already worn in this squad, and names it', () => {
    const decision = decideRosterAction({
      action: 'set_number', athlete, squadNumber: 7,
      squad: [{ athleteId: 'athlete_2', squadNumber: 7 }],
    });
    if (decision.ok) throw new Error('expected refusal');
    expect(decision.reason).toContain('Number 7 already belongs');
  });

  it('lets an athlete keep their own number', () => {
    expect(decideRosterAction({
      action: 'set_number', athlete, squadNumber: 9,
      squad: [{ athleteId: 'athlete_1', squadNumber: 9 }],
    }).ok).toBe(true);
  });

  it('holds numbers to 1-99 whole', () => {
    for (const value of [0, 100, 9.5, Number.NaN]) {
      expect(decideRosterAction({ action: 'set_number', athlete, squadNumber: value }).ok).toBe(false);
    }
  });
});

describe('transfer', () => {
  it('cannot leave the league', () => {
    const decision = decideRosterAction({
      action: 'transfer', athlete, toTeamId: 'other_league_team',
      reason: 'Moved clubs', leagueTeamIds: ['team_home', 'team_away'],
    });
    if (decision.ok) throw new Error('expected refusal');
    expect(decision.reason).toContain('not in this league');
  });

  it('needs a reason, and refuses a move to the same club', () => {
    expect(decideRosterAction({ action: 'transfer', athlete, toTeamId: 'team_away' }).ok).toBe(false);
    const same = decideRosterAction({ action: 'transfer', athlete, toTeamId: 'team_home', reason: 'x y z' });
    if (same.ok) throw new Error('expected refusal');
    expect(same.reason).toContain('already registered to');
  });

  it('does not carry the squad number to the new club', () => {
    const decision = decideRosterAction({
      action: 'transfer', athlete, toTeamId: 'team_away', reason: 'Club transfer agreed',
    });
    if (!decision.ok) throw new Error('expected a plan');
    expect(decision.patch).toEqual({ teamId: 'team_away', squadNumber: 0 });
  });
});

describe('suspension and deactivation', () => {
  it('requires a reason to suspend, because the athlete is told', () => {
    expect(decideRosterAction({ action: 'suspend', athlete }).ok).toBe(false);
    expect(decideRosterAction({ action: 'suspend', athlete, reason: 'Disciplinary panel' }).ok).toBe(true);
  });

  it('refuses to repeat a state the registration is already in', () => {
    expect(decideRosterAction({
      action: 'suspend', athlete: { ...athlete, rosterStatus: 'suspended' }, reason: 'Again',
    }).ok).toBe(false);
    expect(decideRosterAction({ action: 'reinstate', athlete }).ok).toBe(false);
  });

  it('says deactivation keeps the record and the history', () => {
    const decision = decideRosterAction({ action: 'deactivate', athlete });
    if (!decision.ok) throw new Error('expected a plan');
    expect(decision.summary).toContain('match history are kept');
  });
});

describe('roster summary', () => {
  it('counts the states a League Admin acts on', () => {
    expect(summariseRoster([
      { rosterStatus: 'active', verificationStatus: 'verified', userId: 'u1' },
      { rosterStatus: 'active', verificationStatus: 'pending' },
      { rosterStatus: 'suspended', verificationStatus: 'verified', userId: 'u2' },
      { rosterStatus: 'inactive', verificationStatus: 'verified' },
      { verificationStatus: 'verified', userId: 'u3' },
    ])).toEqual({
      total: 5, active: 3, suspended: 1, inactive: 1, registrationIssues: 1, unclaimed: 2,
    });
  });
});
