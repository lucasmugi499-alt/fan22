import { describe, expect, it } from 'vitest';
import {
  applicationEvidence,
  leagueVerificationEvidence,
  operationalExceptionEvidence,
  payeeEvidence,
  reconciliationExceptionEvidence,
  trustEvidence,
} from './caseEvidence';

describe('operational exception evidence', () => {
  const disagreeing = {
    detail: {
      declared: { home: 2, away: 1 },
      reconstructed: { home: 3, away: 1 },
      unsyncedCount: 0,
    },
  };

  it('states the disagreement in this case\'s own numbers', () => {
    const evidence = operationalExceptionEvidence(disagreeing)!;
    expect(evidence.headline).toBe(
      'The field report says 2-1; the recorded events reconstruct to 3-1.',
    );
    expect(evidence.facts).toEqual([
      { label: 'Field report declares', value: '2-1' },
      { label: 'Reconstructed events give', value: '3-1', tone: 'bad' },
    ]);
  });

  it('marks agreement as good rather than crying wolf', () => {
    const evidence = operationalExceptionEvidence({
      detail: { declared: { home: 2, away: 1 }, reconstructed: { home: 2, away: 1 } },
    })!;
    expect(evidence.headline).toContain('agree at 2-1');
    expect(evidence.facts[1].tone).toBe('good');
  });

  it('surfaces events that never reached the server', () => {
    const evidence = operationalExceptionEvidence({ detail: { unsyncedCount: 6 } })!;
    expect(evidence.headline).toBe('6 events from this match never reached the server.');
    expect(evidence.facts).toContainEqual({ label: 'Events never synced', value: '6', tone: 'warn' });
  });

  it('does not report a zero unsynced count as a finding', () => {
    const evidence = operationalExceptionEvidence(disagreeing)!;
    expect(evidence.facts.some((fact) => fact.label === 'Events never synced')).toBe(false);
  });

  it('shows the proposal verbatim, because ratifying what you cannot see is a rubber stamp', () => {
    const evidence = operationalExceptionEvidence({
      ...disagreeing,
      proposedByDisplayName: 'Jane K.',
      proposedResolution: 'Uphold 3-1; one goal was recorded late.',
      proposedAt: '2026-08-20T10:00:00.000Z',
    })!;
    expect(evidence.proposal).toEqual({
      by: 'Jane K.',
      resolution: 'Uphold 3-1; one goal was recorded late.',
      at: '2026-08-20T10:00:00.000Z',
    });
  });

  it('falls back to the user id rather than an anonymous proposal', () => {
    const evidence = operationalExceptionEvidence({
      ...disagreeing,
      proposedByUserId: 'user_9',
      proposedResolution: 'Uphold 3-1.',
    })!;
    expect(evidence.proposal?.by).toBe('user_9');
  });

  it('explains why the proposer cannot ratify their own proposal', () => {
    const evidence = operationalExceptionEvidence({
      ...disagreeing,
      proposedResolution: 'Uphold 3-1.',
      conflictContext: {
        conflictWithMatch: true,
        affiliatedTeamIds: ['team_1'],
        basis: 'declared coach affiliation',
      },
    })!;
    expect(evidence.conflict).toBe(
      'The proposing admin has a declared tie to a club in this match (declared coach affiliation), '
      + 'so they cannot ratify their own proposal.',
    );
  });

  it('says nothing about conflict when none was recorded', () => {
    const evidence = operationalExceptionEvidence({
      ...disagreeing,
      conflictContext: { conflictWithMatch: false, affiliatedTeamIds: [] },
    })!;
    expect(evidence.conflict).toBeUndefined();
  });

  it('withholds everything when the source stored nothing, rather than dressing up a gap', () => {
    expect(operationalExceptionEvidence({})).toBeUndefined();
    expect(operationalExceptionEvidence({ detail: {} })).toBeUndefined();
  });

  it('ignores a half-written score rather than rendering a partial one', () => {
    expect(operationalExceptionEvidence({ detail: { declared: { home: 2 } } })).toBeUndefined();
  });
});

describe('reconciliation exception evidence', () => {
  it('contrasts the submitted score with the reconstruction', () => {
    const evidence = reconciliationExceptionEvidence({
      officialScore: { home: 2, away: 1 },
      eventScore: { home: 3, away: 1 },
    })!;
    expect(evidence.headline).toContain('Submitted 2-1 against 3-1 reconstructed');
    expect(evidence.facts[1].tone).toBe('bad');
  });

  it('reports unattributed scoring and the recorded issues', () => {
    const evidence = reconciliationExceptionEvidence({
      eventScore: { home: 1, away: 0 },
      unattributed: 2,
      issues: ['missing_athlete_attribution', 'late_event'],
    })!;
    expect(evidence.facts).toContainEqual({ label: 'Unattributed scoring', value: '2', tone: 'warn' });
    expect(evidence.facts).toContainEqual({ label: 'Issue', value: 'missing athlete attribution', tone: 'warn' });
  });

  it('withholds when nothing was stored', () => {
    expect(reconciliationExceptionEvidence({})).toBeUndefined();
  });
});

describe('application evidence', () => {
  it('counts the risk flags raised at intake', () => {
    const evidence = applicationEvidence({
      applicantName: 'David O.',
      sport: 'football',
      region: 'Jinja',
      estimatedTeamCount: 14,
      riskFlags: ['suspended_domain_match', 'region_overlap'],
    })!;
    expect(evidence.headline).toBe('2 risk flags were raised at intake.');
    expect(evidence.facts).toContainEqual({ label: 'Estimated clubs', value: '14' });
    expect(evidence.facts).toContainEqual({ label: 'Risk flag', value: 'suspended domain match', tone: 'warn' });
  });

  it('says plainly when nothing was flagged', () => {
    const evidence = applicationEvidence({ applicantName: 'David O.' })!;
    expect(evidence.headline).toBe('No risk flags were raised at intake.');
  });

  it('names the suspected duplicate', () => {
    const evidence = applicationEvidence({
      applicantName: 'David O.',
      duplicateRisk: true,
      duplicateOfLeagueName: 'Jinja Municipal League',
    })!;
    expect(evidence.facts).toContainEqual({
      label: 'Possible duplicate of', value: 'Jinja Municipal League', tone: 'bad',
    });
  });
});

describe('payee evidence', () => {
  it('calls a name mismatch what it is', () => {
    const evidence = payeeEvidence({
      channel: 'Mobile money',
      nameOnAccount: 'E. Okello',
      registeredName: 'Emmanuel Okello',
    })!;
    expect(evidence.headline).toBe('The name on the account does not match the registered name.');
    expect(evidence.facts.find((fact) => fact.label === 'Registered name')?.tone).toBe('bad');
  });

  it('accepts a match regardless of case', () => {
    const evidence = payeeEvidence({
      nameOnAccount: 'emmanuel okello',
      registeredName: 'Emmanuel Okello',
    })!;
    expect(evidence.headline).toBe('The name on the account matches the registered name.');
    expect(evidence.facts.find((fact) => fact.label === 'Registered name')?.tone).toBe('good');
  });

  it('never reformats money, and shows a held total only when one was stored', () => {
    expect(payeeEvidence({ nameOnAccount: 'A', heldAmountLabel: 'UGX 340,000' })!.facts)
      .toContainEqual({ label: 'Held pending attestation', value: 'UGX 340,000', tone: 'warn' });
    expect(payeeEvidence({ nameOnAccount: 'A' })!.facts.some((f) => f.label.includes('Held')))
      .toBe(false);
  });
});

describe('trust evidence', () => {
  it('tones severity without inventing one', () => {
    expect(trustEvidence({ severity: 'Critical', category: 'impersonation' })!.facts)
      .toContainEqual({ label: 'Severity', value: 'Critical', tone: 'bad' });
    expect(trustEvidence({ category: 'impersonation' })!.facts.some((f) => f.label === 'Severity'))
      .toBe(false);
  });

  it('does not repeat the same entity as both reported and affected', () => {
    const evidence = trustEvidence({ reportedEntity: 'Villa SC', affectedEntity: 'Villa SC' })!;
    expect(evidence.facts.filter((fact) => fact.value === 'Villa SC')).toHaveLength(1);
  });

  it('withholds when nothing was stored', () => {
    expect(trustEvidence({})).toBeUndefined();
  });
});

describe('league verification evidence', () => {
  it('flags clubs with no registered athletes, which is what a half-finished import leaves', () => {
    const evidence = leagueVerificationEvidence({
      sport: 'Rugby', city: 'Jinja', status: 'community', teamCount: 10, athleteCount: 0,
    })!;
    expect(evidence.headline).toBe(
      'This league has clubs but no registered athletes, so there is no roster to verify.',
    );
    expect(evidence.facts).toContainEqual({ label: 'Athletes', value: '0', tone: 'warn' });
  });

  it('leads with an empty league over an empty roster', () => {
    const evidence = leagueVerificationEvidence({ teamCount: 0, athleteCount: 0 })!;
    expect(evidence.headline).toBe('This league has no clubs registered.');
    expect(evidence.facts).toContainEqual({ label: 'Clubs', value: '0', tone: 'bad' });
  });

  it('reads plainly for a league that is actually running', () => {
    const evidence = leagueVerificationEvidence({
      sport: 'Football', city: 'Kampala', teamCount: 12, athleteCount: 248, officialMatchCount: 40,
    })!;
    expect(evidence.headline).toBe('Verification raises how this league is presented publicly.');
    expect(evidence.facts).toContainEqual({ label: 'Official results', value: '40', tone: 'good' });
  });

  it('withholds when nothing was stored', () => {
    expect(leagueVerificationEvidence({})).toBeUndefined();
  });
});
