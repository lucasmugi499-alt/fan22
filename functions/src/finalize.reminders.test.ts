import { describe, expect, it, vi } from 'vitest';
import { retryStalledFinalizations, sendDueConfirmationReminders, sweepOverdueConfirmations } from './finalize';

/**
 * A Firestore stand-in covering only what the reminder sweep uses: an ordered, cursored
 * submissions query, an accessIndex lookup per team, and a transaction that writes
 * notifications.
 */
function firestore(input: {
  submissions: Record<string, unknown>[];
  accessIndex: Record<string, unknown>[];
}) {
  const written: { id: string; userId: string }[] = [];

  const submissionsQuery = (clauses: [string, string, unknown][] = [], after?: unknown, cap = 200) => ({
    where: (field: string, op: string, value: unknown) => submissionsQuery([...clauses, [field, op, value]], after, cap),
    orderBy: () => submissionsQuery(clauses, after, cap),
    limit: (n: number) => submissionsQuery(clauses, after, n),
    startAfter: (cursor: unknown) => submissionsQuery(clauses, cursor, cap),
    get: async () => {
      let rows = input.submissions.filter((row) =>
        clauses.every(([field, op, value]) => (op === '==' ? row[field] === value : String(row[field]) >= String(value))));
      rows = [...rows].sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)));
      if (after) {
        const index = rows.findIndex((row) => row.id === (after as { id: string }).id);
        rows = rows.slice(index + 1);
      }
      const page = rows.slice(0, cap);
      return {
        empty: page.length === 0,
        size: page.length,
        docs: page.map((row) => ({
          id: String(row.id),
          ref: { id: String(row.id) },
          data: () => row,
        })),
      };
    },
  });

  const accessQuery = (clauses: [string, unknown][] = []) => ({
    where: (field: string, _op: string, value: unknown) => accessQuery([...clauses, [field, value]]),
    get: async () => ({
      docs: input.accessIndex
        .filter((row) => clauses.every(([field, value]) => row[field] === value))
        .map((row) => ({ data: () => row })),
    }),
  });

  const db = {
    collection: (name: string) => {
      if (name === 'accessIndex') return accessQuery();
      if (name === 'notifications') return { doc: (id: string) => ({ id, collectionName: name }) };
      return submissionsQuery();
    },
    runTransaction: async (handler: (tx: unknown) => Promise<unknown>) => handler({
      get: async (ref: { id: string }) => {
        const row = input.submissions.find((item) => item.id === ref.id);
        return { exists: Boolean(row), id: ref.id, data: () => row };
      },
      set: (ref: { id: string }, data: Record<string, unknown>) => {
        written.push({ id: ref.id, userId: String(data.userId) });
      },
      update: vi.fn(),
    }),
  };

  return { db, written };
}

const submittedAt = new Date(Date.now() - 50 * 3_600_000).toISOString();

describe('result confirmation reminders', () => {
  it('notifies the canonical confirmer, not the legacy admin list', async () => {
    /**
     * The defect: recipients came from `team.adminUserIds`, a legacy membership array that
     * carries no authority and goes stale in the worst direction — a revoked operator keeps
     * being told to confirm results for a club they no longer represent, while whoever
     * actually replaced them is never asked.
     */
    const { db, written } = firestore({
      submissions: [{
        id: 'match_1', status: 'pending_confirmation', submittedAt,
        opponentTeamId: 'team_a', remindersSentAt: [],
      }],
      accessIndex: [
        { userId: 'current_operator', scopeType: 'team', scopeId: 'team_a', capabilities: ['team.result.confirm'] },
        { userId: 'wrong_team', scopeType: 'team', scopeId: 'team_b', capabilities: ['team.result.confirm'] },
        { userId: 'no_capability', scopeType: 'team', scopeId: 'team_a', capabilities: ['team.roster.manage'] },
      ],
    });

    await sendDueConfirmationReminders(db as never);

    // A 50-hour-old submission legitimately fires both the 24h and 48h tiers, so assert
    // on who was reached rather than how many times.
    expect([...new Set(written.map((n) => n.userId))]).toEqual(['current_operator']);
  });

  it('does not notify through an expired projection', async () => {
    const { db, written } = firestore({
      submissions: [{
        id: 'match_1', status: 'pending_confirmation', submittedAt,
        opponentTeamId: 'team_a', remindersSentAt: [],
      }],
      accessIndex: [{
        userId: 'lapsed_operator', scopeType: 'team', scopeId: 'team_a',
        capabilities: ['team.result.confirm'],
        expiresAtMillis: Date.now() - 60_000,
      }],
    });

    await sendDueConfirmationReminders(db as never);

    expect(written).toEqual([]);
  });

  it('keeps sweeping when one club has nobody to notify', async () => {
    // A bare `return` here would abort the entire sweep, so every later result would stop
    // getting reminders because one club was misconfigured.
    const { db, written } = firestore({
      submissions: [
        { id: 'match_orphan', status: 'pending_confirmation', submittedAt, opponentTeamId: 'team_none', remindersSentAt: [] },
        { id: 'match_ok', status: 'pending_confirmation', submittedAt: new Date(Date.now() - 49 * 3_600_000).toISOString(), opponentTeamId: 'team_a', remindersSentAt: [] },
      ],
      accessIndex: [
        { userId: 'operator_a', scopeType: 'team', scopeId: 'team_a', capabilities: ['team.result.confirm'] },
      ],
    });

    await sendDueConfirmationReminders(db as never);

    expect(written.map((n) => n.userId)).toContain('operator_a');
  });

  it('reaches records beyond the first page', async () => {
    // Unordered `.limit(200)` let the same first page occupy the window every run, so
    // anything past it starved and its reminders never fired.
    const submissions = Array.from({ length: 205 }, (_, index) => ({
      id: `match_${String(index).padStart(3, '0')}`,
      status: 'pending_confirmation',
      submittedAt: new Date(Date.now() - (50 * 3_600_000) + index * 1000).toISOString(),
      opponentTeamId: 'team_a',
      remindersSentAt: [],
    }));
    const { db, written } = firestore({
      submissions,
      accessIndex: [{ userId: 'operator_a', scopeType: 'team', scopeId: 'team_a', capabilities: ['team.result.confirm'] }],
    });

    await sendDueConfirmationReminders(db as never);

    // Notification ids are `result_<submissionId>_<hour>h_<userId>`; distinct submissions
    // reached is what proves the cursor advanced past the first page.
    const reached = new Set(written.map((n) => n.id.replace(/^result_/, '').replace(/_\d+h_.*$/, '')));
    expect(reached.size).toBeGreaterThan(200);
  });
});

describe('every scheduled sweep pages deterministically', () => {
  /**
   * H11 was only half fixed: the reminder sweep was paginated while
   * `sweepOverdueConfirmations` and `retryStalledFinalizations` still used a bare
   * `.limit(200)`. With no ordering, "the first 200 matching" is whatever Firestore returns,
   * and it can return the same 200 every run — so records past them starve and the work
   * never happens for them. The symptom is not an error; it is a subset of the platform
   * quietly never being processed.
   */
  function pagingDb(count: number, seed: (index: number) => Record<string, unknown>) {
    const rows: Record<string, unknown>[] = Array.from({ length: count }, (_, index) => ({
      id: `doc_${String(index).padStart(4, '0')}`,
      ...seed(index),
    }));
    const seen = new Set<string>();
    const query = (clauses: [string, string, unknown][] = [], order?: string, after?: string, cap = 200) => ({
      where: (f: string, o: string, v: unknown) => query([...clauses, [f, o, v]], order, after, cap),
      orderBy: (field: string) => query(clauses, field, after, cap),
      limit: (n: number) => query(clauses, order, after, n),
      startAfter: (cursor: { id: string }) => query(clauses, order, cursor.id, cap),
      get: async () => {
        let matching = rows.filter((row) => clauses.every(([field, op, value]) =>
          op === '==' ? row[field] === value : op === '<=' ? String(row[field]) <= String(value) : String(row[field]) >= String(value)));
        matching = [...matching].sort((a, b) => String(a.id).localeCompare(String(b.id)));
        if (after) matching = matching.slice(matching.findIndex((row) => row.id === after) + 1);
        const page = matching.slice(0, cap);
        for (const row of page) seen.add(String(row.id));
        return {
          empty: page.length === 0,
          size: page.length,
          docs: page.map((row) => ({
            id: String(row.id),
            ref: {
              id: String(row.id),
              update: vi.fn(async () => undefined),
              set: vi.fn(async () => undefined),
              collection: () => ({ doc: () => ({ set: vi.fn(async () => undefined), create: vi.fn(async () => undefined) }) }),
            },
            data: () => row,
          })),
        };
      },
    });
    const db = {
      collection: () => Object.assign(query(), {
        doc: (id: string) => ({ id, update: vi.fn(async () => undefined), set: vi.fn(async () => undefined) }),
        add: vi.fn(async () => ({ id: 'added' })),
      }),
      runTransaction: async (handler: (tx: unknown) => Promise<unknown>) => handler({
        get: async (ref: { id: string }) => {
          const row = rows.find((item) => item.id === ref.id);
          return { exists: Boolean(row), id: ref.id, data: () => row };
        },
        set: vi.fn(), update: vi.fn(),
      }),
    };
    return { db, seen };
  }

  it('reaches overdue confirmations past the first page', async () => {
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const { db, seen } = pagingDb(205, () => ({
      status: 'pending_confirmation', confirmationDeadline: past, leagueId: 'league_a',
    }));

    await sweepOverdueConfirmations(db as never);

    expect(seen.size).toBeGreaterThan(200);
  });

  it('reaches stalled finalizations past the first page', async () => {
    const { db, seen } = pagingDb(205, () => ({ status: 'confirmed' }));

    await retryStalledFinalizations(db as never, { mode: 'off', canaryAllowlist: [] } as never);

    expect(seen.size).toBeGreaterThan(200);
  });
});
