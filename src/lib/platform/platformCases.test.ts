import { describe, expect, it } from 'vitest';
import { orderPlatformCases, type PlatformCase } from './platformCases';

function caseRow(overrides: Partial<PlatformCase> & Pick<PlatformCase, 'id' | 'kind'>): PlatformCase {
  return {
    id: overrides.id,
    kind: overrides.kind,
    title: overrides.id,
    summary: 'Needs an operator decision.',
    status: 'open',
    consequence: 'normal',
    createdAt: '2026-08-20T12:00:00.000Z',
    deadlineAt: null,
    waitingOn: 'Platform operator',
    href: '/admin',
    assignedToUserId: null,
    actions: [],
    sourceCollection: 'test',
    sourceId: overrides.id,
    ...overrides,
  };
}

describe('Platform Desk case ordering', () => {
  it('orders consequence first, then deadline, then oldest case', () => {
    const rows = [
      caseRow({ id: 'normal-old', kind: 'application', createdAt: '2026-08-01T00:00:00.000Z' }),
      caseRow({ id: 'critical-new', kind: 'operational_exception', consequence: 'critical', createdAt: '2026-08-26T00:00:00.000Z' }),
      caseRow({ id: 'high-later', kind: 'trust', consequence: 'high', deadlineAt: '2026-08-29T00:00:00.000Z' }),
      caseRow({ id: 'high-sooner', kind: 'reconciliation_exception', consequence: 'high', deadlineAt: '2026-08-27T00:00:00.000Z' }),
    ];

    expect(orderPlatformCases(rows).map((item) => item.id)).toEqual([
      'critical-new',
      'high-sooner',
      'high-later',
      'normal-old',
    ]);
  });
});
