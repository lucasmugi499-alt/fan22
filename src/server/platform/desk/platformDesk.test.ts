import { describe, expect, it } from 'vitest';
import { assemblePlatformCases } from './platformDesk';

describe('Platform Desk read model', () => {
  it('normalizes every supported open source without admitting closed records', () => {
    const cases = assemblePlatformCases({
      applications: [{ id: 'application_1', data: { leagueName: 'Kampala Juniors', status: 'pending', submittedAt: '2026-08-20T00:00:00.000Z' } }],
      athletes: [{ id: 'athlete_1', data: { name: 'Amina Nankya', verificationStatus: 'pending', createdAt: '2026-08-21T00:00:00.000Z' } }],
      operationalExceptions: [
        { id: 'operation_1', data: { matchId: 'match_1', status: 'open', code: 'unreported_match', blocking: true, createdAt: '2026-08-18T00:00:00.000Z' } },
        { id: 'operation_closed', data: { matchId: 'match_2', status: 'resolved', createdAt: '2026-08-17T00:00:00.000Z' } },
      ],
      reconciliationExceptions: [{ id: 'recon_1', data: { matchId: 'match_3', status: 'open', createdAt: '2026-08-22T00:00:00.000Z' } }],
      trustReports: [{ id: 'trust_1', data: { summary: 'Identity abuse report', status: 'open', severity: 'High', createdAt: '2026-08-19T00:00:00.000Z' } }],
      payees: [{ id: 'athlete_2', data: { status: 'submitted', submittedAt: '2026-08-24T00:00:00.000Z' } }],
      settlements: [{ id: 'settlement_1', data: { status: 'held', reason: 'Reconciliation mismatch', createdAt: '2026-08-23T00:00:00.000Z' } }],
      failedJobs: [{ id: 'finalization_1', data: { status: 'failed', matchId: 'match_4', createdAt: '2026-08-25T00:00:00.000Z' } }],
    }, new Date('2026-08-27T00:00:00.000Z'));

    expect(new Set(cases.map((item) => item.kind))).toEqual(new Set([
      'application', 'athlete_verification', 'operational_exception', 'reconciliation_exception',
      'trust', 'payee', 'held_settlement', 'failed_job',
    ]));
    expect(cases.some((item) => item.sourceId === 'operation_closed')).toBe(false);
    expect(cases.find((item) => item.sourceId === 'operation_1')).toMatchObject({
      consequence: 'critical',
      deadlineAt: '2026-08-25T00:00:00.000Z',
    });
  });

  it('can normalize resolved records for Desk history without leaving actions enabled', () => {
    const cases = assemblePlatformCases({
      applications: [], athletes: [], reconciliationExceptions: [], trustReports: [], payees: [], settlements: [], failedJobs: [],
      operationalExceptions: [{ id: 'operation_closed', data: { matchId: 'match_2', status: 'resolved', createdAt: '2026-08-17T00:00:00.000Z' } }],
    }, new Date('2026-08-27T00:00:00.000Z'), { includeClosed: true });

    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ status: 'resolved', actions: [] });
  });
});
