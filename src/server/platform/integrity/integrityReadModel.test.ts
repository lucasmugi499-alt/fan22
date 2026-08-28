import { describe, expect, it } from 'vitest';
import { buildEscalationRows, buildLiveIntegrityCards, buildQualityDistribution, type IntegritySourceRow } from './integrityReadModel';

const row = (id: string, data: Record<string, unknown>): IntegritySourceRow => ({ id, data });

describe('Platform integrity read model', () => {
  it('reports stored live observations without inventing online presence', () => {
    const cards = buildLiveIntegrityCards({
      matches: [row('match_1', { homeTeamId: 'home', awayTeamId: 'away', status: 'live', scheduledAt: '2026-08-27T12:00:00.000Z' })],
      clocks: [row('clock_1', { matchId: 'match_1', state: 'running', period: '2', sessionGeneration: 3, updatedAt: '2026-08-27T13:02:00.000Z' })],
      assignments: [row('assignment_1', { matchId: 'match_1', fieldManagerId: 'user:operator_1', status: 'in_progress' })],
      sessions: [row('session_1', { matchId: 'match_1', assignmentId: 'assignment_1', sessionGeneration: 3, issuedAt: '2026-08-27T12:10:00.000Z' })],
      reports: [row('report_1', { matchId: 'match_1', status: 'requires_re_attestation', updatedAt: '2026-08-27T13:01:00.000Z' })],
      exceptions: [row('exception_1', { matchId: 'match_1', code: 'late_events_from_revoked_session', status: 'open', blocking: true })],
    });

    expect(cards[0]).toMatchObject({ currentGeneration: 3, operatorLabel: 'user:operator_1', lastObservedAt: '2026-08-27T13:02:00.000Z' });
    expect(cards[0].measuredConditions).toContain('Late events from a revoked session were recorded.');
    expect(cards[0]).not.toHaveProperty('online');
  });

  it('counts only finalizer-stored quality tiers', () => {
    expect(buildQualityDistribution([
      row('f1', { dataQuality: { tier: 'gold' } }),
      row('f2', { dataQuality: { tier: 'silver' } }),
      row('f3', { dataQuality: { tier: 'bronze' } }),
      row('f4', { dataQuality: { tier: 'legacy' } }),
      row('f5', {}),
    ])).toEqual({ gold: 1, silver: 1, bronze: 1, legacy: 1, ungraded: 1, total: 5 });
  });

  it('uses the stored escalation deadline or the seven-day liveness rule', () => {
    const rows = buildEscalationRows([
      row('stored', { matchId: 'match_1', code: 'clock_anomaly', status: 'escalated', createdAt: '2026-08-01T00:00:00.000Z', escalationDeadline: '2026-08-03T00:00:00.000Z' }),
      row('default', { matchId: 'match_2', code: 'result_never_reported', status: 'open', createdAt: '2026-08-10T00:00:00.000Z' }),
    ], new Date('2026-08-20T00:00:00.000Z'));

    expect(rows.find((item) => item.id === 'stored')?.deadlineAt).toBe('2026-08-03T00:00:00.000Z');
    expect(rows.find((item) => item.id === 'default')?.deadlineAt).toBe('2026-08-17T00:00:00.000Z');
    expect(rows.every((item) => item.overdue)).toBe(true);
  });
});
