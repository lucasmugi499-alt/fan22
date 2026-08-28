import { describe, expect, it } from 'vitest';
import {
  NO_MERGE_DEPENDENCIES,
  mergeArchivePatch,
  planMerge,
  resolveMergedId,
  type MergeSubject,
} from './merge';

function subject(id: string, overrides: Partial<MergeSubject> = {}): MergeSubject {
  return {
    id,
    name: `Club ${id}`,
    lifecycleState: 'active',
    leagueId: 'league_1',
    ...overrides,
  };
}

function plan(overrides: Parameters<typeof planMerge>[0] extends never ? never : Partial<Parameters<typeof planMerge>[0]> = {}) {
  return planMerge({
    kind: 'team',
    duplicate: subject('team_dup'),
    survivor: subject('team_keep'),
    dependencies: NO_MERGE_DEPENDENCIES,
    ...overrides,
  });
}

describe('merge refusals', () => {
  it('refuses to merge a record into itself', () => {
    const result = plan({ duplicate: subject('same'), survivor: subject('same') });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refusal');
    expect(result.reason).toContain('into itself');
  });

  it('names the record a duplicate was already merged into', () => {
    const result = plan({ duplicate: subject('team_dup', { mergedIntoId: 'team_other' }) });
    if (result.ok) throw new Error('expected refusal');
    expect(result.reason).toContain('team_other');
  });

  it('redirects when the survivor was itself absorbed', () => {
    const result = plan({ survivor: subject('team_keep', { mergedIntoId: 'team_real' }) });
    if (result.ok) throw new Error('expected refusal');
    expect(result.reason).toContain('team_real');
  });

  it('refuses an archived survivor, and says how to proceed', () => {
    const result = plan({ survivor: subject('team_keep', { lifecycleState: 'archived' }) });
    if (result.ok) throw new Error('expected refusal');
    expect(result.reason).toContain('Restore it first');
  });

  it('refuses to merge a record that is already archived', () => {
    const result = plan({ duplicate: subject('team_dup', { lifecycleState: 'archived' }) });
    if (result.ok) throw new Error('expected refusal');
    expect(result.reason).toContain('already archived');
  });

  it('refuses a cross-league merge unless it is stated explicitly', () => {
    const across = {
      duplicate: subject('team_dup', { leagueId: 'league_1' }),
      survivor: subject('team_keep', { leagueId: 'league_2' }),
    };
    const refused = plan(across);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error('expected refusal');
    expect(refused.reason).toContain('different leagues');

    expect(plan({ ...across, allowCrossLeague: true }).ok).toBe(true);
  });

  it('requires both records to be identified', () => {
    const result = plan({ duplicate: subject('') });
    if (result.ok) throw new Error('expected refusal');
    expect(result.reason).toContain('identified');
  });
});

describe('merge plan', () => {
  it('moves forward-looking references and preserves official history', () => {
    const result = plan({
      dependencies: {
        officialMatches: 12,
        scheduledMatches: 3,
        athletes: 22,
        payments: 2,
        activeAssignments: 1,
      },
    });
    if (!result.ok) throw new Error('expected a plan');

    expect(result.moves).toEqual([
      { what: 'Roster members', count: 22 },
      { what: 'Scheduled fixtures', count: 3 },
      { what: 'Active access assignments', count: 1 },
    ]);
    expect(result.preserved).toEqual([
      { what: 'Official results', count: 12 },
      { what: 'Payments', count: 2 },
    ]);
  });

  it('says plainly that official results are not reattributed', () => {
    const result = plan({ dependencies: { ...NO_MERGE_DEPENDENCIES, officialMatches: 12 } });
    if (!result.ok) throw new Error('expected a plan');
    expect(result.notices.some((notice) =>
      notice.includes('cannot be reattributed'))).toBe(true);
  });

  it('says money is never reassigned', () => {
    const result = plan({ dependencies: { ...NO_MERGE_DEPENDENCIES, payments: 4 } });
    if (!result.ok) throw new Error('expected a plan');
    expect(result.notices.some((notice) => notice.includes('never reassigned'))).toBe(true);
  });

  it('always states that the duplicate is archived rather than deleted', () => {
    const result = plan();
    if (!result.ok) throw new Error('expected a plan');
    expect(result.notices.some((notice) => notice.includes('not deleted'))).toBe(true);
  });

  it('lists nothing to move when nothing is attached', () => {
    const result = plan();
    if (!result.ok) throw new Error('expected a plan');
    expect(result.moves).toEqual([]);
    expect(result.preserved).toEqual([]);
  });

  it('labels an athlete merge in athlete terms', () => {
    const result = planMerge({
      kind: 'athlete',
      duplicate: subject('athlete_dup'),
      survivor: subject('athlete_keep'),
      dependencies: { ...NO_MERGE_DEPENDENCIES, athletes: 2 },
    });
    if (!result.ok) throw new Error('expected a plan');
    expect(result.moves[0].what).toBe('Linked records');
  });
});

describe('resolving a merge pointer', () => {
  it('follows a chain to the surviving record', () => {
    const map = new Map([['a', 'b'], ['b', 'c']]);
    expect(resolveMergedId('a', map)).toBe('c');
  });

  it('returns the id unchanged when nothing was merged', () => {
    expect(resolveMergedId('a', new Map())).toBe('a');
  });

  it('stops on a cycle instead of hanging every surface that resolves an identity', () => {
    const map = new Map([['a', 'b'], ['b', 'a']]);
    expect(['a', 'b']).toContain(resolveMergedId('a', map));
  });

  it('stops at the hop limit on a pathologically long chain', () => {
    const map = new Map(Array.from({ length: 50 }, (_, i) => [`n${i}`, `n${i + 1}`] as const));
    expect(resolveMergedId('n0', map, 3)).toBe('n3');
  });
});

describe('archive patch', () => {
  it('writes one shape every caller can follow', () => {
    expect(mergeArchivePatch({
      survivorId: 'team_keep',
      actorUserId: 'operator_1',
      reason: 'Duplicate registration from two secretaries.',
      at: '2026-08-28T10:00:00.000Z',
    })).toEqual({
      lifecycleStatus: 'archived',
      mergedIntoId: 'team_keep',
      mergedByUserId: 'operator_1',
      mergedReason: 'Duplicate registration from two secretaries.',
      mergedAt: '2026-08-28T10:00:00.000Z',
    });
  });
});
