import { describe, expect, it } from 'vitest';
import { migrateWorkflow, planWorkflowMigration } from './migrate-v1-workflow';
import { matchVerificationFor } from '../../src/lib/resultSubmission';

describe('migrating a stranded V1 workflow', () => {
  it.each(['pending_confirmation', 'confirmation_overdue'])('migrates a %s claim to league resolution', (status) => {
    expect(planWorkflowMigration({ status })).toEqual({ ok: true, from: status, to: 'disputed' });
  });

  /**
   * `disputed` rather than a new state, because the league's resolver already knows how to
   * settle one, and the honest description of an unanswered claim a league must now decide is
   * a dispute.
   */
  it('routes into the workflow the league already has', () => {
    const verdict = planWorkflowMigration({ status: 'pending_confirmation' });

    expect(verdict.ok === true && verdict.to).toBe('disputed');
  });

  it.each(['confirmed', 'disputed', 'official', 'withdrawn', 'rejected'])(
    'refuses a %s claim, which is not waiting on a team',
    (status) => {
      // Migrating one of these would convert a settled or already-league-owned claim into a
      // dispute nobody raised.
      expect(planWorkflowMigration({ status }).ok).toBe(false);
    },
  );

  it('refuses when there is no claim at all', () => {
    expect(planWorkflowMigration(undefined)).toEqual({
      ok: false,
      reason: 'No submission for that match.',
    });
  });
});

/**
 * What migration actually writes.
 *
 * The plan is a pure function and easy to trust; the write is where the two records that
 * describe one fixture can drift apart. `matches.verificationStatus` is derived from the
 * claim's status, and this tool used to move the claim without moving the match — so a
 * migrated fixture read `pending` to every club, every table and the league's own queue while
 * the claim behind it was `disputed` and awaiting adjudication.
 */
describe('what migration writes', () => {
  type Rec = Record<string, unknown>;

  function fakeDb(initial: Record<string, Rec>) {
    const records = new Map(Object.entries(initial));
    const created: Rec[] = [];
    const ref = (path: string): Rec => ({
      path,
      get: async () => ({ exists: records.has(path), data: () => records.get(path) }),
      collection: (name: string) => ({ doc: () => ref(`${path}/${name}/auto`) }),
    });
    const db = {
      collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
      runTransaction: async (callback: (tx: unknown) => unknown) => callback({
        update: (target: Rec, data: Rec) =>
          records.set(String(target.path), { ...(records.get(String(target.path)) ?? {}), ...data }),
        create: (target: Rec, data: Rec) => created.push({ path: target.path, ...data }),
      }),
    };
    return { db, records, created };
  }

  it('moves the match record with the claim', async () => {
    const { db, records } = fakeDb({
      'resultSubmissions/match_1': { status: 'confirmation_overdue', homeScore: 2, awayScore: 1 },
      'matches/match_1': { verificationStatus: 'pending' },
    });

    await migrateWorkflow(db as never, 'match_1', 'Fixture is four months old.', true);

    expect(records.get('resultSubmissions/match_1')).toMatchObject({ status: 'disputed' });
    expect(records.get('matches/match_1')).toMatchObject({
      verificationStatus: matchVerificationFor('disputed'),
    });
  });

  it('never rewrites the claim itself', async () => {
    // Migration changes the governance route. It does not decide sporting truth, and the
    // scores, parties and history of the claim have to survive it untouched.
    const { db, records } = fakeDb({
      'resultSubmissions/match_1': {
        status: 'pending_confirmation',
        homeScore: 3,
        awayScore: 3,
        submittedByTeamId: 'team_a',
        opponentTeamId: 'team_b',
      },
      'matches/match_1': { verificationStatus: 'pending' },
    });

    await migrateWorkflow(db as never, 'match_1', 'Opponent club has folded.', true);

    expect(records.get('resultSubmissions/match_1')).toMatchObject({
      homeScore: 3,
      awayScore: 3,
      submittedByTeamId: 'team_a',
      opponentTeamId: 'team_b',
      workflowMigratedFrom: 'pending_confirmation',
    });
  });

  it('writes nothing at all on a dry run', async () => {
    const { db, records, created } = fakeDb({
      'resultSubmissions/match_1': { status: 'pending_confirmation' },
      'matches/match_1': { verificationStatus: 'pending' },
    });

    await migrateWorkflow(db as never, 'match_1', 'Fixture is four months old.', false);

    expect(records.get('resultSubmissions/match_1')).toEqual({ status: 'pending_confirmation' });
    expect(records.get('matches/match_1')).toEqual({ verificationStatus: 'pending' });
    expect(created).toHaveLength(0);
  });
});
