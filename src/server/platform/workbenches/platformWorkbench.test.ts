import { describe, expect, it } from 'vitest';
import { buildPlatformWorkbenchView, type WorkbenchSourceRow } from './platformWorkbench';

const row = (id: string, data: Record<string, unknown>): WorkbenchSourceRow => ({ id, data });

describe('platform workbench read model', () => {
  it('exposes payee readiness without returning private payout credentials', () => {
    const view = buildPlatformWorkbenchView({
      kind: 'athlete',
      entityId: 'athlete_1',
      tab: 'payee',
      entity: row('athlete_1', { legalName: 'Amina Kato', status: 'pending', teamId: 'team_1' }),
      related: [row('payee_1', {
        athleteId: 'athlete_1',
        status: 'submitted',
        provider: 'mobile_money',
        accountNumber: '256700000000',
        payoutDetails: { phone: '256700000000' },
        evidenceRefs: ['private://identity'],
        updatedAt: '2026-08-27T12:00:00.000Z',
      })],
    });

    expect(view.entity.title).toBe('Amina Kato');
    expect(view.records[0]).toMatchObject({ status: 'submitted' });
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('256700000000');
    expect(serialized).not.toContain('private://identity');
    expect(serialized).not.toContain('payoutDetails');
  });

  it('redacts match session secrets while preserving attributed generation state', () => {
    const view = buildPlatformWorkbenchView({
      kind: 'match',
      entityId: 'match_1',
      tab: 'operations',
      entity: row('match_1', { status: 'live', homeTeamId: 'home', awayTeamId: 'away', scheduledAt: '2026-08-27T12:00:00.000Z' }),
      related: [row('session_1', {
        matchId: 'match_1',
        assignmentId: 'assignment_1',
        sessionGeneration: 3,
        issuedAt: '2026-08-27T12:00:00.000Z',
        expiresAt: '2026-08-27T15:00:00.000Z',
        bootstrapTokenHash: 'secret_bootstrap_hash',
        pinHash: 'secret_pin_hash',
        pinSalt: 'secret_salt',
      })],
    });

    expect(view.records[0].details).toContainEqual({ label: 'Generation', value: '3' });
    expect(JSON.stringify(view)).not.toContain('secret_');
  });

  it('labels audit history immutable', () => {
    const view = buildPlatformWorkbenchView({
      kind: 'league',
      entityId: 'league_1',
      tab: 'history',
      entity: row('league_1', { name: 'Kampala League', lifecycleStatus: 'active' }),
      related: [row('audit_1', { action: 'platform.network.updateLeague', actorUserId: 'operator_1', createdAt: '2026-08-27T12:00:00.000Z' })],
    });

    expect(view.records[0]).toMatchObject({ status: 'immutable' });
  });
});
