import { describe, expect, it } from 'vitest';
import { assessApplicationRisk, normalizeApplicationIdentity } from './applicationRisk';

describe('application intake risk triage', () => {
  it('normalizes punctuation and spacing before duplicate comparison', () => {
    expect(normalizeApplicationIdentity(' Kampala  Youth F.C. ')).toBe('kampala youth fc');
  });

  it('raises exact league and applicant duplicates with safe comparison facts', () => {
    const result = assessApplicationRisk({
      application: {
        applicantEmail: 'owner@example.com',
        applicantPhone: '+256 700 000 000',
        leagueName: 'Kampala Youth FC',
        city: 'Kampala',
        evidenceNote: 'We operate twelve youth teams every weekend.',
      },
      candidates: [
        { id: 'league_1', kind: 'league', title: 'Kampala Youth F.C.', city: 'Kampala', status: 'active' },
        { id: 'application_2', kind: 'application', title: 'Jinja Youth League', city: 'Jinja', status: 'pending', applicantEmail: 'OWNER@example.com' },
      ],
    });

    expect(result.riskLevel).toBe('high');
    expect(result.riskFlags).toEqual(expect.arrayContaining(['duplicate_league_name', 'duplicate_applicant_email']));
    expect(result.duplicateCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'league_1', score: 100, reason: 'Exact normalized league name' }),
      expect.objectContaining({ id: 'application_2', reason: 'Same applicant email' }),
    ]));
  });

  it('returns low risk and no duplicate candidates for a distinct complete application', () => {
    const result = assessApplicationRisk({
      application: {
        applicantEmail: 'new@example.com',
        leagueName: 'Mbale Schools Rugby',
        city: 'Mbale',
        evidenceNote: 'The district schools have approved a twelve-team season.',
      },
      candidates: [],
    });

    expect(result).toEqual({ riskLevel: 'low', riskFlags: [], duplicateCandidates: [] });
  });
});
