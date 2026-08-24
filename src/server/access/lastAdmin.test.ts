import { describe, expect, it } from 'vitest';
import { assertLeagueKeepsAnAdmin } from './lastAdmin';

type Doc = { id: string; data: () => Record<string, unknown> };

/**
 * A transaction stub that answers the two reads this rule makes: the league document, and
 * the active assignments in its scope.
 */
function harness(input: { leagueStatus?: string; assignments: Doc[] }) {
  const transaction = {
    get: async (ref: { kind: string }) => {
      if (ref.kind === 'league') {
        return { data: () => (input.leagueStatus ? { status: input.leagueStatus } : {}) };
      }
      return { docs: input.assignments };
    },
  };
  const db = {
    collection: (name: string) => ({
      doc: () => ({ kind: name === 'leagues' ? 'league' : 'doc' }),
      where: () => ({ where: () => ({ where: () => ({ kind: 'assignments' }) }) }),
    }),
  };
  return { db, transaction };
}

function assignment(id: string, overrides: Record<string, unknown> = {}): Doc {
  return {
    id,
    data: () => ({ scopeType: 'league', status: 'active', roleKey: 'league_admin', ...overrides }),
  };
}

const revokeLastAdmin = {
  assignmentId: 'a_1',
  scopeType: 'league',
  scopeId: 'league_1',
  roleKey: 'league_admin',
  nextStatus: 'revoked',
};

describe('a league always keeps an accountable admin', () => {
  it('refuses to revoke the last one', async () => {
    const { db, transaction } = harness({ assignments: [assignment('a_1')] });

    const verdict = await assertLeagueKeepsAnAdmin(db as never, transaction as never, revokeLastAdmin);

    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toContain('last active League Admin');
  });

  it('allows it when another admin remains', async () => {
    const { db, transaction } = harness({ assignments: [assignment('a_1'), assignment('a_2')] });

    expect(await assertLeagueKeepsAnAdmin(db as never, transaction as never, revokeLastAdmin))
      .toEqual({ ok: true });
  });

  it('counts a League Owner as accountable', async () => {
    // The owner can do everything the admin can, so a league holding one is not stranded.
    const { db, transaction } = harness({
      assignments: [assignment('a_1'), assignment('a_owner', { roleKey: 'league_owner' })],
    });

    expect(await assertLeagueKeepsAnAdmin(db as never, transaction as never, revokeLastAdmin))
      .toEqual({ ok: true });
  });

  it('does not count an assignment that is not accountable for the league', async () => {
    const { db, transaction } = harness({
      assignments: [assignment('a_1'), assignment('a_other', { roleKey: 'result_reporter' })],
    });

    expect((await assertLeagueKeepsAnAdmin(db as never, transaction as never, revokeLastAdmin)).ok)
      .toBe(false);
  });

  it.each(['platform_managed', 'suspended'])(
    'permits an unadministered league in %s state, because somebody chose it',
    async (leagueStatus) => {
      const { db, transaction } = harness({ leagueStatus, assignments: [assignment('a_1')] });

      expect(await assertLeagueKeepsAnAdmin(db as never, transaction as never, revokeLastAdmin))
        .toEqual({ ok: true });
    },
  );

  it('does not interfere with reinstating an assignment', async () => {
    const { db, transaction } = harness({ assignments: [] });

    expect(await assertLeagueKeepsAnAdmin(db as never, transaction as never, {
      ...revokeLastAdmin,
      nextStatus: 'active',
    })).toEqual({ ok: true });
  });

  it('ignores scopes that cannot strand a league', async () => {
    const { db, transaction } = harness({ assignments: [] });

    expect(await assertLeagueKeepsAnAdmin(db as never, transaction as never, {
      ...revokeLastAdmin,
      scopeType: 'team',
    })).toEqual({ ok: true });
  });
});
